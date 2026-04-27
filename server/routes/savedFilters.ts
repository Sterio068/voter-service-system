import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { authenticate } from '../middleware/auth'

const VALID_SCOPES = ['voter', 'petition', 'schedule', 'proposal'] as const
type Scope = (typeof VALID_SCOPES)[number]

const PER_USER_SCOPE_LIMIT = 20
const FILTERS_JSON_MAX_BYTES = 4096
const NAME_MAX_LEN = 60

function parseFilters(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  // Only allow plain JSON-serializable objects; reject if oversized.
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return null
  }
  if (Buffer.byteLength(serialized, 'utf8') > FILTERS_JSON_MAX_BYTES) return null
  return value as Record<string, unknown>
}

const ScopeSchema = z.enum(VALID_SCOPES)

const CreateSchema = z.object({
  scope: ScopeSchema,
  name: z.string().trim().min(1, '名稱為必填').max(NAME_MAX_LEN, '名稱過長'),
  filters: z.record(z.string(), z.unknown()),
  is_default: z.boolean().optional(),
})

const UpdateSchema = z.object({
  name: z.string().trim().min(1, '名稱為必填').max(NAME_MAX_LEN, '名稱過長').optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  is_default: z.boolean().optional(),
})

function nowISO(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function clearOtherDefaults(userId: number, scope: Scope, exceptId?: number) {
  if (exceptId === undefined) {
    db.prepare(
      'UPDATE saved_filters SET is_default=0, updated_at=? WHERE user_id=? AND scope=? AND is_default=1'
    ).run(nowISO(), userId, scope)
  } else {
    db.prepare(
      'UPDATE saved_filters SET is_default=0, updated_at=? WHERE user_id=? AND scope=? AND is_default=1 AND id!=?'
    ).run(nowISO(), userId, scope, exceptId)
  }
}

function rowToDto(row: any) {
  let parsed: unknown = {}
  try {
    parsed = row.filters ? JSON.parse(row.filters) : {}
  } catch {
    parsed = {}
  }
  return {
    id: row.id as number,
    scope: row.scope as Scope,
    name: row.name as string,
    filters: parsed,
    is_default: Number(row.is_default) === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export default async function savedFiltersRoutes(fastify: FastifyInstance) {
  // GET /api/saved-filters?scope=<scope>
  fastify.get('/api/saved-filters', { preHandler: [authenticate] }, async (req, reply) => {
    const cu = req.currentUser!
    const q = req.query as { scope?: string }
    const scopeParse = ScopeSchema.safeParse(q.scope)
    if (!scopeParse.success) {
      return reply.code(400).send({ success: false, error: '無效的 scope' })
    }
    const scope = scopeParse.data
    const rows = db
      .prepare(
        'SELECT * FROM saved_filters WHERE user_id=? AND scope=? ORDER BY is_default DESC, name COLLATE NOCASE ASC, id ASC'
      )
      .all(cu.id, scope) as any[]
    return reply.send({ success: true, data: rows.map(rowToDto) })
  })

  // POST /api/saved-filters
  fastify.post('/api/saved-filters', { preHandler: [authenticate] }, async (req, reply) => {
    const cu = req.currentUser!
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const { scope, name, filters, is_default } = parsed.data
    const safeFilters = parseFilters(filters)
    if (!safeFilters) {
      return reply.code(400).send({ success: false, error: '篩選內容過大或格式錯誤' })
    }

    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM saved_filters WHERE user_id=? AND scope=?')
      .get(cu.id, scope) as { c: number }
    if (countRow.c >= PER_USER_SCOPE_LIMIT) {
      return reply.code(400).send({
        success: false,
        error: `每個分類最多只能儲存 ${PER_USER_SCOPE_LIMIT} 組篩選`,
      })
    }

    const trimmedName = name.trim()
    const dup = db
      .prepare('SELECT id FROM saved_filters WHERE user_id=? AND scope=? AND name=?')
      .get(cu.id, scope, trimmedName) as { id: number } | undefined
    if (dup) {
      return reply.code(409).send({ success: false, error: '此名稱已存在' })
    }

    try {
      const tx = db.transaction(() => {
        if (is_default) clearOtherDefaults(cu.id, scope)
        const r = db
          .prepare(
            'INSERT INTO saved_filters (user_id, scope, name, filters, is_default) VALUES (?,?,?,?,?)'
          )
          .run(cu.id, scope, trimmedName, JSON.stringify(safeFilters), is_default ? 1 : 0)
        return r.lastInsertRowid as number
      })
      const newId = tx()
      const row = db.prepare('SELECT * FROM saved_filters WHERE id=?').get(newId) as any
      return reply.code(201).send({ success: true, data: rowToDto(row) })
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.includes('UNIQUE')) {
        return reply.code(409).send({ success: false, error: '此名稱已存在' })
      }
      throw e
    }
  })

  // PUT /api/saved-filters/:id
  fastify.put('/api/saved-filters/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const cu = req.currentUser!
    const { id } = req.params as { id: string }
    const targetId = Number(id)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return reply.code(400).send({ success: false, error: '無效的 ID' })
    }
    const parsed = UpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const existing = db
      .prepare('SELECT * FROM saved_filters WHERE id=? AND user_id=?')
      .get(targetId, cu.id) as any
    if (!existing) {
      return reply.code(404).send({ success: false, error: '篩選不存在' })
    }

    const updates: string[] = []
    const values: unknown[] = []

    if (parsed.data.name !== undefined) {
      const newName = parsed.data.name.trim()
      if (newName !== existing.name) {
        const dup = db
          .prepare('SELECT id FROM saved_filters WHERE user_id=? AND scope=? AND name=? AND id!=?')
          .get(cu.id, existing.scope, newName, targetId) as { id: number } | undefined
        if (dup) {
          return reply.code(409).send({ success: false, error: '此名稱已存在' })
        }
      }
      updates.push('name=?')
      values.push(newName)
    }

    if (parsed.data.filters !== undefined) {
      const safeFilters = parseFilters(parsed.data.filters)
      if (!safeFilters) {
        return reply.code(400).send({ success: false, error: '篩選內容過大或格式錯誤' })
      }
      updates.push('filters=?')
      values.push(JSON.stringify(safeFilters))
    }

    if (parsed.data.is_default !== undefined) {
      updates.push('is_default=?')
      values.push(parsed.data.is_default ? 1 : 0)
    }

    if (updates.length === 0) {
      return reply.send({ success: true, data: rowToDto(existing) })
    }

    updates.push('updated_at=?')
    values.push(nowISO())

    try {
      const tx = db.transaction(() => {
        if (parsed.data.is_default === true) {
          clearOtherDefaults(cu.id, existing.scope as Scope, targetId)
        }
        db.prepare(`UPDATE saved_filters SET ${updates.join(', ')} WHERE id=? AND user_id=?`).run(
          ...values,
          targetId,
          cu.id
        )
      })
      tx()
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.includes('UNIQUE')) {
        return reply.code(409).send({ success: false, error: '此名稱已存在' })
      }
      throw e
    }

    const updated = db.prepare('SELECT * FROM saved_filters WHERE id=?').get(targetId) as any
    return reply.send({ success: true, data: rowToDto(updated) })
  })

  // DELETE /api/saved-filters/:id
  fastify.delete('/api/saved-filters/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const cu = req.currentUser!
    const { id } = req.params as { id: string }
    const targetId = Number(id)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return reply.code(400).send({ success: false, error: '無效的 ID' })
    }
    const existing = db
      .prepare('SELECT id FROM saved_filters WHERE id=? AND user_id=?')
      .get(targetId, cu.id) as { id: number } | undefined
    if (!existing) {
      return reply.code(404).send({ success: false, error: '篩選不存在' })
    }
    db.prepare('DELETE FROM saved_filters WHERE id=? AND user_id=?').run(targetId, cu.id)
    return reply.send({ success: true })
  })
}
