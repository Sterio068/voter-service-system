import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import * as XLSX from '@e965/xlsx'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function validateDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(date)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

// P1-2: 統一 ISO 8601 格式，避免 toLocaleString 不一致
function nowISO(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

const VALID_STATUSES = ['pending', 'in_progress', 'passed', 'rejected', 'withdrawn', 'archived']
const VALID_PROPOSAL_TYPES = ['議員提案', '市府提案', '臨時動議', '請願提案']

// P1-1: UPDATE 欄位白名單，防止動態 key 拼入 SQL
const ALLOWED_UPDATE_FIELDS = new Set([
  'session','meeting','proposal_number','proposal_date','title','category',
  'proposal_type','proposer','co_signers','content','status','result',
  'track_note','source_url','related_petition_ids','updated_at'
])

export default async function proposalRoutes(fastify: FastifyInstance) {

  // GET /api/proposals/export
  fastify.get('/api/proposals/export', { preHandler: [requirePermission('proposals', 'export')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const q = req.query as any

    const conds: string[] = ['p.is_active=1']
    const params: any[] = []
    if (q.search && String(q.search).trim()) {
      const s = String(q.search).trim().slice(0, 200)
      conds.push(`(p.title LIKE ? ESCAPE '\\' OR p.proposal_number LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')`)
      const esc = '%' + escapeLike(s) + '%'
      params.push(esc, esc, esc)
    }
    if (q.status && VALID_STATUSES.includes(q.status)) { conds.push('p.status=?'); params.push(q.status) }
    if (q.proposal_type && VALID_PROPOSAL_TYPES.includes(q.proposal_type)) { conds.push('p.proposal_type=?'); params.push(q.proposal_type) }
    if (q.session && String(q.session).trim()) { conds.push(`p.session LIKE ? ESCAPE '\\'`); params.push('%' + escapeLike(String(q.session).trim().slice(0, 100)) + '%') }
    if (q.category && String(q.category).trim()) { conds.push(`p.category LIKE ? ESCAPE '\\'`); params.push('%' + escapeLike(String(q.category).trim().slice(0, 100)) + '%') }
    if (q.proposer && String(q.proposer).trim()) { conds.push(`p.proposer LIKE ? ESCAPE '\\'`); params.push('%' + escapeLike(String(q.proposer).trim().slice(0, 100)) + '%') }

    const where = 'WHERE ' + conds.join(' AND ')
    const rows = db.prepare(`
      SELECT p.*, u.name as created_by_name
      FROM proposals p
      LEFT JOIN users u ON p.created_by=u.id
      ${where} ORDER BY p.proposal_date DESC, p.id DESC LIMIT 5000
    `).all(...params) as any[]

    const STATUS_MAP: Record<string, string> = {
      pending: '待審查', in_progress: '審議中', passed: '通過',
      rejected: '否決', withdrawn: '撤回', archived: '封存'
    }
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const headers = ['提案編號', '提案日期', '主旨', '類別', '提案類型', '屆次', '會議', '提案人', '連署人', '狀態', '審議結果', '來源網址', '追蹤備註', '建立人', '匯出人', '匯出時間']
    const data = rows.map(r => [
      r.proposal_number ?? '', r.proposal_date ?? '', r.title ?? '',
      r.category ?? '', r.proposal_type ?? '', r.session ?? '', r.meeting ?? '',
      r.proposer ?? '', r.co_signers ?? '',
      STATUS_MAP[r.status] || r.status || '',
      r.result ?? '', r.source_url ?? '', r.track_note ?? '',
      r.created_by_name ?? '', cu.name, timestamp,
    ])

    createAuditLog(req, cu.id, { action: 'export', module: '提案追蹤', target_type: 'proposal_export', target_id: 0, target_name: `匯出 ${rows.length} 筆提案` })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!cols'] = headers.map((h, i) => ({ wch: [12, 12, 40, 12, 12, 12, 20, 12, 20, 10, 20, 30, 30, 12, 12, 18][i] || 15 }))
    XLSX.utils.book_append_sheet(wb, ws, '提案追蹤')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''proposals_${new Date().toISOString().slice(0, 10)}.xlsx`)
    return reply.send(buf)
  })

  // P2-2: stats 必須在 /:id 之前宣告，否則被 :id 攔截
  fastify.get('/api/proposals/stats', { preHandler: [requirePermission('proposals', 'view')] }, async (req, reply) => {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM proposals WHERE is_active=1 GROUP BY status
    `).all() as any[]
    const stats: Record<string, number> = {}
    for (const r of rows) stats[r.status] = r.count
    return reply.send({ success: true, data: stats })
  })

  // GET /api/proposals
  fastify.get('/api/proposals', { preHandler: [requirePermission('proposals', 'view')] }, async (req, reply) => {
    const q = req.query as any
    // P2-4: page/pageSize 驗證
    const safePageSize = Math.min(Math.max(1, parseInt(q.pageSize) || 20), 100)
    const safePage = Math.max(1, parseInt(q.page) || 1)

    const conds: string[] = ['p.is_active=1']
    const params: any[] = []

    // P2-3: 搜尋欄位長度限制
    if (q.search && String(q.search).trim()) {
      const s = String(q.search).trim().slice(0, 200)
      conds.push(`(p.title LIKE ? ESCAPE '\\' OR p.proposal_number LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')`)
      const esc = '%' + escapeLike(s) + '%'
      params.push(esc, esc, esc)
    }
    if (q.status && VALID_STATUSES.includes(q.status)) {
      conds.push('p.status=?'); params.push(q.status)
    }
    if (q.proposal_type && VALID_PROPOSAL_TYPES.includes(q.proposal_type)) {
      conds.push('p.proposal_type=?'); params.push(q.proposal_type)
    }
    if (q.session && String(q.session).trim()) {
      conds.push(`p.session LIKE ? ESCAPE '\\'`)
      params.push('%' + escapeLike(String(q.session).trim().slice(0, 100)) + '%')
    }
    if (q.category && String(q.category).trim()) {
      conds.push(`p.category LIKE ? ESCAPE '\\'`)
      params.push('%' + escapeLike(String(q.category).trim().slice(0, 100)) + '%')
    }
    if (q.proposer && String(q.proposer).trim()) {
      conds.push(`p.proposer LIKE ? ESCAPE '\\'`)
      params.push('%' + escapeLike(String(q.proposer).trim().slice(0, 100)) + '%')
    }

    const where = 'WHERE ' + conds.join(' AND ')
    const total = (db.prepare(`SELECT COUNT(*) as count FROM proposals p ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT p.*, u.name as created_by_name
      FROM proposals p
      LEFT JOIN users u ON p.created_by=u.id
      ${where} ORDER BY p.proposal_date DESC, p.id DESC LIMIT ? OFFSET ?
    `).all(...params, safePageSize, (safePage - 1) * safePageSize)

    return reply.send({ success: true, data, total })
  })

  // GET /api/proposals/:id
  fastify.get('/api/proposals/:id', { preHandler: [requirePermission('proposals', 'view')] }, async (req, reply) => {
    const { id } = req.params as any
    const row = db.prepare(`
      SELECT p.*, u.name as created_by_name
      FROM proposals p LEFT JOIN users u ON p.created_by=u.id
      WHERE p.id=? AND p.is_active=1
    `).get(Number(id)) as any
    if (!row) return reply.code(404).send({ success: false, error: '提案不存在' })
    return reply.send({ success: true, data: row })
  })

  // POST /api/proposals
  fastify.post('/api/proposals', { preHandler: [requirePermission('proposals', 'create')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const body = req.body as any
    if (!body.title || !String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '提案主旨為必填' })
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return reply.code(400).send({ success: false, error: '無效的狀態值' })
    }
    if (body.proposal_type && !VALID_PROPOSAL_TYPES.includes(body.proposal_type)) {
      return reply.code(400).send({ success: false, error: '無效的提案類型' })
    }
    if (body.proposal_date && !validateDate(body.proposal_date)) {
      return reply.code(400).send({ success: false, error: '提案日期格式錯誤，需為 YYYY-MM-DD' })
    }
    // P2-1: related_petition_ids 只允許正整數
    const sanitizedIds = (Array.isArray(body.related_petition_ids) ? body.related_petition_ids : [])
      .filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)

    const r = db.prepare(`
      INSERT INTO proposals
        (session, meeting, proposal_number, proposal_date, title, category, proposal_type,
         proposer, co_signers, content, status, result, track_note, source_url,
         related_petition_ids, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      body.session ?? null, body.meeting ?? null, body.proposal_number ?? null,
      body.proposal_date ?? null, String(body.title).trim(),
      body.category ?? null, body.proposal_type ?? '議員提案',
      body.proposer ?? null, body.co_signers ?? null, body.content ?? null,
      body.status ?? 'pending', body.result ?? null, body.track_note ?? null,
      body.source_url ?? null,
      JSON.stringify(sanitizedIds),
      cu.id
    )
    createAuditLog(req, cu.id, { action: 'create', module: '提案追蹤', target_type: 'proposal', target_id: r.lastInsertRowid as number, target_name: String(body.title).trim() })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // PUT /api/proposals/:id
  fastify.put('/api/proposals/:id', { preHandler: [requirePermission('proposals', 'edit')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const { id } = req.params as any
    const body = req.body as any
    const existing = db.prepare('SELECT * FROM proposals WHERE id=? AND is_active=1').get(Number(id)) as any
    if (!existing) return reply.code(404).send({ success: false, error: '提案不存在' })

    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return reply.code(400).send({ success: false, error: '無效的狀態值' })
    }
    if (body.proposal_type !== undefined && !VALID_PROPOSAL_TYPES.includes(body.proposal_type)) {
      return reply.code(400).send({ success: false, error: '無效的提案類型' })
    }
    if (body.proposal_date !== undefined && body.proposal_date && !validateDate(body.proposal_date)) {
      return reply.code(400).send({ success: false, error: '提案日期格式錯誤，需為 YYYY-MM-DD' })
    }

    const fields = ['session','meeting','proposal_number','proposal_date','title','category','proposal_type',
                    'proposer','co_signers','content','status','result','track_note','source_url']
    // P1-2: 使用 ISO 8601 格式
    const data: Record<string, any> = { updated_at: nowISO() }
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f]
    }
    // P2-1: related_petition_ids 只允許正整數
    if (body.related_petition_ids !== undefined) {
      const sanitizedIds = (Array.isArray(body.related_petition_ids) ? body.related_petition_ids : [])
        .filter((v: unknown) => Number.isInteger(v) && (v as number) > 0)
      data.related_petition_ids = JSON.stringify(sanitizedIds)
    }

    // P1-1: 白名單過濾欄位名，防止動態 key 拼入 SQL
    const safeKeys = Object.keys(data).filter(k => ALLOWED_UPDATE_FIELDS.has(k))
    const sets = safeKeys.map(k => `${k}=?`).join(',')
    const vals = safeKeys.map(k => data[k])
    db.prepare(`UPDATE proposals SET ${sets} WHERE id=?`).run(...vals, Number(id))
    createAuditLog(req, cu.id, { action: 'update', module: '提案追蹤', target_type: 'proposal', target_id: Number(id), target_name: existing.title })
    return reply.send({ success: true, message: '提案已更新' })
  })

  // DELETE /api/proposals/:id (soft delete)
  fastify.delete('/api/proposals/:id', { preHandler: [requirePermission('proposals', 'delete')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const { id } = req.params as any
    const existing = db.prepare('SELECT * FROM proposals WHERE id=? AND is_active=1').get(Number(id)) as any
    if (!existing) return reply.code(404).send({ success: false, error: '提案不存在' })
    // P1-2: 使用 ISO 8601 格式
    db.prepare('UPDATE proposals SET is_active=0, updated_at=? WHERE id=?').run(nowISO(), Number(id))
    createAuditLog(req, cu.id, { action: 'delete', module: '提案追蹤', target_type: 'proposal', target_id: Number(id), target_name: existing.title })
    return reply.send({ success: true, message: '提案已刪除' })
  })
}
