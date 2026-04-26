import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const GiftCategorySchema = z.object({
  name: z.string().min(1, '類別名稱為必填').max(100, '類別名稱過長'),
  unit: z.string().max(20).nullable().optional(),
  default_price: z.union([z.number(), z.string()]).nullable().optional(),
  sort_order: z.union([z.number(), z.string()]).nullable().optional(),
  is_active: z.union([z.boolean(), z.number()]).nullable().optional(),
})

const CeremonyItemSchema = z.object({
  category_id: z.number().int().positive().nullable().optional(),
  item_name: z.string().max(200).nullable().optional(),
  vendor_id: z.number().int().positive().nullable().optional(),
  quantity: z.union([z.number(), z.string()]).nullable().optional(),
  unit_price: z.union([z.number(), z.string()]).nullable().optional(),
  payment_method: z.string().max(30).nullable().optional(),
  payment_status: z.string().max(30).nullable().optional(),
  receipt_no: z.string().max(100).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
}).passthrough()

const CeremonySchema = z.object({
  schedule_id: z.number().int().positive().nullable().optional(),
  voter_id: z.number().int().positive().nullable().optional(),
  ceremony_type: z.string().max(50).nullable().optional(),
  recipient_name: z.string().min(1, '受贈人姓名為必填').max(100, '受贈人姓名過長'),
  recipient_relation: z.string().max(50).nullable().optional(),
  event_date: z.string().max(20).nullable().optional(),
  event_location: z.string().max(200).nullable().optional(),
  is_joint: z.union([z.boolean(), z.number()]).nullable().optional(),
  joint_note: z.string().max(2000).nullable().optional(),
  status: z.string().max(30).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  items: z.array(CeremonyItemSchema).optional(),
})

export default async function ceremonyRoutes(fastify: FastifyInstance) {
  // GET /api/gift-categories
  fastify.get('/api/gift-categories', { preHandler: [requirePermission('categories', 'view')] }, async (_request, reply) => {
    const data = db.prepare('SELECT * FROM gift_categories WHERE is_active=1 ORDER BY sort_order, id').all()
    return reply.send({ success: true, data })
  })

  // POST /api/gift-categories
  fastify.post('/api/gift-categories', { preHandler: [requirePermission('categories', 'create')] }, async (request, reply) => {
    const parsed = GiftCategorySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: '類別名稱為必填' })
    const max = (db.prepare('SELECT MAX(sort_order) as m FROM gift_categories').get() as any).m || 0
    const result = db.prepare('INSERT INTO gift_categories (name, unit, default_price, sort_order) VALUES (?,?,?,?)').run(body.name.trim(), body.unit || '份', Number(body.default_price) || 0, max + 1)
    return reply.code(201).send({ success: true, data: { id: result.lastInsertRowid } })
  })

  // PUT /api/gift-categories/:id
  fastify.put('/api/gift-categories/:id', { preHandler: [requirePermission('categories', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = GiftCategorySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: '類別名稱為必填' })
    db.prepare('UPDATE gift_categories SET name=?, unit=?, default_price=?, sort_order=?, is_active=? WHERE id=?').run(body.name.trim(), body.unit || '份', Number(body.default_price) || 0, Number(body.sort_order) || 0, body.is_active !== false ? 1 : 0, Number(id))
    return reply.send({ success: true })
  })

  // DELETE /api/gift-categories/:id
  fastify.delete('/api/gift-categories/:id', { preHandler: [requirePermission('categories', 'delete')] }, async (request, reply) => {
    const { id } = request.params as any
    db.prepare('UPDATE gift_categories SET is_active=0 WHERE id=?').run(Number(id))
    return reply.send({ success: true })
  })

  // GET /api/ceremonies
  fastify.get('/api/ceremonies', { preHandler: [requirePermission('ceremonies', 'view')] }, async (request, reply) => {
    const { ceremony_type, status, voter_id, schedule_id, year, month, search, page = 1, pageSize = 20 } = request.query as any
    const pg = Math.max(1, Number(page) || 1)
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 20))
    const conds: string[] = []
    const params: any[] = []
    if (ceremony_type) { conds.push('cr.ceremony_type=?'); params.push(ceremony_type) }
    if (status) { conds.push('cr.status=?'); params.push(status) }
    if (voter_id) { conds.push('cr.voter_id=?'); params.push(Number(voter_id)) }
    if (schedule_id) { conds.push('cr.schedule_id=?'); params.push(Number(schedule_id)) }
    if (year) { conds.push("strftime('%Y', cr.event_date)=?"); params.push(String(year)) }
    if (month) { conds.push("strftime('%m', cr.event_date)=?"); params.push(String(month).padStart(2, '0')) }
    if (search) { conds.push('(cr.recipient_name LIKE ? OR cr.note LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
    // 排除已軟刪除行程的禮儀記錄
    conds.push('(cr.schedule_id IS NULL OR EXISTS (SELECT 1 FROM schedules s2 WHERE s2.id=cr.schedule_id AND s2.is_active=1))')
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as c FROM ceremony_records cr ${where}`).get(...params) as any).c
    const rows = db.prepare(`
      SELECT cr.*,
        v.name as voter_name,
        s.title as schedule_title,
        u.name as creator_name
      FROM ceremony_records cr
      LEFT JOIN voters v ON cr.voter_id = v.id
      LEFT JOIN schedules s ON cr.schedule_id = s.id
      LEFT JOIN users u ON cr.created_by = u.id
      ${where}
      ORDER BY cr.event_date DESC, cr.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, ps, (pg - 1) * ps) as any[]
    const itemStmt = db.prepare(`
      SELECT ci.*, gc.name as category_name, gc.unit, vd.name as vendor_name
      FROM ceremony_items ci
      LEFT JOIN gift_categories gc ON ci.category_id = gc.id
      LEFT JOIN vendors vd ON ci.vendor_id = vd.id
      WHERE ci.ceremony_id=? ORDER BY ci.id
    `)
    const data = rows.map(r => ({ ...r, items: itemStmt.all(r.id) }))
    return reply.send({ success: true, data, total, page: pg, pageSize: ps })
  })

  // GET /api/ceremonies/:id
  fastify.get('/api/ceremonies/:id', { preHandler: [requirePermission('ceremonies', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const record = db.prepare(`
      SELECT cr.*, v.name as voter_name, s.title as schedule_title
      FROM ceremony_records cr
      LEFT JOIN voters v ON cr.voter_id = v.id
      LEFT JOIN schedules s ON cr.schedule_id = s.id
      WHERE cr.id=?
    `).get(Number(id))
    if (!record) return reply.code(404).send({ success: false, error: '禮儀記錄不存在' })
    const items = db.prepare(`
      SELECT ci.*, gc.name as category_name, gc.unit, vd.name as vendor_name
      FROM ceremony_items ci
      LEFT JOIN gift_categories gc ON ci.category_id = gc.id
      LEFT JOIN vendors vd ON ci.vendor_id = vd.id
      WHERE ci.ceremony_id=?
      ORDER BY ci.id
    `).all(Number(id))
    return reply.send({ success: true, data: record, items })
  })

  // GET /api/ceremonies/by-schedule/:scheduleId
  fastify.get('/api/ceremonies/by-schedule/:scheduleId', { preHandler: [requirePermission('ceremonies', 'view')] }, async (request, reply) => {
    const { scheduleId } = request.params as any
    const records = db.prepare(`
      SELECT cr.*, v.name as voter_name
      FROM ceremony_records cr
      LEFT JOIN voters v ON cr.voter_id = v.id
      WHERE cr.schedule_id=? AND EXISTS (SELECT 1 FROM schedules s WHERE s.id=cr.schedule_id AND s.is_active=1)
      ORDER BY cr.id
    `).all(Number(scheduleId)) as any[]

    if (records.length === 0) return reply.send({ success: true, data: [] })

    // Batch-fetch all items for all ceremony records in a single query (avoids N+1)
    const ids = records.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const allItems = db.prepare(`
      SELECT ci.*, gc.name as category_name, gc.unit, vd.name as vendor_name
      FROM ceremony_items ci
      LEFT JOIN gift_categories gc ON ci.category_id = gc.id
      LEFT JOIN vendors vd ON ci.vendor_id = vd.id
      WHERE ci.ceremony_id IN (${placeholders})
    `).all(...ids) as any[]

    const itemsByCeremony = new Map<number, any[]>()
    for (const item of allItems) {
      const list = itemsByCeremony.get(item.ceremony_id)
      if (list) list.push(item)
      else itemsByCeremony.set(item.ceremony_id, [item])
    }
    const result = records.map((r) => ({ ...r, items: itemsByCeremony.get(r.id) || [] }))
    return reply.send({ success: true, data: result })
  })

  // POST /api/ceremonies
  fastify.post('/api/ceremonies', { preHandler: [requirePermission('ceremonies', 'create')] }, async (request, reply) => {
    const parsed = CeremonySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!body.recipient_name?.trim()) return reply.code(400).send({ success: false, error: '受贈人姓名為必填' })
    const items: any[] = Array.isArray(body.items) ? body.items : []

    db.exec('BEGIN')
    try {
      const calcItems = items.map((i: any) => ({ ...i, _amount: (Number(i.quantity) || 1) * (Number(i.unit_price) || 0) }))
      const total = calcItems.reduce((s: number, i: any) => s + i._amount, 0)
      const result = db.prepare(`
        INSERT INTO ceremony_records (schedule_id, voter_id, ceremony_type, recipient_name, recipient_relation, event_date, event_location, is_joint, joint_note, status, total_amount, note, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(body.schedule_id || null, body.voter_id || null, body.ceremony_type || 'other', body.recipient_name.trim(), body.recipient_relation || null, body.event_date || null, body.event_location || null, body.is_joint ? 1 : 0, body.joint_note || null, body.status || 'planned', total, body.note || null, request.currentUser!.id || null)
      const ceremonyId = result.lastInsertRowid

      const insItem = db.prepare(`INSERT INTO ceremony_items (ceremony_id, category_id, item_name, vendor_id, quantity, unit_price, amount, payment_method, payment_status, receipt_no, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      for (const item of calcItems) {
        if (!item.item_name?.trim()) continue
        insItem.run(ceremonyId, item.category_id || null, item.item_name.trim(), item.vendor_id || null, Number(item.quantity) || 1, Number(item.unit_price) || 0, item._amount, item.payment_method || 'cash', item.payment_status || 'pending', item.receipt_no || null, item.note || null)
      }
      db.exec('COMMIT')
      createAuditLog(request, request.currentUser!.id, { action: 'create', module: '禮儀管理', target_type: 'ceremony', target_id: Number(ceremonyId), target_name: body.recipient_name })
      return reply.code(201).send({ success: true, id: ceremonyId })
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })

  // PUT /api/ceremonies/:id
  fastify.put('/api/ceremonies/:id', { preHandler: [requirePermission('ceremonies', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = CeremonySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!body.recipient_name?.trim()) return reply.code(400).send({ success: false, error: '受贈人姓名為必填' })
    const items: any[] = Array.isArray(body.items) ? body.items : []

    db.exec('BEGIN')
    try {
      const calcItems = items.map((i: any) => ({ ...i, _amount: (Number(i.quantity) || 1) * (Number(i.unit_price) || 0) }))
      const total = calcItems.reduce((s: number, i: any) => s + i._amount, 0)
      db.prepare(`
        UPDATE ceremony_records SET schedule_id=?, voter_id=?, ceremony_type=?, recipient_name=?, recipient_relation=?, event_date=?, event_location=?, is_joint=?, joint_note=?, status=?, total_amount=?, note=?, updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(body.schedule_id || null, body.voter_id || null, body.ceremony_type || 'other', body.recipient_name.trim(), body.recipient_relation || null, body.event_date || null, body.event_location || null, body.is_joint ? 1 : 0, body.joint_note || null, body.status || 'planned', total, body.note || null, Number(id))

      db.prepare('DELETE FROM ceremony_items WHERE ceremony_id=?').run(Number(id))
      const insItem = db.prepare(`INSERT INTO ceremony_items (ceremony_id, category_id, item_name, vendor_id, quantity, unit_price, amount, payment_method, payment_status, receipt_no, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      for (const item of calcItems) {
        if (!item.item_name?.trim()) continue
        insItem.run(Number(id), item.category_id || null, item.item_name.trim(), item.vendor_id || null, Number(item.quantity) || 1, Number(item.unit_price) || 0, item._amount, item.payment_method || 'cash', item.payment_status || 'pending', item.receipt_no || null, item.note || null)
      }
      db.exec('COMMIT')
      createAuditLog(request, request.currentUser!.id, { action: 'update', module: '禮儀管理', target_type: 'ceremony', target_id: Number(id), target_name: body.recipient_name })
      return reply.send({ success: true })
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })

  // DELETE /api/ceremonies/:id
  fastify.delete('/api/ceremonies/:id', { preHandler: [requirePermission('ceremonies', 'delete')] }, async (request, reply) => {
    const { id } = request.params as any
    const existing = db.prepare('SELECT recipient_name FROM ceremony_records WHERE id=?').get(Number(id)) as any
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM ceremony_items WHERE ceremony_id=?').run(Number(id))
      db.prepare('DELETE FROM ceremony_records WHERE id=?').run(Number(id))
      db.exec('COMMIT')
      createAuditLog(request, request.currentUser!.id, { action: 'delete', module: '禮儀管理', target_type: 'ceremony', target_id: Number(id), target_name: existing?.recipient_name || `ceremony ${id}` })
      return reply.send({ success: true })
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
}
