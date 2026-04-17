import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

function validateDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(date)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

export default async function dailyLogRoutes(fastify: FastifyInstance) {
  // GET /api/daily-logs — list recent 30
  fastify.get('/api/daily-logs', { preHandler: [requirePermission('admin','view')] }, async (req, reply) => {
    const data = db.prepare('SELECT d.*, u.name as created_by_name, u2.name as updated_by_name FROM daily_logs d LEFT JOIN users u ON d.created_by=u.id LEFT JOIN users u2 ON d.updated_by=u2.id ORDER BY d.log_date DESC LIMIT 30').all()
    return reply.send({ success: true, data })
  })

  // GET /api/daily-logs/:date — get or auto-generate
  fastify.get('/api/daily-logs/:date', { preHandler: [requirePermission('admin','view')] }, async (req, reply) => {
    const { date } = req.params as any
    if (!validateDate(date)) return reply.code(400).send({ success: false, error: '日期格式錯誤或不合法，需為 YYYY-MM-DD' })
    let log = db.prepare('SELECT * FROM daily_logs WHERE log_date=?').get(date) as any
    if (!log) {
      // Auto-generate summary from today's data
      const newCases = (db.prepare("SELECT COUNT(*) as c FROM petitions WHERE DATE(created_at)=?").get(date) as any).c
      const closed = (db.prepare("SELECT COUNT(*) as c FROM petitions WHERE DATE(closed_at)=?").get(date) as any).c
      const contacts = (db.prepare("SELECT COUNT(*) as c FROM contact_records WHERE DATE(created_at)=?").get(date) as any).c
      log = { log_date: date, new_cases_summary: `新增陳情 ${newCases} 件`, completed_summary: `結案 ${closed} 件，聯絡 ${contacts} 人次`, highlights: '', pending_handover: '', director_note: '' }
    }
    return reply.send({ success: true, data: log })
  })

  // DELETE /api/daily-logs/:date
  fastify.delete('/api/daily-logs/:date', { preHandler: [requirePermission('admin','edit')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const { date } = req.params as any
    if (!validateDate(date)) return reply.code(400).send({ success: false, error: '日期格式錯誤' })
    const log = db.prepare('SELECT id FROM daily_logs WHERE log_date=?').get(date)
    if (!log) return reply.code(404).send({ success: false, error: '日誌不存在' })
    db.prepare('DELETE FROM daily_logs WHERE log_date=?').run(date)
    createAuditLog(req, cu.id, { action: 'delete', module: '每日日誌', target_type: 'daily_log', target_id: 0, target_name: date })
    return reply.send({ success: true, message: '日誌已刪除' })
  })

  // PUT /api/daily-logs/:date — upsert
  fastify.put('/api/daily-logs/:date', { preHandler: [requirePermission('admin','edit')] }, async (req, reply) => {
    const cu = (req as any).currentUser
    const { date } = req.params as any
    if (!validateDate(date)) return reply.code(400).send({ success: false, error: '日期格式錯誤或不合法，需為 YYYY-MM-DD' })
    const body = req.body as any
    const existing = db.prepare('SELECT id FROM daily_logs WHERE log_date=?').get(date)
    const fields = ['highlights','new_cases_summary','completed_summary','pending_handover','director_note']
    const data: Record<string,any> = { log_date: date, updated_by: cu.id, updated_at: new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}) }
    for (const f of fields) { if (body[f] !== undefined) data[f] = body[f] }
    if (existing) {
      const sets = Object.keys(data).filter(k=>k!=='log_date').map(k=>`${k}=?`).join(',')
      const vals = Object.entries(data).filter(([k])=>k!=='log_date').map(([,v])=>v)
      db.prepare(`UPDATE daily_logs SET ${sets} WHERE log_date=?`).run(...vals, date)
      createAuditLog(req, cu.id, { action: 'update', module: '每日日誌', target_type: 'daily_log', target_id: 0, target_name: date })
    } else {
      data.created_by = cu.id
      const cols = Object.keys(data).join(',')
      const placeholders = Object.keys(data).map(()=>'?').join(',')
      db.prepare(`INSERT INTO daily_logs (${cols}) VALUES (${placeholders})`).run(...Object.values(data))
      createAuditLog(req, cu.id, { action: 'create', module: '每日日誌', target_type: 'daily_log', target_id: 0, target_name: date })
    }
    return reply.send({ success: true, message: '日誌已儲存' })
  })
}
