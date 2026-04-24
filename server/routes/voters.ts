import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// A-3: Address normalization helper
function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return addr ?? null
  return addr
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
}

function normalizeBirthDate(raw: string | undefined): string | undefined {
  if (!raw) return raw
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length === 7) {
    const roc = parseInt(digits.substring(0, 3))
    return `${roc + 1911}-${digits.substring(3, 5)}-${digits.substring(5, 7)}`
  }
  return raw
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mergeTextValues(...values: Array<unknown>): string | null {
  const parts = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
  return parts.length ? parts.join('\n\n') : null
}

function latestDateValue(...values: Array<unknown>): string | null {
  const dates = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

function countRows(sql: string, ...params: any[]): number {
  try {
    return Number((db.prepare(sql).get(...params) as any)?.c || 0)
  } catch {
    return 0
  }
}

function mergeEngagementRecords(targetId: number, sourceId: number): boolean {
  const target = db.prepare('SELECT * FROM voter_engagement WHERE voter_id=?').get(targetId) as any
  const source = db.prepare('SELECT * FROM voter_engagement WHERE voter_id=?').get(sourceId) as any

  if (!source) return false

  if (!target) {
    db.prepare("UPDATE voter_engagement SET voter_id=?, updated_at=datetime('now','localtime') WHERE voter_id=?").run(targetId, sourceId)
    return true
  }

  db.prepare(`
    UPDATE voter_engagement
    SET support_level=?,
        is_key_supporter=?,
        is_volunteer=?,
        activity_count=?,
        last_contact_date=?,
        notes=?,
        updated_at=datetime('now','localtime')
    WHERE voter_id=?
  `).run(
    Math.max(toSafeNumber(target.support_level), toSafeNumber(source.support_level)),
    (toSafeNumber(target.is_key_supporter) || toSafeNumber(source.is_key_supporter)) ? 1 : 0,
    (toSafeNumber(target.is_volunteer) || toSafeNumber(source.is_volunteer)) ? 1 : 0,
    toSafeNumber(target.activity_count) + toSafeNumber(source.activity_count),
    latestDateValue(target.last_contact_date, source.last_contact_date),
    mergeTextValues(target.notes, source.notes),
    targetId,
  )
  db.prepare('DELETE FROM voter_engagement WHERE voter_id=?').run(sourceId)
  return true
}

function mergeDuplicateEventParticipants(targetId: number, sourceId: number): number {
  const duplicates = db.prepare(`
    SELECT
      source.id AS source_id,
      target.id AS target_id,
      source.role AS source_role,
      target.role AS target_role,
      source.attendance AS source_attendance,
      target.attendance AS target_attendance,
      source.note AS source_note,
      target.note AS target_note
    FROM event_participants source
    JOIN event_participants target
      ON target.event_id = source.event_id
     AND target.voter_id = ?
    WHERE source.voter_id = ?
  `).all(targetId, sourceId) as any[]

  const updateParticipant = db.prepare('UPDATE event_participants SET role=?, attendance=?, note=? WHERE id=?')
  const deleteParticipant = db.prepare('DELETE FROM event_participants WHERE id=?')

  duplicates.forEach((row) => {
    const targetRole = String(row.target_role ?? '').trim()
    const sourceRole = String(row.source_role ?? '').trim()
    const mergedRole =
      targetRole && targetRole !== 'participant'
        ? targetRole
        : (sourceRole || targetRole || 'participant')
    updateParticipant.run(
      mergedRole,
      Math.max(toSafeNumber(row.target_attendance), toSafeNumber(row.source_attendance)),
      mergeTextValues(row.target_note, row.source_note),
      row.target_id,
    )
    deleteParticipant.run(row.source_id)
  })

  return duplicates.length
}

function mergeDuplicateGroupMembers(targetId: number, sourceId: number): number {
  const duplicates = db.prepare(`
    SELECT source.id AS source_id, target.id AS target_id, source.role AS source_role, target.role AS target_role
    FROM group_members source
    JOIN group_members target
      ON target.group_id = source.group_id
     AND target.voter_id = ?
    WHERE source.voter_id = ?
  `).all(targetId, sourceId) as any[]

  const updateMember = db.prepare('UPDATE group_members SET role=? WHERE id=?')
  const deleteMember = db.prepare('DELETE FROM group_members WHERE id=?')

  duplicates.forEach((row) => {
    const mergedRole = String(row.target_role ?? '').trim() || String(row.source_role ?? '').trim() || null
    if (mergedRole !== row.target_role) {
      updateMember.run(mergedRole, row.target_id)
    }
    deleteMember.run(row.source_id)
  })

  return duplicates.length
}

const CreateVoterSchema = z.object({
  name: z.string().min(1, '姓名為必填'),
  gender: z.enum(['男','女','其他']).nullable().optional(),
  birth_date: z.string().nullable().optional(),
  id_number: z.string().nullable().optional(),
  mobile: z.string().regex(/^09\d{8}$/, '手機格式不正確（09開頭10碼）').or(z.literal('')).nullable().optional(),
  phone: z.string().nullable().optional(),
  line_id: z.string().nullable().optional(),
  email: z.string().email('Email格式不正確').or(z.literal('')).nullable().optional(),
  household_city: z.string().nullable().optional(),
  household_district: z.string().nullable().optional(),
  household_village: z.string().nullable().optional(),
  household_address: z.string().nullable().optional(),
  mailing_address: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  election_area: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  addr_city: z.string().nullable().optional(),
  addr_district: z.string().nullable().optional(),
  addr_village: z.string().nullable().optional(),
})

interface CreateVoterBody {
  name: string
  gender?: string
  birth_date?: string
  id_number?: string
  mobile?: string
  phone?: string
  line_id?: string
  email?: string
  household_city?: string
  household_district?: string
  household_village?: string
  household_address?: string
  mailing_address?: string
  occupation?: string
  company?: string
  job_title?: string
  election_area?: string
  note?: string
  tags?: string[]
}

/**
 * Valid voter states (is_active × is_blacklisted × merged_into):
 * ACTIVE:      is_active=1, is_blacklisted=0, merged_into=null
 * BLACKLISTED: is_active=1, is_blacklisted=1, merged_into=null  (可查詢但標記)
 * DELETED:     is_active=0, is_blacklisted=0, merged_into=null
 * MERGED:      is_active=0, is_blacklisted=0, merged_into=NUMBER (合併後從記錄)
 * INVALID:     is_active=0 + is_blacklisted=1 (不允許 - 黑名單應保持可查詢)
 */
function validateVoterStateTransition(current: any, update: any): string | null {
  // Prevent soft-delete of blacklisted voter (use de-blacklist first)
  if (update.is_active === 0 && (update.is_blacklisted === 1 || (current.is_blacklisted === 1 && update.is_blacklisted === undefined))) {
    return '黑名單選民不可直接刪除，請先取消黑名單標記'
  }
  return null
}

export default async function voterRoutes(fastify: FastifyInstance) {
  fastify.get('/api/voters', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const _q = request.query as any
    const page = Math.max(1, Number(_q.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(_q.pageSize) || 20))
    const { search, city, district, village, tag, mobile, id_number, is_active = 1, is_blacklisted } = _q
    const conds = ['v.is_active = ?']
    const params: any[] = [Number(is_active) === 0 ? 0 : 1]
    if (search) { const es = escapeLike(search); conds.push("(v.name LIKE ? ESCAPE '\\' OR v.mobile LIKE ? ESCAPE '\\' OR v.phone LIKE ? ESCAPE '\\' OR v.household_address LIKE ? ESCAPE '\\')"); params.push(`%${es}%`,`%${es}%`,`%${es}%`,`%${es}%`) }
    if (city) { conds.push('v.household_city = ?'); params.push(city) }
    if (district) { conds.push('v.household_district = ?'); params.push(district) }
    if (village) { conds.push('v.household_village = ?'); params.push(village) }
    if (mobile) { conds.push('v.mobile = ?'); params.push(String(mobile)) }
    if (id_number) { conds.push('v.id_number = ?'); params.push(String(id_number).toUpperCase()) }
    // F-5: Blacklist filter
    if (is_blacklisted === '1' || is_blacklisted === 1) { conds.push('v.is_blacklisted = 1') }

    if (tag) { conds.push('v.id IN (SELECT voter_id FROM voter_tags WHERE tag = ?)'); params.push(tag) }

    // B-1: tags 欄位搜尋（統一使用 voter_tags 表）
    const { tags: tagsQuery } = request.query as any
    if (tagsQuery) {
      conds.push(`EXISTS (SELECT 1 FROM voter_tags WHERE voter_id=v.id AND tag=?)`)
      params.push(String(tagsQuery))
    }

    const where = `WHERE ${conds.join(' AND ')}`
    const total = (db.prepare(`SELECT COUNT(*) as count FROM voters v ${where}`).get(...params) as any).count
    const voters = db.prepare(`
      SELECT v.*, ve.support_level, ve.is_key_supporter, rv.name as referrer_name
      FROM voters v
      LEFT JOIN voter_engagement ve ON v.id = ve.voter_id
      LEFT JOIN voters rv ON v.referrer_id=rv.id
      ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)) as any[]

    const ids = voters.map(v => v.id)
    let tagMap: Record<number, string[]> = {}
    if (ids.length) {
      const tags = db.prepare(`SELECT * FROM voter_tags WHERE voter_id IN (${ids.map(() => '?').join(',')})`)
        .all(...ids) as any[]
      tags.forEach(t => { if (!tagMap[t.voter_id]) tagMap[t.voter_id] = []; tagMap[t.voter_id].push(t.tag) })
    }

    return reply.send({ success: true, data: voters.map(v => ({ ...v, tags: tagMap[v.id] || [] })), total, page: Number(page), pageSize: Number(pageSize) })
  })

  fastify.get('/api/voters/search', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { q } = request.query as any
    if (!q) return reply.send({ success: true, data: [] })
    const eq = escapeLike(q)
    const results = db.prepare("SELECT id,name,mobile,household_address FROM voters WHERE is_active=1 AND (name LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\') LIMIT 10")
      .all(`%${eq}%`, `%${eq}%`)
    return reply.send({ success: true, data: results })
  })

  fastify.get('/api/voters/:id', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const voter = db.prepare(`
      SELECT v.*, rv.name as referrer_name
      FROM voters v LEFT JOIN voters rv ON v.referrer_id=rv.id
      WHERE v.id=?
    `).get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    const tags = (db.prepare('SELECT tag FROM voter_tags WHERE voter_id = ?').all(Number(id)) as any[]).map(t => t.tag)
    const relations = db.prepare('SELECT * FROM voter_relations WHERE voter_id = ?').all(Number(id))
    return reply.send({ success: true, data: { ...voter, tags, relations } })
  })

  // GET /api/voters/birthdays - voters with birthday in next N days
  fastify.get('/api/voters/birthdays', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { days = 7 } = request.query as any
    const n = Math.min(Math.max(Number(days), 1), 30)

    // Build list of MM-DD strings for the next N days to filter in SQL
    const today = new Date()
    const mdSet: string[] = []
    for (let i = 0; i <= n; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      mdSet.push(`${mm}-${dd}`)
    }

    const placeholders = mdSet.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT id, name, mobile, birth_date,
        SUBSTR(birth_date, 6) as month_day
      FROM voters
      WHERE is_active=1 AND birth_date IS NOT NULL AND LENGTH(birth_date) >= 10
        AND SUBSTR(birth_date, 6) IN (${placeholders})
      ORDER BY SUBSTR(birth_date, 6)
    `).all(...mdSet) as any[]

    const results: any[] = []
    for (const row of rows) {
      const [, mm, dd] = row.birth_date.split('-')
      if (!mm || !dd) continue
      const thisYear = new Date(today.getFullYear(), parseInt(mm)-1, parseInt(dd))
      const nextYear = new Date(today.getFullYear()+1, parseInt(mm)-1, parseInt(dd))
      const target = thisYear >= today ? thisYear : nextYear
      const diffDays = Math.floor((target.getTime() - today.getTime()) / 86400000)
      results.push({ ...row, days_until: diffDays })
    }
    results.sort((a, b) => a.days_until - b.days_until)
    return reply.send({ success: true, data: results })
  })

  // F-N6: GET /api/voters/:id/topics
  fastify.get('/api/voters/:id/topics', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const rows = db.prepare('SELECT topic FROM voter_topics WHERE voter_id=?').all(Number(id))
    return reply.send({ success: true, data: (rows as any[]).map((r: any) => r.topic) })
  })

  // F-N6: PUT /api/voters/:id/topics (replace all topics)
  fastify.put('/api/voters/:id/topics', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const { topics } = request.body as any
    if (!Array.isArray(topics)) return reply.code(400).send({ success: false, error: 'topics must be array' })
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM voter_topics WHERE voter_id=?').run(Number(id))
      const ins = db.prepare('INSERT INTO voter_topics(voter_id,topic) VALUES(?,?)')
      topics.forEach((t: string) => ins.run(Number(id), t))
      db.exec('COMMIT')
    } catch(e) { db.exec('ROLLBACK'); throw e }
    return reply.send({ success: true })
  })

  fastify.post('/api/voters', { preHandler: [requirePermission('voters', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { tags, ...rawData } = request.body as CreateVoterBody & { tags?: string[] }
    const parsed = CreateVoterSchema.safeParse(rawData)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const data = parsed.data
    if (data.birth_date) data.birth_date = normalizeBirthDate(String(data.birth_date))

    // D-8: Email format validation (POST)
    if (data.email !== undefined && data.email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(String(data.email))) {
        return reply.code(400).send({ success: false, error: '電子郵件格式不正確' })
      }
    }

    // A-3: Normalize address fields before INSERT
    if (data.household_city !== undefined) (data as any).household_city = normalizeAddress(data.household_city) ?? data.household_city
    if (data.household_district !== undefined) (data as any).household_district = normalizeAddress(data.household_district) ?? data.household_district
    if (data.household_address !== undefined) (data as any).household_address = normalizeAddress(data.household_address) ?? data.household_address
    if ((data as any).addr_city !== undefined) (data as any).addr_city = normalizeAddress((data as any).addr_city) ?? (data as any).addr_city
    if ((data as any).addr_district !== undefined) (data as any).addr_district = normalizeAddress((data as any).addr_district) ?? (data as any).addr_district
    if ((data as any).addr_village !== undefined) (data as any).addr_village = normalizeAddress((data as any).addr_village) ?? (data as any).addr_village
    // Regenerate household_key from normalized values
    ;(data as any).household_key = (normalizeAddress(data.household_city) ?? '') + (normalizeAddress(data.household_district) ?? '') + (normalizeAddress(data.household_address) ?? '') || null

    // Sanitize: only allow known fields (F-5: added is_blacklisted)
    const allowedFields = ['name','gender','birth_date','id_number','mobile','phone','line_id','email',
      'household_city','household_district','household_village','household_address',
      'mailing_address','occupation','company','job_title','election_area','note',
      'addr_city','addr_district','addr_village','is_blacklisted','household_key']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if ((data as any)[k] !== undefined) safeData[k] = (data as any)[k] }
    const cols = Object.keys(safeData).join(',')
    const vals = Object.values(safeData)
    // 以 transaction 保護選民與標籤的原子性寫入
    const createVoterWithTags = db.transaction(() => {
      const r = db.prepare(`INSERT INTO voters (${cols},created_by) VALUES (${vals.map(() => '?').join(',')},?)`).run(...vals, cu.id)
      const id = r.lastInsertRowid as number
      if (tags?.length) {
        const ins = db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)')
        tags.forEach((t: string) => ins.run(id, t))
      }
      return id
    })
    const newId = createVoterWithTags()
    // F-5: Blacklist audit log
    const bodyAny = request.body as any
    if (bodyAny.is_blacklisted === 1 || bodyAny.is_blacklisted === '1' || bodyAny.is_blacklisted === true) {
      createAuditLog(request, cu.id, { action: 'blacklist', module: '選民管理', target_type: 'voter', target_id: newId, target_name: data.name, detail: '建立時標記為黑名單' } as any)
    }
    createAuditLog(request, cu.id, { action: 'create', module: '選民管理', target_type: 'voter', target_id: newId, target_name: data.name })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '選民資料已建立' })
  })

  fastify.put('/api/voters/:id', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { tags, ...data } = request.body as any
    const voter = db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    if (data.name !== undefined && !String(data.name).trim()) {
      return reply.code(400).send({ success: false, error: '姓名不可為空' })
    }

    // B-2: Validate voter state transition
    const stateError = validateVoterStateTransition(voter, data)
    if (stateError) return reply.code(400).send({ success: false, error: stateError })

    // D-8: Email format validation
    if (data.email !== undefined && data.email !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(String(data.email))) {
        return reply.code(400).send({ success: false, error: '電子郵件格式不正確' })
      }
    }

    // D-9: Support level change requires reason
    if (data.support_level !== undefined) {
      const currentEngagement = db.prepare('SELECT support_level FROM voter_engagement WHERE voter_id=?').get(Number(id)) as any
      const currentLevel = currentEngagement?.support_level
      if (currentLevel !== undefined && Number(data.support_level) !== Number(currentLevel)) {
        if (!data.support_level_reason || !String(data.support_level_reason).trim()) {
          return reply.code(400).send({ success: false, error: '變更支持度時請填寫原因' })
        }
      }
    }

    // D-14: Referrer circular reference prevention
    if (data.referrer_id !== undefined && data.referrer_id !== null) {
      const newReferrerId = Number(data.referrer_id)
      if (newReferrerId === Number(id)) {
        return reply.code(400).send({ success: false, error: '介紹人不可形成循環引用' })
      }
      const newReferrer = db.prepare('SELECT referrer_id FROM voters WHERE id=?').get(newReferrerId) as any
      if (newReferrer && Number(newReferrer.referrer_id) === Number(id)) {
        return reply.code(400).send({ success: false, error: '介紹人不可形成循環引用' })
      }
    }

    // A-3: Normalize address fields in PUT and regenerate household_key if any changed
    const householdAddrFields = ['household_city','household_district','household_address','addr_city','addr_district','addr_village']
    const anyAddrField = householdAddrFields.some(f => data[f] !== undefined)
    if (data.household_city !== undefined) data.household_city = normalizeAddress(data.household_city) ?? data.household_city
    if (data.household_district !== undefined) data.household_district = normalizeAddress(data.household_district) ?? data.household_district
    if (data.household_address !== undefined) data.household_address = normalizeAddress(data.household_address) ?? data.household_address
    if (data.addr_city !== undefined) data.addr_city = normalizeAddress(data.addr_city) ?? data.addr_city
    if (data.addr_district !== undefined) data.addr_district = normalizeAddress(data.addr_district) ?? data.addr_district
    if (data.addr_village !== undefined) data.addr_village = normalizeAddress(data.addr_village) ?? data.addr_village
    if (anyAddrField) {
      const city = data.household_city ?? voter.household_city
      const district = data.household_district ?? voter.household_district
      const address = data.household_address ?? voter.household_address
      data.household_key = (normalizeAddress(city) ?? '') + (normalizeAddress(district) ?? '') + (normalizeAddress(address) ?? '') || null
    }

    // Sanitize: only allow known fields (F-N11: added source, referrer_id; D-2: added addr_*; F-5: is_blacklisted)
    const allowedFields = ['name','gender','birth_date','id_number','mobile','phone','line_id','email',
      'household_city','household_district','household_village','household_address',
      'mailing_address','occupation','company','job_title','election_area','note','source','referrer_id',
      'addr_city','addr_district','addr_village','is_blacklisted','household_key','title']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (data[k] !== undefined) safeData[k] = data[k] }
    if (Object.keys(safeData).length === 0 && tags === undefined) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    // 將欄位更新與標籤更新合併為單一 transaction，避免部分成功
    const updateVoterTxn = db.transaction(() => {
      if (sets) {
        db.prepare(`UPDATE voters SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id))
      } else if (tags !== undefined) {
        db.prepare("UPDATE voters SET updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
      }
      if (tags !== undefined) {
        db.prepare('DELETE FROM voter_tags WHERE voter_id = ?').run(Number(id))
        if (tags.length) {
          const ins = db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)')
          tags.forEach((t: string) => ins.run(Number(id), t))
        }
      }
    })
    updateVoterTxn()
    // D-9: Log support_level change with reason
    if (data.support_level !== undefined) {
      const currentEngagement = db.prepare('SELECT support_level FROM voter_engagement WHERE voter_id=?').get(Number(id)) as any
      const currentLevel = currentEngagement?.support_level
      if (currentLevel !== undefined && Number(data.support_level) !== Number(currentLevel) && data.support_level_reason) {
        createAuditLog(request, cu.id, { action: 'support_level_change', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: voter.name, detail: `支持度從 ${currentLevel} 變更為 ${data.support_level}，原因：${data.support_level_reason}` } as any)
      }
    }

    createAuditLog(request, cu.id, { action: 'update', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: voter.name, before: voter, after: safeData })

    // D-10: Household address sync hint
    const addrFields = ['addr_city','addr_district','addr_village','addr_address']
    const addressChanged = addrFields.some(f => data[f] !== undefined)
    const responseData: Record<string, any> = { success: true, message: '選民資料已更新' }
    if (addressChanged && voter.household_key) {
      const householdCount = (db.prepare('SELECT COUNT(*) as c FROM voters WHERE household_key=? AND id!=? AND is_active=1').get(voter.household_key, Number(id)) as any).c
      responseData.household_sync_hint = true
      responseData.household_member_count = householdCount
    }
    return reply.send(responseData)
  })

  fastify.delete('/api/voters/:id', { preHandler: [requirePermission('voters', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const voter = db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    db.prepare('UPDATE voters SET is_active=0 WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: voter.name })
    return reply.send({ success: true, message: '選民資料已停用' })
  })

  // GET /api/voters/duplicates — find potential duplicate voters
  fastify.get('/api/voters/duplicates', { preHandler: [requirePermission('voters','view')] }, async (request, reply) => {
    // High confidence: same mobile
    const byMobile = db.prepare(`
      SELECT v1.id as id1, v1.name as name1, v2.id as id2, v2.name as name2, v1.mobile, 'high' as confidence
      FROM voters v1 JOIN voters v2 ON v1.mobile=v2.mobile AND v1.id<v2.id
      WHERE v1.is_active=1 AND v2.is_active=1 AND v1.mobile IS NOT NULL AND v1.mobile!=''
      LIMIT 50
    `).all() as any[]

    // High confidence: same id_number
    const byId = db.prepare(`
      SELECT v1.id as id1, v1.name as name1, v2.id as id2, v2.name as name2, v1.id_number, 'high' as confidence
      FROM voters v1 JOIN voters v2 ON v1.id_number=v2.id_number AND v1.id<v2.id
      WHERE v1.is_active=1 AND v2.is_active=1 AND v1.id_number IS NOT NULL AND v1.id_number!=''
      LIMIT 50
    `).all() as any[]

    // Medium: same name + same district
    const byNameArea = db.prepare(`
      SELECT v1.id as id1, v1.name as name1, v2.id as id2, v2.name as name2, v1.household_district, 'medium' as confidence
      FROM voters v1 JOIN voters v2 ON v1.name=v2.name AND v1.household_district=v2.household_district AND v1.id<v2.id
      WHERE v1.is_active=1 AND v2.is_active=1 AND v1.household_district IS NOT NULL AND v1.household_district!=''
      LIMIT 50
    `).all() as any[]

    const all = [...byMobile.map(r=>({...r,reason:'手機重複'})), ...byId.map(r=>({...r,reason:'身分證重複'})), ...byNameArea.map(r=>({...r,reason:'姓名+選區相同'}))]
    return reply.send({ success: true, data: all, counts: { high: byMobile.length + byId.length, medium: byNameArea.length } })
  })

  // POST /api/voters/:id/merge — merge source voter into target
  fastify.post('/api/voters/:id/merge', { preHandler: [requirePermission('voters','delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { merge_from_id } = request.body as any
    if (!merge_from_id) return reply.code(400).send({ success: false, error: 'merge_from_id 為必填' })
    const targetId = Number(id)
    const sourceId = Number(merge_from_id)
    if (targetId === sourceId) return reply.code(400).send({ success: false, error: '不能合併相同選民' })
    const target = db.prepare('SELECT * FROM voters WHERE id=?').get(targetId) as any
    const source = db.prepare('SELECT * FROM voters WHERE id=?').get(sourceId) as any
    if (!target || !source) return reply.code(404).send({ success: false, error: '選民不存在' })

    // Preview mode — 單一查詢取代 N+1 個 COUNT
    const { preview } = request.query as any
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM petitions WHERE voter_id=?) as petitions,
        (SELECT COUNT(*) FROM contact_records WHERE voter_id=?) as contacts,
        (SELECT COUNT(*) FROM tasks WHERE related_voter_id=?) as tasks,
        (SELECT COUNT(*) FROM voter_engagement WHERE voter_id=?) as engagements,
        (SELECT COUNT(*) FROM voter_activity_history WHERE voter_id=?) as activity_history
    `).get(sourceId, sourceId, sourceId, sourceId, sourceId) as any
    const petitions = counts.petitions
    const contacts = counts.contacts
    const tasks = counts.tasks
    const engagements = counts.engagements
    const activityHistory = counts.activity_history

    if (preview === 'true') {
      return reply.send({
        success: true,
        preview: {
          petitions,
          contacts,
          tasks,
          engagements,
          activity_history: activityHistory,
          event_participants: countRows('SELECT COUNT(*) as c FROM event_participants WHERE voter_id=?', sourceId),
          survey_responses: countRows('SELECT COUNT(*) as c FROM survey_responses WHERE voter_id=?', sourceId),
          notification_recipients: countRows('SELECT COUNT(*) as c FROM notification_recipients WHERE voter_id=?', sourceId),
          group_members: countRows('SELECT COUNT(*) as c FROM group_members WHERE voter_id=?', sourceId),
          referrers: countRows('SELECT COUNT(*) as c FROM voters WHERE referrer_id=?', sourceId),
          source_name: source.name,
          target_name: target.name,
        },
      })
    }

    // Count additional affected records for history
    const eventParticipantsCount = countRows('SELECT COUNT(*) as c FROM event_participants WHERE voter_id=?', sourceId)
    const surveyResponsesCount = countRows('SELECT COUNT(*) as c FROM survey_responses WHERE voter_id=?', sourceId)
    const notifRecipientsCount = countRows('SELECT COUNT(*) as c FROM notification_recipients WHERE voter_id=?', sourceId)
    const voterRelationsACount = countRows('SELECT COUNT(*) as c FROM voter_relations WHERE voter_id_a=?', sourceId)
    const voterRelationsBCount = countRows('SELECT COUNT(*) as c FROM voter_relations WHERE voter_id_b=?', sourceId)
    const relatedVoterCount = countRows('SELECT COUNT(*) as c FROM voter_relations WHERE related_voter_id=?', sourceId)
    const groupMembersCount = countRows('SELECT COUNT(*) as c FROM group_members WHERE voter_id=?', sourceId)
    const documentsCount = countRows('SELECT COUNT(*) as c FROM documents WHERE voter_id=?', sourceId)
    const referrerCount = countRows('SELECT COUNT(*) as c FROM voters WHERE referrer_id=?', sourceId)

    // Execute merge in transaction
    db.exec('BEGIN')
    try {
      db.prepare('UPDATE petitions SET voter_id=? WHERE voter_id=?').run(targetId, sourceId)
      db.prepare('UPDATE contact_records SET voter_id=? WHERE voter_id=?').run(targetId, sourceId)
      db.prepare('UPDATE tasks SET related_voter_id=? WHERE related_voter_id=?').run(targetId, sourceId)
      db.prepare('UPDATE voter_activity_history SET voter_id=? WHERE voter_id=?').run(targetId, sourceId)
      const engagementTransferred = mergeEngagementRecords(targetId, sourceId)
      // A-1: Additional FK redirects（只 catch "no such column/table" 這類 schema 差異錯誤，其他錯誤讓 transaction rollback）
      const safeRedirect = (sql: string, ...params: any[]) => {
        try { db.prepare(sql).run(...params) }
        catch (e: any) {
          const msg = String(e?.message || '')
          if (/no such (table|column)/i.test(msg)) return // schema 不存在的舊 DB 容忍
          console.error('[voter merge] redirect failed:', sql, msg)
          throw e
        }
      }
      const mergedDuplicateEventParticipants = mergeDuplicateEventParticipants(targetId, sourceId)
      const mergedDuplicateGroupMembers = mergeDuplicateGroupMembers(targetId, sourceId)
      safeRedirect('UPDATE event_participants SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE survey_responses SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE notification_recipients SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE voter_relations SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE voter_relations SET voter_id_a=? WHERE voter_id_a=?', targetId, sourceId)
      safeRedirect('UPDATE voter_relations SET voter_id_b=? WHERE voter_id_b=?', targetId, sourceId)
      safeRedirect('UPDATE voter_relations SET related_voter_id=? WHERE related_voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE group_members SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE documents SET voter_id=? WHERE voter_id=?', targetId, sourceId)
      safeRedirect('UPDATE voters SET referrer_id=? WHERE referrer_id=?', targetId, sourceId)
      safeRedirect('DELETE FROM voter_relations WHERE voter_id=? AND related_voter_id=?', targetId, targetId)
      safeRedirect('DELETE FROM voter_relations WHERE voter_id_a=? AND voter_id_b=?', targetId, targetId)
      // Soft delete source
      db.prepare("UPDATE voters SET is_active=0, note=COALESCE(note,'') || ' [已合併至選民ID:' || ? || ']' WHERE id=?").run(targetId, sourceId)
      // A-1: Insert into voter_merge_history
      const affectedRecords = JSON.stringify({
        petitions,
        contacts,
        tasks,
        engagements: engagementTransferred ? engagements : 0,
        activity_history: activityHistory,
        event_participants: eventParticipantsCount,
        survey_responses: surveyResponsesCount,
        notification_recipients: notifRecipientsCount,
        voter_relations_a: voterRelationsACount,
        voter_relations_b: voterRelationsBCount,
        related_voter: relatedVoterCount,
        group_members: groupMembersCount,
        documents: documentsCount,
        referrers: referrerCount,
        merged_duplicate_event_participants: mergedDuplicateEventParticipants,
        merged_duplicate_group_members: mergedDuplicateGroupMembers,
      })
      db.prepare('INSERT INTO voter_merge_history(old_voter_id,new_voter_id,merged_by,affected_records) VALUES(?,?,?,?)').run(sourceId, targetId, cu.id, affectedRecords)
      db.exec('COMMIT')
    } catch(e) { db.exec('ROLLBACK'); throw e }

    createAuditLog(request, cu.id, { action: 'update', module: '選民管理', target_type: 'voter', target_id: targetId, target_name: `${source.name} → ${target.name}` })
    return reply.send({
      success: true,
      message: `已將「${source.name}」合併至「${target.name}」`,
      transferred: {
        petitions,
        contacts,
        tasks,
        engagements,
        activity_history: activityHistory,
        event_participants: eventParticipantsCount,
        survey_responses: surveyResponsesCount,
        notification_recipients: notifRecipientsCount,
        group_members: groupMembersCount,
        referrers: referrerCount,
      },
    })
  })

  // D-13: GET /api/voters/:id/activity-history
  fastify.get('/api/voters/:id/activity-history', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const voter = db.prepare('SELECT id FROM voters WHERE id = ?').get(Number(id))
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    const data = db.prepare('SELECT * FROM voter_activity_history WHERE voter_id=? ORDER BY snapshot_date DESC').all(Number(id))
    return reply.send({ success: true, data })
  })

  // GET /api/voters/:id/engagement
  fastify.get('/api/voters/:id/engagement', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const voter = db.prepare('SELECT id FROM voters WHERE id = ?').get(Number(id))
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    let engagement = db.prepare('SELECT * FROM voter_engagement WHERE voter_id = ?').get(Number(id)) as any
    if (!engagement) {
      db.prepare('INSERT OR IGNORE INTO voter_engagement (voter_id) VALUES (?)').run(Number(id))
      engagement = db.prepare('SELECT * FROM voter_engagement WHERE voter_id = ?').get(Number(id))
    }
    return reply.send({ success: true, data: engagement })
  })

  // G-4: DELETE /api/voters/:id/anonymize — PDPA anonymization
  fastify.delete('/api/voters/:id/anonymize', { preHandler: [requirePermission('voters', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { mode = 'anonymize' } = request.query as any
    const voter = db.prepare('SELECT * FROM voters WHERE id=?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })

    // full mode requires admin role
    if (mode === 'full' && cu.role !== 'admin') {
      return reply.code(403).send({ success: false, error: '完整刪除模式需要管理員權限' })
    }

    const timestamp = Date.now()
    db.prepare(`UPDATE voters SET
      name=?,
      id_number=NULL,
      mobile=NULL,
      email=NULL,
      birth_date=NULL,
      household_address=NULL,
      addr_address=NULL,
      household_key=NULL,
      is_active=0,
      updated_at=datetime('now','localtime')
      WHERE id=?`).run(`[已匿名化_${timestamp}]`, Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: mode === 'full' ? `PDPA完整刪除` : `PDPA匿名化` })
    return reply.send({ success: true, message: '選民資料已依個資法匿名化處理' })
  })

  // GET /api/voters/:id/contacts
  fastify.get('/api/voters/:id/contacts', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const voter = db.prepare('SELECT id FROM voters WHERE id = ?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    const data = db.prepare(`
      SELECT c.*, u.name as created_by_name
      FROM contact_records c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.voter_id = ?
      ORDER BY c.contact_date DESC, c.created_at DESC
    `).all(Number(id))
    return reply.send({ success: true, data })
  })

  // POST /api/voters/:id/contacts
  fastify.post('/api/voters/:id/contacts', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const voter = db.prepare('SELECT id,name FROM voters WHERE id = ?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    if (!body.contact_date) return reply.code(400).send({ success: false, error: '聯絡日期為必填' })
    const content = body.content || body.summary || ''
    if (!content.trim()) return reply.code(400).send({ success: false, error: '聯絡內容為必填' })
    const contact_type = body.contact_type || body.contact_method || 'phone'
    const r = db.prepare(
      `INSERT INTO contact_records (voter_id,contact_date,contact_type,content,result,result_type,follow_up_date,created_by) VALUES (?,?,?,?,?,?,?,?)`
    ).run(Number(id), body.contact_date, contact_type, content, body.result ?? null, body.result_type ?? null, body.follow_up_date ?? null, cu.id)
    createAuditLog(request, cu.id, { action: 'create', module: '聯絡記錄', target_type: 'contact_record', target_id: r.lastInsertRowid as number, target_name: voter.name })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // GET /api/voters/:id/relations
  fastify.get('/api/voters/:id/relations', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const voter = db.prepare('SELECT id FROM voters WHERE id=?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    const data = db.prepare(`
      SELECT r.*, v.name as related_name, v.mobile as related_mobile, v.phone as related_phone, v.address as related_address
      FROM voter_relations r
      LEFT JOIN voters v ON r.related_voter_id = v.id
      WHERE r.voter_id = ?
      ORDER BY r.id DESC
    `).all(Number(id))
    return reply.send({ success: true, data })
  })

  // POST /api/voters/:id/relations
  fastify.post('/api/voters/:id/relations', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    if (!body.related_voter_id || !body.relation_type) {
      return reply.code(400).send({ success: false, error: '關聯選民與關係類型為必填' })
    }
    const voter = db.prepare('SELECT id,name FROM voters WHERE id=?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    const related = db.prepare('SELECT id,name FROM voters WHERE id=?').get(Number(body.related_voter_id)) as any
    if (!related) return reply.code(404).send({ success: false, error: '關聯選民不存在' })
    const exists = db.prepare('SELECT id FROM voter_relations WHERE voter_id=? AND related_voter_id=?').get(Number(id), Number(body.related_voter_id))
    if (exists) return reply.code(409).send({ success: false, error: '此關聯已存在' })
    const r = db.prepare('INSERT INTO voter_relations (voter_id,related_voter_id,relation_type,note) VALUES (?,?,?,?)').run(Number(id), Number(body.related_voter_id), body.relation_type, body.note ?? null)
    createAuditLog(request, cu.id, { action: 'create', module: '選民管理', target_type: 'voter_relation', target_id: r.lastInsertRowid as number, target_name: `${voter.name} → ${related.name}` })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // DELETE /api/voters/:id/relations/:rid
  fastify.delete('/api/voters/:id/relations/:rid', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id, rid } = request.params as any
    const rel = db.prepare('SELECT * FROM voter_relations WHERE id=? AND voter_id=?').get(Number(rid), Number(id)) as any
    if (!rel) return reply.code(404).send({ success: false, error: '關聯不存在' })
    db.prepare('DELETE FROM voter_relations WHERE id=?').run(Number(rid))
    createAuditLog(request, cu.id, { action: 'delete', module: '選民管理', target_type: 'voter_relation', target_id: Number(rid), target_name: `關聯 ${rid}` })
    return reply.send({ success: true, message: '關聯已刪除' })
  })

  // PUT /api/voters/:id/engagement
  fastify.put('/api/voters/:id/engagement', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const voter = db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })
    // Upsert engagement record
    db.prepare('INSERT OR IGNORE INTO voter_engagement (voter_id) VALUES (?)').run(Number(id))
    const allowedFields = ['support_level', 'is_key_supporter', 'is_volunteer', 'notes']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE voter_engagement SET ${sets},updated_at=datetime('now','localtime') WHERE voter_id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '選民管理', target_type: 'voter_engagement', target_id: Number(id), target_name: voter.name })
    return reply.send({ success: true, message: '參與度資料已更新' })
  })
}
