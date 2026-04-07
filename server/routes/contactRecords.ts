import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

export default async function contactRecordRoutes(fastify: FastifyInstance) {
  // GET /api/contact-records?voter_id=X&page=1&pageSize=20
  fastify.get('/api/contact-records', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { voter_id, page = 1, pageSize = 20 } = request.query as any
    const isAdmin = cu.role === 'admin' || cu.role === 'supervisor'
    if (!voter_id && !isAdmin) {
      return reply.code(400).send({ success: false, error: '需提供 voter_id 參數' })
    }
    const conds: string[] = []
    const params: any[] = []
    if (voter_id) { conds.push('c.voter_id=?'); params.push(Number(voter_id)) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM contact_records c ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT c.*, v.name as voter_name, u.name as created_by_name
      FROM contact_records c
      LEFT JOIN voters v ON c.voter_id=v.id
      LEFT JOIN users u ON c.created_by=u.id
      ${where} ORDER BY c.contact_date DESC, c.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page)-1)*Number(pageSize))
    return reply.send({ success: true, data, total })
  })

  // POST /api/contact-records
  fastify.post('/api/contact-records', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.contact_date) return reply.code(400).send({ success: false, error: '聯絡日期為必填' })
    if (!body.content || !String(body.content).trim()) return reply.code(400).send({ success: false, error: '聯絡內容為必填' })
    // Verify voter exists and is active before creating orphaned records
    if (body.voter_id) {
      const voter = db.prepare('SELECT id FROM voters WHERE id=? AND is_active=1').get(Number(body.voter_id))
      if (!voter) return reply.code(404).send({ success: false, error: '選民不存在或已停用' })
    }
    const r = db.prepare(`INSERT INTO contact_records (voter_id,contact_date,contact_type,content,result,result_type,follow_up_date,created_by) VALUES (?,?,?,?,?,?,?,?)`)
      .run(body.voter_id ?? null, body.contact_date, body.contact_type || 'phone', body.content, body.result ?? null, body.result_type ?? null, body.follow_up_date ?? null, cu.id)
    createAuditLog(request, cu.id, { action: 'create', module: '聯絡記錄', target_type: 'contact_record', target_id: r.lastInsertRowid as number, target_name: body.contact_date })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // DELETE /api/contact-records/:id
  fastify.delete('/api/contact-records/:id', { preHandler: [requirePermission('voters', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const row = db.prepare('SELECT * FROM contact_records WHERE id=?').get(Number(id)) as any
    if (!row) return reply.code(404).send({ success: false, error: '記錄不存在' })
    // Only creator or admin/supervisor can delete
    const isPrivileged = cu.role === 'admin' || cu.role === 'supervisor'
    if (!isPrivileged && row.created_by !== cu.id) {
      return reply.code(403).send({ success: false, error: '只能刪除自己建立的聯絡記錄' })
    }
    db.prepare('DELETE FROM contact_records WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '聯絡記錄', target_type: 'contact_record', target_id: Number(id), target_name: row.contact_date })
    return reply.send({ success: true, message: '已刪除' })
  })

  // F-N7: GET /api/contact-records/follow-ups
  fastify.get('/api/contact-records/follow-ups', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10)
    const data = db.prepare(`
      SELECT c.*, v.name as voter_name FROM contact_records c
      LEFT JOIN voters v ON c.voter_id=v.id
      WHERE c.follow_up_date <= ? ORDER BY c.follow_up_date ASC LIMIT 50
    `).all(today)
    return reply.send({ success: true, data })
  })
}
