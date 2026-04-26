import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const CreateGroupSchema = z.object({
  name: z.string().min(1, '團體名稱為必填欄位').max(100, '團體名稱過長'),
  category: z.string().max(50).nullable().optional(),
  leader_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  member_count: z.number().int().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

const UpdateGroupSchema = z.object({
  name: z.string().max(100, '團體名稱過長').nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  leader_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  member_count: z.number().int().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  is_active: z.union([z.number(), z.boolean()]).nullable().optional(),
})

const AddMembersSchema = z.object({
  voter_ids: z.array(z.number().int().positive()).min(1, '請選擇成員'),
  role: z.string().max(50).nullable().optional(),
})

const UpdateMemberSchema = z.object({
  role: z.string().max(50).nullable().optional(),
  title: z.string().max(50).nullable().optional(),
})

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
    const cu = request.currentUser!
    const parsed = CreateGroupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!String(body.name).trim()) {
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
    const cu = request.currentUser!
    const { id } = request.params as any
    const parsed = UpdateGroupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
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
    const cu = request.currentUser!
    const { id } = request.params as any
    const group = db.prepare('SELECT * FROM groups WHERE id=?').get(Number(id)) as any
    if (!group) return reply.code(404).send({ success: false, error: '團體不存在' })
    db.prepare('UPDATE groups SET is_active=0 WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '團體管理', target_type: 'group', target_id: Number(id), target_name: group.name })
    return reply.send({ success: true, message: '團體已停用' })
  })

  fastify.post('/api/groups/:id/members', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const parsed = AddMembersSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const { voter_ids, role } = request.body as any
    if (!voter_ids?.length) return reply.code(400).send({ success: false, error: '請選擇成員' })
    const ins = db.prepare('INSERT OR IGNORE INTO group_members (group_id,voter_id,role) VALUES (?,?,?)')
    db.exec('BEGIN'); try { voter_ids.forEach((vid: number) => ins.run(Number(id), vid, role ?? null)); db.exec('COMMIT') }
    catch (e) { db.exec('ROLLBACK'); throw e }
    createAuditLog(request, cu.id, { action: 'create', module: '團體管理', target_type: 'group_member', target_id: Number(id), target_name: `新增 ${voter_ids.length} 位成員` })
    return reply.code(201).send({ success: true, message: `已加入 ${voter_ids.length} 位成員` })
  })

  fastify.delete('/api/groups/:id/members/:voter_id', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id, voter_id } = request.params as any
    db.prepare('DELETE FROM group_members WHERE group_id=? AND voter_id=?').run(Number(id), Number(voter_id))
    createAuditLog(request, cu.id, { action: 'delete', module: '團體管理', target_type: 'group_member', target_id: Number(id) })
    return reply.send({ success: true, message: '成員已移除' })
  })

  // Update member role/title
  fastify.put('/api/groups/:id/members/:voter_id', { preHandler: [requirePermission('groups', 'edit')] }, async (request, reply) => {
    const { id, voter_id } = request.params as any
    const parsed = UpdateMemberSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const { role, title } = request.body as any
    db.prepare('UPDATE group_members SET role=?, title=? WHERE group_id=? AND voter_id=?').run(role ?? null, title ?? null, Number(id), Number(voter_id))
    return reply.send({ success: true, message: '成員資料已更新' })
  })

  // Get schedules linked to this group
  fastify.get('/api/groups/:id/schedules', { preHandler: [requirePermission('groups', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const rows = db.prepare(`
      SELECT s.*, u.name as creator_name FROM schedules s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.is_active = 1 AND s.related_group_ids IS NOT NULL
      AND (
        s.related_group_ids LIKE '%[' || ? || ']%'
        OR s.related_group_ids LIKE '%,' || ? || ',%'
        OR s.related_group_ids LIKE '%[' || ? || ',%'
        OR s.related_group_ids LIKE '%,' || ? || ']%'
      )
      ORDER BY s.start_time DESC LIMIT 100
    `).all(String(id), String(id), String(id), String(id))
    return reply.send({ success: true, data: rows })
  })

  // Get ceremony expenses linked to this group (via schedules)
  fastify.get('/api/groups/:id/expenses', { preHandler: [requirePermission('groups', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    // First get schedule IDs linked to this group
    const scheduleRows = db.prepare(`
      SELECT id FROM schedules WHERE is_active=1 AND related_group_ids IS NOT NULL
      AND (
        related_group_ids LIKE '%[' || ? || ']%'
        OR related_group_ids LIKE '%,' || ? || ',%'
        OR related_group_ids LIKE '%[' || ? || ',%'
        OR related_group_ids LIKE '%,' || ? || ']%'
      )
    `).all(String(id), String(id), String(id), String(id)) as any[]
    if (!scheduleRows.length) return reply.send({ success: true, data: [], total: 0 })
    const sids = scheduleRows.map((r: any) => r.id)
    const placeholders = sids.map(() => '?').join(',')
    const ceremonies = db.prepare(`
      SELECT cr.*,
        COALESCE((SELECT SUM(ci.amount) FROM ceremony_items ci WHERE ci.ceremony_id=cr.id), 0) as computed_total
      FROM ceremony_records cr
      WHERE cr.schedule_id IN (${placeholders})
      ORDER BY cr.event_date DESC, cr.id DESC
    `).all(...sids) as any[]
    const total = ceremonies.reduce((s: number, r: any) => s + (r.computed_total || 0), 0)
    return reply.send({ success: true, data: ceremonies, total })
  })
}
