import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

export default async function consultationRoutes(fastify: FastifyInstance) {
  // GET /api/consultations?date=YYYY-MM-DD&status=pending
  fastify.get('/api/consultations', { preHandler: [requirePermission('schedules','view')] }, async (req, reply) => {
    const { date, status, page = 1, pageSize = 20 } = req.query as any
    const conds: string[] = []
    const params: any[] = []
    if (date) { conds.push('c.appointment_date=?'); params.push(date) }
    if (status) { conds.push('c.status=?'); params.push(status) }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM consultation_appointments c ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT c.*, v.name as linked_voter_name, u.name as created_by_name
      FROM consultation_appointments c
      LEFT JOIN voters v ON c.voter_id=v.id
      LEFT JOIN users u ON c.created_by=u.id
      ${where} ORDER BY c.appointment_date, c.time_slot LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page)-1)*Number(pageSize))
    return reply.send({ success: true, data, total })
  })

  // GET /api/consultations/today — today's list
  fastify.get('/api/consultations/today', { preHandler: [requirePermission('schedules','view')] }, async (req, reply) => {
    const today = new Date().toISOString().slice(0,10)
    const data = db.prepare(`
      SELECT c.*, v.name as linked_voter_name
      FROM consultation_appointments c LEFT JOIN voters v ON c.voter_id=v.id
      WHERE c.appointment_date=? ORDER BY c.time_slot
    `).all(today)
    return reply.send({ success: true, data })
  })

  // GET /api/consultations/slots?date=YYYY-MM-DD
  fastify.get('/api/consultations/slots', { preHandler: [requirePermission('schedules','view')] }, async (req, reply) => {
    const { date } = req.query as any
    if (!date) return reply.code(400).send({ success: false, error: '日期為必填' })
    const slots = db.prepare('SELECT * FROM consultation_time_slots WHERE slot_date=? AND is_active=1 ORDER BY slot_time').all(date) as any[]
    const bookings = db.prepare("SELECT time_slot, COUNT(*) as booked FROM consultation_appointments WHERE appointment_date=? AND status!='cancelled' GROUP BY time_slot").all(date) as any[]
    const bookingMap: Record<string,number> = {}
    bookings.forEach((b: any) => { bookingMap[b.time_slot] = b.booked })
    const result = slots.map(s => ({ ...s, booked: bookingMap[s.slot_time] || 0, available: s.max_capacity - (bookingMap[s.slot_time] || 0) }))
    return reply.send({ success: true, data: result })
  })

  // POST /api/consultations
  fastify.post('/api/consultations', { preHandler: [requirePermission('schedules','create')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const body = req.body as any
    if (!body.voter_name || !body.appointment_date || !body.time_slot) {
      return reply.code(400).send({ success: false, error: '姓名、日期、時段為必填' })
    }
    // Check capacity
    const count = (db.prepare("SELECT COUNT(*) as c FROM consultation_appointments WHERE appointment_date=? AND time_slot=? AND status!='cancelled'").get(body.appointment_date, body.time_slot) as any).c
    const slot = db.prepare('SELECT max_capacity FROM consultation_time_slots WHERE slot_date=? AND slot_time=?').get(body.appointment_date, body.time_slot) as any
    if (slot && count >= slot.max_capacity) {
      return reply.code(409).send({ success: false, error: '此時段已額滿，請選擇其他時段' })
    }
    const r = db.prepare('INSERT INTO consultation_appointments (voter_id,voter_name,voter_phone,appointment_date,time_slot,issue_summary,status,created_by) VALUES (?,?,?,?,?,?,?,?)').run(body.voter_id ?? null, body.voter_name, body.voter_phone ?? null, body.appointment_date, body.time_slot, body.issue_summary ?? null, 'pending', cu.id)
    createAuditLog(req, cu.id, { action: 'create', module: '法律諮詢', target_type: 'consultation', target_id: r.lastInsertRowid as number, target_name: `${body.voter_name} ${body.appointment_date}` })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // PUT /api/consultations/:id
  fastify.put('/api/consultations/:id', { preHandler: [requirePermission('schedules','edit')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const { id } = req.params as any
    const body = req.body as any
    const appt = db.prepare('SELECT * FROM consultation_appointments WHERE id=?').get(Number(id)) as any
    if (!appt) return reply.code(404).send({ success: false, error: '預約不存在' })
    const allowed = ['status','attorney_note','issue_summary','related_petition_id','voter_phone']
    const data: Record<string,any> = {}
    for (const k of allowed) { if (body[k] !== undefined) data[k] = body[k] }
    if (Object.keys(data).length === 0) return reply.code(400).send({ success: false, error: '無更新欄位' })
    const sets = Object.keys(data).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE consultation_appointments SET ${sets} WHERE id=?`).run(...Object.values(data), Number(id))
    createAuditLog(req, cu.id, { action: 'update', module: '法律諮詢', target_type: 'consultation', target_id: Number(id), target_name: appt.voter_name })
    return reply.send({ success: true, message: '已更新' })
  })

  // POST /api/consultations/slots — create time slot
  fastify.post('/api/consultations/slots', { preHandler: [requirePermission('admin','edit')] }, async (req, reply) => {
    const body = req.body as any
    if (!body.slot_date || !body.slot_time) return reply.code(400).send({ success: false, error: '日期時段為必填' })
    const r = db.prepare('INSERT OR IGNORE INTO consultation_time_slots (slot_date,slot_time,max_capacity,note) VALUES (?,?,?,?)').run(body.slot_date, body.slot_time, body.max_capacity ?? 3, body.note ?? null)
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  // GET /api/consultations/slots/manage?date=YYYY-MM-DD — list for management
  fastify.get('/api/consultations/slots/manage', { preHandler: [requirePermission('admin','view')] }, async (req, reply) => {
    const { date } = req.query as any
    if (!date) return reply.code(400).send({ success: false, error: '日期為必填' })
    const data = db.prepare('SELECT * FROM consultation_time_slots WHERE slot_date=? ORDER BY slot_time').all(date)
    return reply.send({ success: true, data })
  })

  // DELETE /api/consultations/slots/:id
  fastify.delete('/api/consultations/slots/:id', { preHandler: [requirePermission('admin','edit')] }, async (req, reply) => {
    const { id } = req.params as any
    const slot = db.prepare('SELECT * FROM consultation_time_slots WHERE id=?').get(Number(id)) as any
    if (!slot) return reply.code(404).send({ success: false, error: '時段不存在' })
    const booked = (db.prepare("SELECT COUNT(*) as c FROM consultation_appointments WHERE appointment_date=? AND time_slot=? AND status!='cancelled'").get(slot.slot_date, slot.slot_time) as any).c
    if (booked > 0) return reply.code(409).send({ success: false, error: `此時段已有 ${booked} 筆預約，無法刪除` })
    db.prepare('DELETE FROM consultation_time_slots WHERE id=?').run(Number(id))
    return reply.send({ success: true, message: '時段已刪除' })
  })
}
