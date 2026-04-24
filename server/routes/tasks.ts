import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

export default async function taskRoutes(fastify: FastifyInstance) {
  // GET /api/tasks
  fastify.get('/api/tasks', { preHandler: [requirePermission('tasks', 'view')] }, async (request, reply) => {
    const { status, assignee_id, voter_id, page = 1, pageSize = 20 } = request.query as any
    const conds: string[] = []
    const params: any[] = []
    if (status) {
      const statuses = (Array.isArray(status) ? status : String(status).split(','))
        .map((value: string) => value.trim())
        .filter(Boolean)
      if (statuses.length === 1) {
        conds.push('t.status = ?')
        params.push(statuses[0])
      } else if (statuses.length > 1) {
        conds.push(`t.status IN (${statuses.map(() => '?').join(',')})`)
        params.push(...statuses)
      }
    }
    if (assignee_id) { conds.push('t.assignee_id = ?'); params.push(Number(assignee_id)) }
    if (voter_id) { conds.push('t.related_voter_id = ?'); params.push(Number(voter_id)) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM tasks t ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT t.*,
        v.name as voter_name,
        a.name as assignee_name,
        c.name as creator_name
      FROM tasks t
      LEFT JOIN voters v ON t.related_voter_id = v.id
      LEFT JOIN users a ON t.assignee_id = a.id
      LEFT JOIN users c ON t.created_by = c.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // GET /api/tasks/today
  fastify.get('/api/tasks/today', { preHandler: [requirePermission('tasks', 'view')] }, async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10)
    const data = db.prepare(`
      SELECT t.*,
        v.name as voter_name,
        a.name as assignee_name,
        c.name as creator_name
      FROM tasks t
      LEFT JOIN voters v ON t.related_voter_id = v.id
      LEFT JOIN users a ON t.assignee_id = a.id
      LEFT JOIN users c ON t.created_by = c.id
      WHERE t.status NOT IN ('done', 'cancelled')
        AND (t.due_date = ? OR t.due_date < ?)
      ORDER BY t.due_date ASC, t.priority DESC
    `).all(today, today)
    return reply.send({ success: true, data })
  })

  // POST /api/tasks
  fastify.post('/api/tasks', { preHandler: [requirePermission('tasks', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.title || !String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '任務標題為必填' })
    }
    const fields = ['title', 'description', 'priority', 'due_date', 'assignee_id',
      'related_voter_id', 'related_petition_id', 'related_document_id']
    const safeData: Record<string, any> = {}
    for (const k of fields) { if (body[k] !== undefined) safeData[k] = body[k] }
    const cols = Object.keys(safeData)
    const vals = Object.values(safeData)
    const r = db.prepare(
      `INSERT INTO tasks (${cols.join(',')},created_by) VALUES (${cols.map(() => '?').join(',')},?)`
    ).run(...vals, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '任務管理', target_type: 'task', target_id: newId, target_name: body.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '任務已建立' })
  })

  // PUT /api/tasks/:id
  fastify.put('/api/tasks/:id', { preHandler: [requirePermission('tasks', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id)) as any
    if (!task) return reply.code(404).send({ success: false, error: '任務不存在' })
    const allowedFields = ['title', 'description', 'status', 'priority', 'due_date', 'assignee_id']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    if (safeData.status === 'done' && task.status !== 'done') {
      safeData.completed_at = new Date().toISOString().replace('T', ' ').slice(0, 19)
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE tasks SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '任務管理', target_type: 'task', target_id: Number(id), target_name: task.title })
    return reply.send({ success: true, message: '任務已更新' })
  })

  // POST /api/tasks/batch-complete
  fastify.post('/api/tasks/batch-complete', { preHandler: [requirePermission('tasks', 'edit')] }, async (request, reply) => {
    const { task_ids } = request.body as any
    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return reply.code(400).send({ success: false, error: '請提供 task_ids 陣列' })
    }
    const placeholders = task_ids.map(() => '?').join(',')
    const result = db.prepare(
      `UPDATE tasks SET status='done', completed_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id IN (${placeholders})`
    ).run(...task_ids)
    return reply.send({ success: true, data: { updated: result.changes } })
  })

  // POST /api/tasks/batch-assign
  fastify.post('/api/tasks/batch-assign', { preHandler: [requirePermission('tasks', 'edit')] }, async (request, reply) => {
    const { task_ids, assignee_id } = request.body as any
    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return reply.code(400).send({ success: false, error: '請提供 task_ids 陣列' })
    }
    if (!assignee_id) {
      return reply.code(400).send({ success: false, error: '請提供 assignee_id' })
    }
    const placeholders = task_ids.map(() => '?').join(',')
    const result = db.prepare(
      `UPDATE tasks SET assignee_id=?, updated_at=datetime('now','localtime') WHERE id IN (${placeholders}) AND status NOT IN ('done','cancelled')`
    ).run(Number(assignee_id), ...task_ids)
    return reply.send({ success: true, data: { updated: result.changes } })
  })

  // DELETE /api/tasks/batch
  fastify.delete('/api/tasks/batch', { preHandler: [requirePermission('tasks', 'edit')] }, async (request, reply) => {
    const { task_ids } = request.body as any
    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return reply.code(400).send({ success: false, error: '請提供 task_ids 陣列' })
    }
    const placeholders = task_ids.map(() => '?').join(',')
    const result = db.prepare(
      `UPDATE tasks SET status='cancelled', updated_at=datetime('now','localtime') WHERE id IN (${placeholders})`
    ).run(...task_ids)
    return reply.send({ success: true, data: { cancelled: result.changes } })
  })

  // DELETE /api/tasks/:id
  fastify.delete('/api/tasks/:id', { preHandler: [requirePermission('tasks', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id)) as any
    if (!task) return reply.code(404).send({ success: false, error: '任務不存在' })
    db.prepare('DELETE FROM tasks WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '任務管理', target_type: 'task', target_id: Number(id), target_name: task.title })
    return reply.send({ success: true, message: '任務已刪除' })
  })
}
