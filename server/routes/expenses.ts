import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'

export default async function expenseRoutes(fastify: FastifyInstance) {
  // GET /api/expenses/summary  收支統計
  fastify.get('/api/expenses/summary', { preHandler: [requirePermission('expenses', 'view')] }, async (request, reply) => {
    const { year, month } = request.query as any
    const y = Number(year) || new Date().getFullYear()
    const m = month ? Number(month) : null
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 12)) return reply.code(400).send({ success: false, error: '月份必須為 1–12' })
    const conds = ["strftime('%Y', cr.event_date) = ?", "(cr.schedule_id IS NULL OR EXISTS (SELECT 1 FROM schedules s2 WHERE s2.id=cr.schedule_id AND s2.is_active=1))"]
    const params: any[] = [String(y)]
    if (m) { conds.push("strftime('%m', cr.event_date) = ?"); params.push(String(m).padStart(2, '0')) }
    const where = 'WHERE ' + conds.join(' AND ')

    // 月度趨勢
    const monthly = db.prepare(`
      SELECT strftime('%m', cr.event_date) as month, SUM(ci.amount) as amount, COUNT(DISTINCT cr.id) as count
      FROM ceremony_records cr JOIN ceremony_items ci ON ci.ceremony_id = cr.id
      ${where}
      GROUP BY strftime('%m', cr.event_date) ORDER BY month
    `).all(...params)

    // 類型分析
    const byType = db.prepare(`
      SELECT cr.ceremony_type, SUM(ci.amount) as amount, COUNT(DISTINCT cr.id) as count
      FROM ceremony_records cr JOIN ceremony_items ci ON ci.ceremony_id = cr.id
      ${where}
      GROUP BY cr.ceremony_type ORDER BY amount DESC
    `).all(...params)

    // 廠商排名
    const byVendor = db.prepare(`
      SELECT v.id, v.name as vendor_name, v.category, SUM(ci.amount) as amount, COUNT(*) as order_count
      FROM ceremony_items ci
      JOIN ceremony_records cr ON ci.ceremony_id = cr.id
      JOIN vendors v ON ci.vendor_id = v.id
      ${where}
      GROUP BY v.id ORDER BY amount DESC LIMIT 20
    `).all(...params)

    // 總計
    const total = db.prepare(`
      SELECT SUM(ci.amount) as total, COUNT(DISTINCT cr.id) as count
      FROM ceremony_records cr JOIN ceremony_items ci ON ci.ceremony_id = cr.id
      ${where}
    `).get(...params)

    // 付款狀態
    const byPayStatus = db.prepare(`
      SELECT ci.payment_status, SUM(ci.amount) as amount
      FROM ceremony_items ci
      JOIN ceremony_records cr ON ci.ceremony_id = cr.id
      ${where}
      GROUP BY ci.payment_status
    `).all(...params)

    return reply.send({ success: true, data: { monthly, byType, byVendor, total, byPayStatus, year: y } })
  })

  // GET /api/expenses/years  有資料的年份清單
  fastify.get('/api/expenses/years', { preHandler: [requirePermission('expenses', 'view')] }, async (_request, reply) => {
    const years = db.prepare(`
      SELECT DISTINCT strftime('%Y', event_date) as year FROM ceremony_records
      WHERE event_date IS NOT NULL ORDER BY year DESC
    `).all()
    return reply.send({ success: true, data: years.map((r: any) => Number(r.year)) })
  })

  // GET /api/expenses/budgets
  fastify.get('/api/expenses/budgets', { preHandler: [requirePermission('expenses', 'view')] }, async (request, reply) => {
    const { year } = request.query as any
    const y = Number(year) || new Date().getFullYear()
    const budgets = db.prepare('SELECT * FROM expense_budgets WHERE year=? ORDER BY month, budget_type').all(y)
    return reply.send({ success: true, data: budgets })
  })

  // POST /api/expenses/budgets
  fastify.post('/api/expenses/budgets', { preHandler: [requirePermission('expenses', 'edit')] }, async (request, reply) => {
    const body = request.body as any
    if (!body.year || !body.amount) return reply.code(400).send({ success: false, error: '年度和金額為必填' })
    const bMonth = body.month ? Number(body.month) : null
    if (bMonth !== null && (bMonth < 1 || bMonth > 12)) return reply.code(400).send({ success: false, error: '月份必須為 1–12' })
    // upsert: 同年/月/type/ref 精確匹配，否則新增
    const monthCond = bMonth !== null ? 'month=?' : 'month IS NULL'
    const refId = body.reference_id || null
    const refCond = refId !== null ? 'reference_id=?' : 'reference_id IS NULL'
    const upsertParams: any[] = [Number(body.year)]
    if (bMonth !== null) upsertParams.push(bMonth)
    upsertParams.push(body.budget_type || 'total')
    if (refId !== null) upsertParams.push(refId)
    const existing = db.prepare(`SELECT id FROM expense_budgets WHERE year=? AND ${monthCond} AND budget_type=? AND ${refCond}`).get(...upsertParams) as any
    if (existing) {
      db.prepare('UPDATE expense_budgets SET amount=?, note=? WHERE id=?').run(Number(body.amount), body.note || null, existing.id)
      return reply.send({ success: true, id: existing.id })
    }
    const result = db.prepare('INSERT INTO expense_budgets (year, month, budget_type, reference_id, amount, note) VALUES (?,?,?,?,?,?)').run(Number(body.year), bMonth, body.budget_type || 'total', body.reference_id || null, Number(body.amount), body.note || null)
    return reply.code(201).send({ success: true, id: result.lastInsertRowid })
  })

  // DELETE /api/expenses/budgets/:id
  fastify.delete('/api/expenses/budgets/:id', { preHandler: [requirePermission('expenses', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    db.prepare('DELETE FROM expense_budgets WHERE id=?').run(Number(id))
    return reply.send({ success: true })
  })
}
