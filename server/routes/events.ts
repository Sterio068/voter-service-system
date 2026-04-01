import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

export default async function eventRoutes(fastify: FastifyInstance) {
  // GET /api/events
  fastify.get('/api/events', { preHandler: [requirePermission('events', 'view')] }, async (request, reply) => {
    const { status, page = 1, pageSize = 20 } = request.query as any
    const conds = ['e.is_active = 1']
    const params: any[] = []
    if (status) { conds.push('e.status = ?'); params.push(status) }
    const where = 'WHERE ' + conds.join(' AND ')
    const total = (db.prepare(`SELECT COUNT(*) as count FROM events e ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT e.*, u.name as creator_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      ${where}
      ORDER BY e.event_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // GET /api/events/:id
  fastify.get('/api/events/:id', { preHandler: [requirePermission('events', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const event = db.prepare(`
      SELECT e.*, u.name as creator_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ? AND e.is_active = 1
    `).get(Number(id)) as any
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    const participants = db.prepare(`
      SELECT ep.*, v.name as voter_name, v.mobile
      FROM event_participants ep
      LEFT JOIN voters v ON ep.voter_id = v.id
      WHERE ep.event_id = ?
      ORDER BY ep.created_at
    `).all(Number(id))
    return reply.send({ success: true, data: { ...event, participants } })
  })

  // POST /api/events
  fastify.post('/api/events', { preHandler: [requirePermission('events', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.title || !String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '活動標題為必填' })
    }
    if (!body.event_date) {
      return reply.code(400).send({ success: false, error: '活動日期為必填' })
    }
    const fields = ['title', 'event_date', 'end_date', 'location', 'event_type',
      'description', 'organizer', 'capacity', 'status']
    const safeData: Record<string, any> = {}
    for (const k of fields) { if (body[k] !== undefined) safeData[k] = body[k] }
    const cols = Object.keys(safeData)
    const vals = Object.values(safeData)
    const r = db.prepare(
      `INSERT INTO events (${cols.join(',')},created_by) VALUES (${cols.map(() => '?').join(',')},?)`
    ).run(...vals, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '活動管理', target_type: 'event', target_id: newId, target_name: body.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '活動已建立' })
  })

  // PUT /api/events/:id
  fastify.put('/api/events/:id', { preHandler: [requirePermission('events', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND is_active = 1').get(Number(id)) as any
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    const allowedFields = ['title', 'event_date', 'end_date', 'location', 'event_type',
      'description', 'organizer', 'capacity', 'status', 'linked_survey_id']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE events SET ${sets} WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '活動管理', target_type: 'event', target_id: Number(id), target_name: event.title })
    return reply.send({ success: true, message: '活動已更新' })
  })

  // DELETE /api/events/:id (soft delete)
  fastify.delete('/api/events/:id', { preHandler: [requirePermission('events', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND is_active = 1').get(Number(id)) as any
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    db.prepare('UPDATE events SET is_active=0 WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '活動管理', target_type: 'event', target_id: Number(id), target_name: event.title })
    return reply.send({ success: true, message: '活動已刪除' })
  })

  // W-10: GET /api/events/:id/survey-responses
  fastify.get('/api/events/:id/survey-responses', { preHandler: [requirePermission('events', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const event = db.prepare('SELECT * FROM events WHERE id = ? AND is_active = 1').get(Number(id)) as any
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    if (!event.linked_survey_id) {
      return reply.send({ success: true, data: [], message: '此活動未連結問卷' })
    }
    const data = db.prepare(`
      SELECT sr.*, v.name as voter_name
      FROM survey_responses sr
      LEFT JOIN voters v ON sr.voter_id = v.id
      WHERE sr.survey_id = ?
        AND sr.voter_id IN (
          SELECT voter_id FROM event_participants WHERE event_id = ?
        )
      ORDER BY sr.submitted_at DESC
    `).all(event.linked_survey_id, Number(id))
    return reply.send({ success: true, data })
  })

  // GET /api/events/:id/participants
  fastify.get('/api/events/:id/participants', { preHandler: [requirePermission('events', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const event = db.prepare('SELECT id FROM events WHERE id = ? AND is_active = 1').get(Number(id))
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    const data = db.prepare(`
      SELECT ep.*, v.name as voter_name, v.mobile
      FROM event_participants ep
      LEFT JOIN voters v ON ep.voter_id = v.id
      WHERE ep.event_id = ?
      ORDER BY ep.created_at
    `).all(Number(id))
    return reply.send({ success: true, data })
  })

  // POST /api/events/:id/participants (upsert)
  fastify.post('/api/events/:id/participants', { preHandler: [requirePermission('events', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    if (!body.voter_id) return reply.code(400).send({ success: false, error: 'voter_id 為必填' })
    const event = db.prepare('SELECT id FROM events WHERE id = ? AND is_active = 1').get(Number(id))
    if (!event) return reply.code(404).send({ success: false, error: '活動不存在' })
    const existing = db.prepare('SELECT id FROM event_participants WHERE event_id = ? AND voter_id = ?').get(Number(id), Number(body.voter_id)) as any
    if (existing) {
      const sets: string[] = []
      const vals: any[] = []
      if (body.role !== undefined) { sets.push('role=?'); vals.push(body.role) }
      if (body.note !== undefined) { sets.push('note=?'); vals.push(body.note) }
      if (sets.length) {
        db.prepare(`UPDATE event_participants SET ${sets.join(',')} WHERE id=?`).run(...vals, existing.id)
      }
      return reply.send({ success: true, message: '參與者資料已更新' })
    }
    const r = db.prepare(
      'INSERT INTO event_participants (event_id, voter_id, role, note) VALUES (?, ?, ?, ?)'
    ).run(Number(id), Number(body.voter_id), body.role ?? 'participant', body.note ?? null)
    createAuditLog(request, cu.id, { action: 'create', module: '活動管理', target_type: 'event_participant', target_id: Number(r.lastInsertRowid), target_name: `活動${id}` })
    return reply.code(201).send({ success: true, message: '已加入活動' })
  })

  // PUT /api/events/:id/participants/:voter_id
  fastify.put('/api/events/:id/participants/:voter_id', { preHandler: [requirePermission('events', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id, voter_id } = request.params as any
    const body = request.body as any
    const participant = db.prepare('SELECT * FROM event_participants WHERE event_id = ? AND voter_id = ?').get(Number(id), Number(voter_id)) as any
    if (!participant) return reply.code(404).send({ success: false, error: '參與記錄不存在' })
    const safeData: Record<string, any> = {}
    if (body.attendance !== undefined) safeData.attendance = body.attendance
    if (body.note !== undefined) safeData.note = body.note
    if (body.role !== undefined) safeData.role = body.role
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE event_participants SET ${sets} WHERE event_id=? AND voter_id=?`).run(...Object.values(safeData), Number(id), Number(voter_id))
    createAuditLog(request, cu.id, { action: 'update', module: '活動管理', target_type: 'event_participant', target_id: participant.id, target_name: `活動${id}` })
    return reply.send({ success: true, message: '參與資料已更新' })
  })

  // DELETE /api/events/:id/participants/:voter_id
  fastify.delete('/api/events/:id/participants/:voter_id', { preHandler: [requirePermission('events', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id, voter_id } = request.params as any
    const participant = db.prepare('SELECT * FROM event_participants WHERE event_id = ? AND voter_id = ?').get(Number(id), Number(voter_id)) as any
    if (!participant) return reply.code(404).send({ success: false, error: '參與記錄不存在' })
    db.prepare('DELETE FROM event_participants WHERE event_id=? AND voter_id=?').run(Number(id), Number(voter_id))
    createAuditLog(request, cu.id, { action: 'delete', module: '活動管理', target_type: 'event_participant', target_id: participant.id, target_name: `活動${id}` })
    return reply.send({ success: true, message: '已移除參與者' })
  })
}
