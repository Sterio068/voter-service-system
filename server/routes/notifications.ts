import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const CreateNotificationSchema = z.object({
  title: z.string().min(1, '通知標題為必填').max(200, '通知標題過長'),
  content: z.string().min(1, '通知內容為必填').max(2000, '通知內容過長'),
  channel: z.string().max(30).nullable().optional(),
  target_type: z.string().max(30).nullable().optional(),
  target_filter: z.string().max(2000).nullable().optional(),
})

const UpdateNotificationSchema = z.object({
  title: z.string().min(1, '通知標題不可為空').max(200, '通知標題過長').optional(),
  content: z.string().min(1, '通知內容不可為空').max(2000, '通知內容過長').optional(),
  channel: z.string().max(30).nullable().optional(),
  target_type: z.string().max(30).nullable().optional(),
  target_filter: z.string().max(2000).nullable().optional(),
})

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET /api/notifications
  fastify.get('/api/notifications', { preHandler: [requirePermission('notifications', 'view')] }, async (request, reply) => {
    const { page = 1, pageSize = 20 } = request.query as any
    const total = (db.prepare('SELECT COUNT(*) as count FROM notifications').get() as any).count
    const data = db.prepare(`
      SELECT n.*, u.name as creator_name
      FROM notifications n
      LEFT JOIN users u ON n.created_by = u.id
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(pageSize), (Number(page) - 1) * Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // POST /api/notifications (create draft)
  fastify.post('/api/notifications', { preHandler: [requirePermission('notifications', 'create')] }, async (request, reply) => {
    const cu = request.currentUser!
    const parsed = CreateNotificationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '通知標題為必填' })
    }
    if (!String(body.content).trim()) {
      return reply.code(400).send({ success: false, error: '通知內容為必填' })
    }
    const fields = ['title', 'content', 'channel', 'target_type', 'target_filter']
    const safeData: Record<string, any> = {}
    for (const k of fields) { if (body[k] !== undefined) safeData[k] = body[k] }
    const cols = Object.keys(safeData)
    const vals = Object.values(safeData)
    const r = db.prepare(
      `INSERT INTO notifications (${cols.join(',')},created_by) VALUES (${cols.map(() => '?').join(',')},?)`
    ).run(...vals, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '通知管理', target_type: 'notification', target_id: newId, target_name: body.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '通知草稿已建立' })
  })

  // PUT /api/notifications/:id (edit draft)
  fastify.put('/api/notifications/:id', { preHandler: [requirePermission('notifications', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const parsed = UpdateNotificationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(id)) as any
    if (!notification) return reply.code(404).send({ success: false, error: '通知不存在' })
    if (notification.status !== 'draft') return reply.code(400).send({ success: false, error: '只能編輯草稿狀態的通知' })
    const allowed = ['title', 'content', 'channel', 'target_type', 'target_filter']
    const data: Record<string, any> = {}
    for (const k of allowed) { if (body[k] !== undefined) data[k] = body[k] }
    if (Object.keys(data).length === 0) return reply.code(400).send({ success: false, error: '無更新欄位' })
    const sets = Object.keys(data).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE notifications SET ${sets} WHERE id=?`).run(...Object.values(data), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '通知管理', target_type: 'notification', target_id: Number(id), target_name: body.title ?? notification.title })
    return reply.send({ success: true, message: '通知已更新' })
  })

  // POST /api/notifications/:id/send
  fastify.post('/api/notifications/:id/send', { preHandler: [requirePermission('notifications', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(id)) as any
    if (!notification) return reply.code(404).send({ success: false, error: '通知不存在' })
    if (notification.status !== 'draft') {
      return reply.code(400).send({ success: false, error: '只能發送草稿狀態的通知' })
    }
    const SUPPORTED_TARGET_TYPES = ['all']
    if (!SUPPORTED_TARGET_TYPES.includes(notification.target_type)) {
      return reply.code(400).send({ success: false, error: `不支援的目標類型：${notification.target_type}` })
    }
    // Count recipients based on target_type
    const sentCount = notification.target_type === 'all'
      ? (db.prepare('SELECT COUNT(*) as count FROM voters WHERE is_active=1').get() as any).count
      : 0
    db.prepare(`
      UPDATE notifications
      SET status='sent', sent_count=?, sent_at=datetime('now','localtime')
      WHERE id=?
    `).run(sentCount, Number(id))

    // Bulk insert contact_records scoped to actual recipients
    let partialFailures = 0
    if (notification.target_type === 'all') {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const content = notification.title + (notification.content ? `：${notification.content}` : '')
        db.transaction(() => {
          db.prepare(`
            INSERT INTO contact_records (voter_id, contact_date, contact_type, content, created_by)
            SELECT id, ?, '通知', ?, ?
            FROM voters WHERE is_active=1
          `).run(today, content, cu.id)
        })()
      } catch (e) {
        partialFailures = sentCount
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[Notifications] contact_records bulk insert failed:', msg)
        try {
          db.prepare(
            `INSERT INTO audit_logs(user_id,action,module,target_type,target_id,target_name,detail,ip_address,created_at)
             VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime'))`
          ).run(
            cu.id,
            'notification_recipient_insert_failed',
            '通知管理',
            'notification',
            Number(id),
            notification.title,
            msg,
            request.ip || ''
          )
        } catch {}
      }
    }

    createAuditLog(request, cu.id, { action: 'update', module: '通知管理', target_type: 'notification', target_id: Number(id), target_name: notification.title })
    const responseBody: Record<string, any> = { success: true, message: '通知已標記為已發送', sent_count: sentCount }
    if (partialFailures > 0) responseBody.partial_failures = partialFailures
    return reply.send(responseBody)
  })

  // DELETE /api/notifications/:id (only if draft)
  fastify.delete('/api/notifications/:id', { preHandler: [requirePermission('notifications', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(Number(id)) as any
    if (!notification) return reply.code(404).send({ success: false, error: '通知不存在' })
    if (notification.status !== 'draft') {
      return reply.code(400).send({ success: false, error: '只能刪除草稿狀態的通知' })
    }
    db.prepare('DELETE FROM notifications WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '通知管理', target_type: 'notification', target_id: Number(id), target_name: notification.title })
    return reply.send({ success: true, message: '通知已刪除' })
  })
}
