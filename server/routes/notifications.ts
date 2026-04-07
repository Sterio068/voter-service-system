import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

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
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.title || !String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '通知標題為必填' })
    }
    if (!body.content || !String(body.content).trim()) {
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

  // POST /api/notifications/:id/send
  fastify.post('/api/notifications/:id/send', { preHandler: [requirePermission('notifications', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
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
      } catch {}
    }

    createAuditLog(request, cu.id, { action: 'update', module: '通知管理', target_type: 'notification', target_id: Number(id), target_name: notification.title })
    return reply.send({ success: true, message: '通知已標記為已發送', sent_count: sentCount })
  })

  // DELETE /api/notifications/:id (only if draft)
  fastify.delete('/api/notifications/:id', { preHandler: [requirePermission('notifications', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
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
