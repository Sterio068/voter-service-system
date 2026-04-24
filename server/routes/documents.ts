import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

function generateDocNumber(type: string): string {
  const year = new Date().getFullYear()
  const prefix = type === 'incoming' ? '收' : '發'
  const seqName = `doc_${type}_${year}`
  db.exec('BEGIN IMMEDIATE')
  try {
    // Seed from existing max to avoid collision with legacy data
    const maxRow = db.prepare(
      `SELECT COALESCE(MAX(CAST(SUBSTR(doc_number, ?) AS INTEGER)),0) AS m FROM documents WHERE doc_type=? AND doc_number LIKE ?`
    ).get(String(prefix + '-' + year + '-').length + 1, type, `${prefix}-${year}-%`) as any
    const currentMax = maxRow?.m ?? 0
    db.prepare(
      "INSERT INTO seq_numbers(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=MAX(value + 1, excluded.value)"
    ).run(seqName, currentMax + 1)
    const row = db.prepare('SELECT value FROM seq_numbers WHERE name=?').get(seqName) as any
    db.exec('COMMIT')
    return `${prefix}-${year}-${String(row.value).padStart(5, '0')}`
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

export default async function documentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/documents', { preHandler: [requirePermission('documents', 'view')] }, async (request, reply) => {
    const _q = request.query as any
    const page = Math.max(1, Number(_q.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(_q.pageSize) || 20))
    const { doc_type, status, category, assignee_id, start_date, end_date, search } = _q
    const conds: string[] = []
    const params: any[] = []
    if (doc_type) { conds.push('d.doc_type=?'); params.push(doc_type) }
    if (status) { conds.push('d.status=?'); params.push(status) }
    if (category) { conds.push('d.category=?'); params.push(category) }
    if (assignee_id) { conds.push('d.assignee_id=?'); params.push(Number(assignee_id)) }
    if (start_date) { conds.push('d.doc_date>=?'); params.push(start_date) }
    if (end_date) { conds.push('d.doc_date<=?'); params.push(end_date) }
    if (search) { conds.push('d.subject LIKE ?'); params.push(`%${search}%`) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM documents d ${where}`).get(...params) as any).count
    const data = db.prepare(`
      SELECT d.*, u.name as assignee_name FROM documents d LEFT JOIN users u ON d.assignee_id=u.id
      ${where} ORDER BY d.doc_date DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page)-1)*Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  fastify.get('/api/documents/:id', { preHandler: [requirePermission('documents', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id))
    if (!doc) return reply.code(404).send({ success: false, error: '公文不存在' })
    return reply.send({ success: true, data: doc })
  })

  fastify.post('/api/documents', { preHandler: [requirePermission('documents', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.subject || !String(body.subject).trim()) {
      return reply.code(400).send({ success: false, error: '主旨為必填欄位' })
    }
    if (!body.doc_type || !['incoming', 'outgoing'].includes(body.doc_type)) {
      return reply.code(400).send({ success: false, error: '公文類型無效' })
    }
    if (!body.doc_date) {
      return reply.code(400).send({ success: false, error: '公文日期為必填欄位' })
    }
    const doc_number = generateDocNumber(body.doc_type)
    const fields = ['doc_number','doc_type','doc_date','org_name','org_doc_number','org_doc_date','subject','content_summary','category','assignee_id','status','deadline','related_doc_id','related_petition_id']
    const values = fields.map((f) => {
      if (f === 'doc_number') return doc_number
      if (f === 'status') return body.status ?? 'pending'
      return body[f] ?? null
    })
    const r = db.prepare(`INSERT INTO documents (${fields.join(',')},created_by) VALUES (${fields.map(()=>'?').join(',')},?)`)
      .run(...values, cu.id)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '公文管理', target_type: 'document', target_id: newId, target_name: doc_number })
    return reply.code(201).send({ success: true, data: { id: newId, doc_number }, message: '公文已建立' })
  })

  fastify.put('/api/documents/:id', { preHandler: [requirePermission('documents', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id)) as any
    if (!doc) return reply.code(404).send({ success: false, error: '公文不存在' })
    const allowedFields = ['subject','doc_date','org_name','org_doc_number','org_doc_date','content_summary',
      'category','assignee_id','status','deadline','related_doc_id','related_petition_id',
      'transfer_to','transfer_date','transfer_note']
    const safeData: Record<string, any> = {}
    for (const k of allowedFields) { if (body[k] !== undefined) safeData[k] = body[k] }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE documents SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: doc.doc_number })
    return reply.send({ success: true, message: '公文已更新' })
  })

  fastify.delete('/api/documents/:id', { preHandler: [requirePermission('documents', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id)) as any
    if (!doc) return reply.code(404).send({ success: false, error: '公文不存在' })
    db.prepare('DELETE FROM documents WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: doc.doc_number })
    return reply.send({ success: true, message: '公文已刪除' })
  })
}
