import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const CreatePetitionSchema = z.object({
  content: z.string().min(1, '陳情內容為必填').max(5000, '陳情內容最長 5000 字'),
  petition_date: z.string().min(1, '陳情日期為必填'),
  voter_id: z.number().nullable().optional(),
  contact_name: z.string().max(100).nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
  channel: z.string().max(50).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  subcategory: z.string().max(50).nullable().optional(),
  area_city: z.string().max(50).nullable().optional(),
  area_district: z.string().max(50).nullable().optional(),
  area_village: z.string().max(50).nullable().optional(),
  area_address: z.string().max(200).nullable().optional(),
  urgency: z.enum(['normal','urgent','critical']).nullable().optional(),
  assignee_id: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.string().max(30).nullable().optional(),
  source: z.string().optional(),
})

// 產生陳情案件編號（不自帶 transaction，需由呼叫端包裹 transaction 保護）
function generateCaseNumberInTxn(): string {
  const year = new Date().getFullYear()
  const seqName = `petition_${year}`
  const maxRow = db.prepare(
    `SELECT COALESCE(MAX(CAST(SUBSTR(case_number,6) AS INTEGER)),0) AS m FROM petitions WHERE case_number LIKE ?`
  ).get(`${year}-%`) as any
  const currentMax = maxRow?.m ?? 0
  db.prepare(
    "INSERT INTO seq_numbers(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=MAX(value + 1, excluded.value)"
  ).run(seqName, currentMax + 1)
  const row = db.prepare('SELECT value FROM seq_numbers WHERE name=?').get(seqName) as any
  return `${year}-${String(row.value).padStart(5, '0')}`
}

// 公開版本：獨立使用時自帶 IMMEDIATE transaction
function generateCaseNumber(): string {
  return db.transaction(() => generateCaseNumberInTxn()).immediate() as string
}

export default async function petitionRoutes(fastify: FastifyInstance) {
  fastify.get('/api/petitions', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const _q = request.query as any
    const page = Math.max(1, Number(_q.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(_q.pageSize) || 20))
    const { status, category, urgency, assignee_id, start_date, end_date, search, voter_id } = _q
    const conds: string[] = ['p.is_active=1']
    const params: any[] = []
    if (status) { conds.push('p.status = ?'); params.push(status) }
    if (category) { conds.push('p.category = ?'); params.push(category) }
    if (urgency) { conds.push('p.urgency = ?'); params.push(urgency) }
    if (assignee_id) { conds.push('p.assignee_id = ?'); params.push(Number(assignee_id)) }
    if (voter_id) { conds.push('p.voter_id = ?'); params.push(Number(voter_id)) }
    if (start_date && end_date && String(start_date) > String(end_date)) {
      return reply.code(400).send({ success: false, error: '開始日期不可晚於結束日期' })
    }
    if (start_date) { conds.push('p.petition_date >= ?'); params.push(start_date) }
    if (end_date) { conds.push('p.petition_date <= ?'); params.push(end_date) }
    if (search) { conds.push("p.content LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(search)}%`) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM petitions p ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page)-1)*Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // D-11: Satisfaction collection rate stats
  fastify.get('/api/petitions/satisfaction-stats', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const row = db.prepare(`
      SELECT
        COUNT(*) as total_closed,
        COUNT(satisfaction) as collected_satisfaction,
        COUNT(satisfaction_rating) as collected_rating,
        AVG(CASE WHEN satisfaction_rating IS NOT NULL THEN satisfaction_rating END) as avg_rating
      FROM petitions
      WHERE status IN ('closed','replied') AND is_active=1
    `).get() as any
    const total_closed = row.total_closed || 0
    const collected = row.collected_satisfaction || 0
    const collection_rate = total_closed > 0 ? Math.round((collected / total_closed) * 10000) / 100 : 0
    const avg_rating = row.avg_rating !== null ? Math.round((row.avg_rating || 0) * 100) / 100 : null
    return reply.send({ success: true, data: { total_closed, collected, collection_rate, avg_rating } })
  })

  fastify.get('/api/petitions/overdue-count', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10)
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM petitions WHERE is_active=1 AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('closed','cancelled','replied')`
    ).get(today) as any
    return reply.send({ success: true, data: { count: row.count } })
  })

  fastify.get('/api/petitions/stats', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString() } = request.query as any
    if (!/^\d{4}$/.test(String(year))) return reply.code(400).send({ success: false, error: 'year 需為 4 位數年份' })
    const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM petitions WHERE is_active=1 AND strftime('%Y',petition_date)=? GROUP BY status`).all(year)
    const byCategory = db.prepare(`SELECT category, COUNT(*) as count FROM petitions WHERE is_active=1 AND strftime('%Y',petition_date)=? GROUP BY category ORDER BY count DESC`).all(year)
    const byMonth = db.prepare(`SELECT strftime('%m',petition_date) as month, COUNT(*) as count FROM petitions WHERE is_active=1 AND strftime('%Y',petition_date)=? GROUP BY month ORDER BY month`).all(year)
    const byUrgency = db.prepare(`SELECT urgency, COUNT(*) as count FROM petitions WHERE is_active=1 AND strftime('%Y',petition_date)=? GROUP BY urgency`).all(year)
    return reply.send({ success: true, data: { byStatus, byCategory, byMonth, byUrgency } })
  })

  fastify.get('/api/petitions/:id', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const petition = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      WHERE p.id=? AND p.is_active=1
    `).get(Number(id)) as any
    if (!petition) return reply.code(404).send({ success: false, error: '陳情案件不存在' })
    const logs = db.prepare(`
      SELECT pl.*, u.name as created_by_name FROM petition_logs pl LEFT JOIN users u ON pl.created_by=u.id
      WHERE pl.petition_id=? ORDER BY pl.created_at
    `).all(Number(id))
    return reply.send({ success: true, data: { ...petition, logs } })
  })

  fastify.post('/api/petitions', { preHandler: [requirePermission('petitions', 'create')] }, async (request, reply) => {
    const cu = request.currentUser!
    const parsedBody = CreatePetitionSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, error: parsedBody.error.issues[0].message })
    }
    const body = request.body as any

    // 以 IMMEDIATE transaction 保護：自動建立選民 → 生成案件編號 → INSERT 陳情 → INSERT 日誌
    const createPetitionTxn = db.transaction(() => {
      let resolvedVoterId: number | null = body.voter_id ?? null
      let createdVoterName: string | null = null
      let resolvedContactPhone = body.contact_phone?.trim()
        ? String(body.contact_phone).trim()
        : null
      if (!resolvedVoterId && resolvedContactPhone) {
        const phone = resolvedContactPhone
        const found = db.prepare('SELECT id FROM voters WHERE mobile=? AND is_active=1 LIMIT 1').get(phone) as any
        if (found) {
          resolvedVoterId = found.id
        } else if (body.contact_name?.trim()) {
          const vr = db.prepare("INSERT INTO voters (name,mobile,created_by,created_at,updated_at) VALUES (?,?,?,datetime('now','localtime'),datetime('now','localtime'))")
            .run(String(body.contact_name).trim(), phone, cu.id)
          resolvedVoterId = vr.lastInsertRowid as number
          createdVoterName = String(body.contact_name).trim()
        }
      }
      if (resolvedVoterId && !resolvedContactPhone) {
        const voter = db.prepare('SELECT mobile, phone FROM voters WHERE id=? AND is_active=1 LIMIT 1').get(resolvedVoterId) as any
        resolvedContactPhone = voter?.mobile || voter?.phone || null
      }
      const caseNumber = generateCaseNumberInTxn()
      const fields = ['case_number','petition_date','voter_id','contact_phone','channel','category','subcategory','content','area_city','area_district','area_village','area_address','urgency','status','assignee_id']
      const values = fields.map(f => {
        if (f === 'case_number') return caseNumber
        if (f === 'voter_id') return resolvedVoterId
        if (f === 'contact_phone') return resolvedContactPhone
        if (f === 'urgency') return body.urgency ?? 'normal'
        if (f === 'status') return body.status ?? 'pending'
        return body[f] ?? null
      })
      const r = db.prepare(`INSERT INTO petitions (${fields.join(',')},created_by) VALUES (${fields.map(() => '?').join(',')},?)`)
        .run(...values, cu.id)
      const newId = r.lastInsertRowid as number
      db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,created_by) VALUES (?,?,?,?)")
        .run(newId, '受理', `案件受理，陳情方式：${body.channel || '未指定'}`, cu.id)
      return { newId, caseNumber, resolvedVoterId, createdVoterName }
    })
    const { newId, caseNumber, resolvedVoterId, createdVoterName } = createPetitionTxn.immediate() as { newId: number; caseNumber: string; resolvedVoterId: number | null; createdVoterName: string | null }
    if (createdVoterName && resolvedVoterId) {
      createAuditLog(request, cu.id, { action: 'create', module: '選民管理', target_type: 'voter', target_id: resolvedVoterId, target_name: createdVoterName })
    }
    createAuditLog(request, cu.id, { action: 'create', module: '陳情管理', target_type: 'petition', target_id: newId, target_name: caseNumber })
    return reply.code(201).send({ success: true, data: { id: newId, case_number: caseNumber, voter_id: resolvedVoterId }, message: '陳情案件已建立' })
  })

  fastify.put('/api/petitions/:id', { preHandler: [requirePermission('petitions', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const body = request.body as any
    const petition = db.prepare('SELECT * FROM petitions WHERE id=? AND is_active=1').get(Number(id)) as any
    if (!petition) return reply.code(404).send({ success: false, error: '陳情案件不存在' })
    // Only allow known updateable fields
    const allowedFields = ['status','urgency','assignee_id','satisfaction','satisfaction_rating','category','subcategory',
      'channel','content','area_city','area_district','area_village','area_address','petition_date','voter_id',
      'contact_phone','due_date','source','result_type','follow_up_date','follow_up_note']
    const updateData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) updateData[k] = body[k] }

    // D-N2: State machine validation
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      pending: ['processing', 'cancelled'],
      processing: ['waiting_external', 'waiting_applicant', 'replied', 'closed', 'cancelled'],
      waiting_external: ['processing', 'replied', 'closed', 'cancelled'],
      waiting_applicant: ['processing', 'replied', 'closed', 'cancelled'],
      replied: ['closed', 'processing', 'cancelled'],
      closed: ['processing'],
      cancelled: ['pending'],
    }
    if (body.status && body.status !== petition.status) {
      const allowed = ALLOWED_TRANSITIONS[petition.status] || []
      if (!allowed.includes(body.status)) {
        return reply.code(400).send({ success: false, error: `狀態不可從「${petition.status}」直接變更為「${body.status}」` })
      }
    }

    if (body.satisfaction_rating !== undefined && body.satisfaction_rating !== null) {
      const r = Number(body.satisfaction_rating)
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return reply.code(400).send({ success: false, error: '滿意度評分必須為 1–5 的整數' })
      }
    }

    if (body.status === 'closed' && petition.status !== 'closed') {
      // 用 SQLite localtime，避免與其他欄位時區不一致
      updateData.closed_at = (db.prepare("SELECT datetime('now','localtime') AS t").get() as any).t
    }
    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(updateData).map(k => `${k}=?`).join(',')
    // 將陳情更新、任務轉派、日誌、通知包成單一 transaction 保證一致性
    const updatePetitionTxn = db.transaction(() => {
      db.prepare(`UPDATE petitions SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(updateData), Number(id))

      // W-7: Auto-transfer tasks when assignee_id changed
      if (updateData.assignee_id !== undefined && updateData.assignee_id !== petition.assignee_id) {
        const newAssigneeId = updateData.assignee_id
        const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as any[]
        const hasAssigneeCol = taskCols.some((c: any) => c.name === 'assignee_id')
        if (hasAssigneeCol) {
          db.prepare(`
            UPDATE tasks SET assignee_id=?, updated_at=datetime('now','localtime')
            WHERE related_petition_id=? AND status NOT IN ('done','cancelled')
          `).run(newAssigneeId, Number(id))
        }
        db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,created_by) VALUES (?,?,?,?)")
          .run(Number(id), '重新分派', `案件已重新分派，承辦人變更`, cu.id)

        if (body.assignee_id && body.assignee_id !== petition.assignee_id) {
          db.prepare(`INSERT INTO notifications(channel,status,title,content,created_by,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
            .run('app', 'sent', '新案件指派', `案件 ${petition.case_number} 已指派給您，請盡快處理。`, cu.id)
        }
      }
    })
    updatePetitionTxn()

    createAuditLog(request, cu.id, { action: 'update', module: '陳情管理', target_type: 'petition', target_id: Number(id), target_name: petition.case_number, before: petition, after: updateData })
    return reply.send({ success: true, message: '陳情案件已更新' })
  })

  fastify.post('/api/petitions/:id/logs', { preHandler: [requirePermission('petitions', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const { action_type, content, referred_to } = request.body as any
    if (!action_type) return reply.code(400).send({ success: false, error: '處理方式為必填' })
    const VALID_ACTION_TYPES = ['受理', '轉介', '回覆', '結案', '追蹤', '重新分派', '備註', '補充', '電話聯絡', '親訪']
    if (!VALID_ACTION_TYPES.includes(action_type)) {
      return reply.code(400).send({ success: false, error: `無效的處理方式，允許值：${VALID_ACTION_TYPES.join('、')}` })
    }
    if (!content || !String(content).trim()) return reply.code(400).send({ success: false, error: '處理內容為必填' })
    const petition = db.prepare('SELECT * FROM petitions WHERE id=?').get(Number(id)) as any
    if (!petition) return reply.code(404).send({ success: false, error: '陳情案件不存在' })
    const r = db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,referred_to,created_by) VALUES (?,?,?,?,?)")
      .run(Number(id), action_type, content, referred_to ?? null, cu.id)
    createAuditLog(request, cu.id, { action: 'create', module: '陳情管理', target_type: 'petition_log', target_id: Number(id), target_name: `${petition.case_number} - ${action_type}` })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // F-N5: Petition follow-up date list
  fastify.get('/api/petitions/follow-ups', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10)
    const data = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      WHERE p.is_active=1 AND p.follow_up_date <= ? AND p.status NOT IN ('closed','cancelled')
      ORDER BY p.follow_up_date ASC LIMIT 50
    `).all(today)
    return reply.send({ success: true, data })
  })

  // 刪除陳情案件（軟刪除，保留紀錄與關聯資料）
  fastify.delete('/api/petitions/:id', { preHandler: [requirePermission('petitions', 'delete')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const petition = db.prepare('SELECT * FROM petitions WHERE id=? AND is_active=1').get(Number(id)) as any
    if (!petition) return reply.code(404).send({ success: false, error: '陳情案件不存在' })
    db.prepare("UPDATE petitions SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '陳情管理', target_type: 'petition', target_id: Number(id), target_name: petition.case_number })
    return reply.send({ success: true, message: '陳情案件已刪除' })
  })
}
