import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

export default async function groupRoutes(fastify: FastifyInstance) {
  fastify.get('/api/groups', { preHandler: [requirePermission('groups', 'view')] }, async (request, reply) => {
    const { page = 1, pageSize = 20, search, category, is_active = 1 } = request.query as any
    const conds = ['is_active = ?']
    const params: any[] = [Number(is_active) === 0 ? 0 : 1]
    if (search) { conds.push('name LIKE ?'); params.push(`%${search}%`) }
    if (category) { conds.push('category = ?'); params.push(category) }
    const where = 'WHERE ' + conds.join(' AND ')
    const total = (db.prepare(`SELECT COUNT(*) as count FROM groups ${where}`).get(...params) as any).count
    const data = db.prepare(`SELECT * FROM groups ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, Number(pageSize), (Number(page)-1)*Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  fastify.get('/api/groups/:id', { preHandler: [requirePermission('groups', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(Number(id)) as any
    if (!group) return reply.code(404).send({ success: false, error: '團體不存在' })
    const members = db.prepare(`
      SELECT gm.*, v.name as voter_name, v.mobile as voter_mobile FROM group_members gm
      LEFT JOIN voters v ON gm.voter_id=v.id WHERE gm.group_id=?
    `).all(Number(id))
    return reply.send({ success: true, data: { ...group, members } })
  })

  fastify.post('/api/groups', { preHandler: [requirePermission('groups', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.name || !String(body.name).trim()) {
      return reply.code(400).send({ success: false, error: '團體名稱為必填欄位' })
    }
    const fields = ['name','category','leader_id','contact_id','phone','address','member_count','note']
    const values = fields.map(f => body[f] ?? null)
    const r = db.prepare(`INSERT INTO groups (${fields.join(',')},created_by) VALUES (${fields.map(()=>'?').join(',')},?)`)
      .run(...values, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '團體管理', target_type: 'group', target_id: newId, target_name: body.name })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '團體已建立' })
  })

  fastify.put('/api/groups/:id', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(Number(id)) as any
    if (!group) return reply.code(404).send({ success: false, error: '團體不存在' })
    const allowedFields = ['name','category','leader_id','contact_id','phone','address','member_count','note','is_active']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    if (safeData.name !== undefined && !String(safeData.name).trim()) {
      return reply.code(400).send({ success: false, error: '團體名稱不可為空' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE groups SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '團體管理', target_type: 'group', target_id: Number(id), target_name: group.name })
    return reply.send({ success: true, message: '團體已更新' })
  })

  fastify.delete('/api/groups/:id', { preHandler: [requirePermission('groups', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(Number(id)) as any
    if (!group) return reply.code(404).send({ success: false, error: '團體不存在' })
    db.prepare('UPDATE groups SET is_active=0 WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '團體管理', target_type: 'group', target_id: Number(id), target_name: group.name })
    return reply.send({ success: true, message: '團體已停用' })
  })

  fastify.post('/api/groups/:id/members', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { voter_ids, role } = request.body as any
    if (!voter_ids?.length) return reply.code(400).send({ success: false, error: '請選擇成員' })
    const ins = db.prepare('INSERT OR IGNORE INTO group_members (group_id,voter_id,role) VALUES (?,?,?)')
    db.exec('BEGIN'); try { voter_ids.forEach((vid: number) => ins.run(Number(id), vid, role ?? null)); db.exec('COMMIT') }
    catch (e) { db.exec('ROLLBACK'); throw e }
    createAuditLog(request, cu.id, { action: 'create', module: '團體管理', target_type: 'group_member', target_id: Number(id), target_name: `新增 ${voter_ids.length} 位成員` })
    return reply.code(201).send({ success: true, message: `已加入 ${voter_ids.length} 位成員` })
  })

  fastify.delete('/api/groups/:id/members/:voter_id', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id, voter_id } = request.params as any
    db.prepare('DELETE FROM group_members WHERE group_id=? AND voter_id=?').run(Number(id), Number(voter_id))
    createAuditLog(request, cu.id, { action: 'delete', module: '團體管理', target_type: 'group_member', target_id: Number(id) })
    return reply.send({ success: true, message: '成員已移除' })
  })
}
