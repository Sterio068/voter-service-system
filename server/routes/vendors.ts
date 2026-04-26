import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const VendorSchema = z.object({
  name: z.string().min(1, '廠商名稱為必填').max(100, '廠商名稱過長'),
  category: z.string().max(50).nullable().optional(),
  contact_person: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  line_id: z.string().max(100).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  bank_account: z.string().max(100).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  rating: z.union([z.number(), z.string()]).nullable().optional(),
  is_active: z.union([z.boolean(), z.number()]).nullable().optional(),
})

export default async function vendorRoutes(fastify: FastifyInstance) {
  // GET /api/vendors
  fastify.get('/api/vendors', { preHandler: [requirePermission('vendors', 'view')] }, async (request, reply) => {
    const { category, search, active = '1', page = 1, pageSize = 50 } = request.query as any
    const pg = Math.max(1, Number(page) || 1)
    const ps = Math.min(200, Math.max(1, Number(pageSize) || 50))
    const conds: string[] = []
    const params: any[] = []
    if (active !== 'all') { conds.push('is_active = ?'); params.push(Number(active)) }
    if (category) { conds.push('category = ?'); params.push(category) }
    if (search) { const es = escapeLike(search); conds.push("(name LIKE ? ESCAPE '\\' OR contact_person LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')"); params.push(`%${es}%`, `%${es}%`, `%${es}%`) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as c FROM vendors ${where}`).get(...params) as any).c
    const data = db.prepare(`SELECT * FROM vendors ${where} ORDER BY is_active DESC, name ASC LIMIT ? OFFSET ?`).all(...params, ps, (pg - 1) * ps)
    return reply.send({ success: true, data, total, page: pg, pageSize: ps })
  })

  // GET /api/vendors/:id
  fastify.get('/api/vendors/:id', { preHandler: [requirePermission('vendors', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(Number(id))
    if (!vendor) return reply.code(404).send({ success: false, error: '廠商不存在' })
    // 對帳明細
    const items = db.prepare(`
      SELECT ci.*, cr.recipient_name, cr.ceremony_type, cr.event_date, cr.status as ceremony_status
      FROM ceremony_items ci
      JOIN ceremony_records cr ON ci.ceremony_id = cr.id
      WHERE ci.vendor_id = ?
      ORDER BY cr.event_date DESC
    `).all(Number(id))
    // 統計
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT ci.ceremony_id) as order_count,
        SUM(ci.amount) as total_amount,
        SUM(CASE WHEN ci.payment_status='paid' THEN ci.amount ELSE 0 END) as paid_amount,
        SUM(CASE WHEN ci.payment_status='pending' THEN ci.amount ELSE 0 END) as pending_amount
      FROM ceremony_items ci WHERE ci.vendor_id = ?
    `).get(Number(id))
    const safeStats = {
      order_count: (stats as any)?.order_count || 0,
      total_amount: (stats as any)?.total_amount || 0,
      paid_amount: (stats as any)?.paid_amount || 0,
      pending_amount: (stats as any)?.pending_amount || 0,
    }
    return reply.send({ success: true, data: vendor, items, stats: safeStats })
  })

  // GET /api/vendors/:id/stats  月/年統計
  fastify.get('/api/vendors/:id/stats', { preHandler: [requirePermission('vendors', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const { year } = request.query as any
    const y = Number(year) || new Date().getFullYear()
    const monthly = db.prepare(`
      SELECT strftime('%m', cr.event_date) as month, SUM(ci.amount) as amount, COUNT(*) as count
      FROM ceremony_items ci
      JOIN ceremony_records cr ON ci.ceremony_id = cr.id
      WHERE ci.vendor_id = ? AND strftime('%Y', cr.event_date) = ?
      GROUP BY strftime('%m', cr.event_date)
      ORDER BY month
    `).all(Number(id), String(y))
    return reply.send({ success: true, data: monthly, year: y })
  })

  // POST /api/vendors
  fastify.post('/api/vendors', { preHandler: [requirePermission('vendors', 'create')] }, async (request, reply) => {
    const parsed = VendorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: '廠商名稱為必填' })
    const result = db.prepare(`
      INSERT INTO vendors (name, category, contact_person, phone, line_id, address, bank_account, note, rating, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(body.name.trim(), body.category || 'other', body.contact_person || null, body.phone || null, body.line_id || null, body.address || null, body.bank_account || null, body.note || null, Number(body.rating) || 0)
    return reply.code(201).send({ success: true, data: { id: result.lastInsertRowid } })
  })

  // PUT /api/vendors/:id
  fastify.put('/api/vendors/:id', { preHandler: [requirePermission('vendors', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const parsed = VendorSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = request.body as any
    // HIGH-002: 先確認廠商存在再執行更新
    const existing = db.prepare('SELECT id FROM vendors WHERE id = ?').get(Number(id))
    if (!existing) return reply.code(404).send({ success: false, error: '廠商不存在' })
    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: '廠商名稱為必填' })
    db.prepare(`
      UPDATE vendors SET name=?, category=?, contact_person=?, phone=?, line_id=?, address=?, bank_account=?, note=?, rating=?, is_active=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(body.name.trim(), body.category || 'other', body.contact_person || null, body.phone || null, body.line_id || null, body.address || null, body.bank_account || null, body.note || null, Number(body.rating) || 0, body.is_active !== false ? 1 : 0, Number(id))
    return reply.send({ success: true })
  })

  // DELETE /api/vendors/:id
  fastify.delete('/api/vendors/:id', { preHandler: [requirePermission('vendors', 'delete')] }, async (request, reply) => {
    const { id } = request.params as any
    // 軟刪除
    db.prepare("UPDATE vendors SET is_active=0, updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
    return reply.send({ success: true })
  })
}
