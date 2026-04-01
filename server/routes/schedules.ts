import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const CreateScheduleSchema = z.object({
  title: z.string().min(1, '行程標題為必填'),
  start_time: z.string().min(1, '開始時間為必填'),
  end_time: z.string().optional(),
  schedule_type: z.string().optional(),
  location: z.string().optional(),
  note: z.string().optional(),
  status: z.string().optional(),
})

export default async function scheduleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/schedules', { preHandler: [requirePermission('schedules', 'view')] }, async (request, reply) => {
    const { start, end, status, schedule_type } = request.query as any
    const conds: string[] = []
    const params: any[] = []
    if (start) { conds.push('s.start_time >= ?'); params.push(start) }
    if (end) { conds.push('s.start_time <= ?'); params.push(end) }
    if (status) { conds.push('s.status = ?'); params.push(status) }
    if (schedule_type) { conds.push('s.schedule_type = ?'); params.push(schedule_type) }
    conds.push('s.is_active = 1')
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const data = db.prepare(`
      SELECT s.*, u.name as creator_name FROM schedules s LEFT JOIN users u ON s.created_by=u.id
      ${where} ORDER BY s.start_time
    `).all(...params)
    return reply.send({ success: true, data })
  })

  fastify.get('/api/schedules/:id', { preHandler: [requirePermission('schedules', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const s = db.prepare('SELECT * FROM schedules WHERE id=? AND is_active=1').get(Number(id))
    if (!s) return reply.code(404).send({ success: false, error: '行程不存在' })
    return reply.send({ success: true, data: s })
  })

  fastify.post('/api/schedules', { preHandler: [requirePermission('schedules', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const parsedBody = CreateScheduleSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, error: parsedBody.error.issues[0].message })
    }
    const body = request.body as any
    // 衝突偵測
    if (body.start_time && body.end_time) {
      const conflict = db.prepare(`SELECT id, title, start_time, end_time FROM schedules WHERE is_active=1 AND status != 'cancelled' AND start_time < ? AND end_time > ? LIMIT 1`)
        .get(body.end_time, body.start_time) as any
      if (conflict) {
        const startStr = conflict.start_time ? String(conflict.start_time).slice(11, 16) : ''
        const endStr = conflict.end_time ? String(conflict.end_time).slice(11, 16) : ''
        const timeRange = (startStr && endStr) ? ` (${startStr}–${endStr})` : ''
        return reply.code(409).send({ success: false, error: `與行程「${conflict.title}」${timeRange} 發生衝突` })
      }
    }
    const fields = ['title','start_time','end_time','schedule_type','location','attendees','related_voter_ids','related_group_ids','related_petition_id','note','is_recurring','recurrence_rule','status','reminder_minutes']
    const values = fields.map(f => body[f] ?? null)
    const r = db.prepare(`INSERT INTO schedules (${fields.join(',')},created_by) VALUES (${fields.map(()=>'?').join(',')},?)`)
      .run(...values, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '行程管理', target_type: 'schedule', target_id: newId, target_name: body.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '行程已建立' })
  })

  fastify.put('/api/schedules/:id', { preHandler: [requirePermission('schedules', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const s = db.prepare('SELECT * FROM schedules WHERE id=?').get(Number(id)) as any
    if (!s) return reply.code(404).send({ success: false, error: '行程不存在' })
    const allowedFields = ['title','start_time','end_time','schedule_type','location','attendees',
      'related_voter_ids','related_group_ids','related_petition_id','note','is_recurring',
      'recurrence_rule','status','reminder_minutes']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE schedules SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '行程管理', target_type: 'schedule', target_id: Number(id), target_name: s.title })
    return reply.send({ success: true, message: '行程已更新' })
  })

  fastify.delete('/api/schedules/:id', { preHandler: [requirePermission('schedules', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const s = db.prepare('SELECT * FROM schedules WHERE id=?').get(Number(id)) as any
    if (!s) return reply.code(404).send({ success: false, error: '行程不存在' })
    db.prepare("UPDATE schedules SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '行程管理', target_type: 'schedule', target_id: Number(id), target_name: s.title })
    return reply.send({ success: true, message: '行程已刪除' })
  })
}
