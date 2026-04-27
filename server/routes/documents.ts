import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { buildPdf } from '../utils/pdfExport'
import { getSetting } from '../utils/settings'

const DOC_STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  replied: '已回覆',
  archived: '已歸檔',
}

/** Convert ISO date (YYYY-MM-DD) to Republic of China format for display. */
function toROC(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(dateStr)
  const year = Number(m[1]) - 1911
  return `民國${year}年${m[2]}月${m[3]}日`
}

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
    const cu = request.currentUser!
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
    const cu = request.currentUser!
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

  // GET /api/documents/:id/export-pdf — 公文 PDF 匯出（仿政府公文格式：機關抬頭 + 受文者 + 主旨 + 說明）
  fastify.get('/api/documents/:id/export-pdf', { preHandler: [requirePermission('documents', 'export')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const doc = db.prepare(`
      SELECT d.*, u.name as assignee_name FROM documents d LEFT JOIN users u ON d.assignee_id=u.id WHERE d.id=?
    `).get(Number(id)) as any
    if (!doc) return reply.code(404).send({ success: false, error: '公文不存在' })

    const officeName = getSetting('office_name') || '服務處'
    const officeAddress = getSetting('office_address') || ''
    const officePhone = getSetting('office_phone') || ''
    const officeFax = getSetting('office_fax') || ''
    const officeEmail = getSetting('office_email') || ''
    const officeContact = getSetting('office_contact') || ''
    const isIncoming = doc.doc_type === 'incoming'
    const docTypeLabel = isIncoming ? '收文' : '發文'
    const statusLabel = DOC_STATUS_LABELS[doc.status] || doc.status || '—'

    // Contact block (only render lines that have content)
    const contactStack: any[] = []
    if (officeAddress) contactStack.push({ text: `地　　址：${officeAddress}`, fontSize: 10 })
    if (officeContact) contactStack.push({ text: `聯 絡 人：${officeContact}`, fontSize: 10 })
    if (officePhone) contactStack.push({ text: `電　　話：${officePhone}`, fontSize: 10 })
    if (officeFax) contactStack.push({ text: `傳　　真：${officeFax}`, fontSize: 10 })
    if (officeEmail) contactStack.push({ text: `電子信箱：${officeEmail}`, fontSize: 10 })

    // Description body — split on newlines and prefix each line with 一、二、…
    const descriptionBlocks: any[] = []
    if (doc.content_summary) {
      const lines = String(doc.content_summary).split('\n').map((l: string) => l.trim()).filter(Boolean)
      const nums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
      if (lines.length === 1) {
        descriptionBlocks.push({ text: lines[0], style: 'descBody' })
      } else {
        lines.forEach((line: string, i: number) => {
          const prefix = i < nums.length ? nums[i] : String(i + 1)
          descriptionBlocks.push({ text: `${prefix}、${line}`, style: 'descBody' })
        })
      }
    }

    const docDef: Record<string, any> = {
      info: { title: `${docTypeLabel} ${doc.doc_number}`, author: officeName },
      pageSize: 'A4',
      pageMargins: [60, 50, 60, 50],
      content: [
        { text: officeName, style: 'agency' },
        { text: '函', style: 'docType' },
        ...(contactStack.length ? [{ stack: contactStack, margin: [0, 0, 0, 10] }] : []),
        { text: `受文者：${doc.org_name || '　　　　　　'}`, style: 'fieldLine' },
        { text: `${isIncoming ? '收文日期' : '發文日期'}：${toROC(doc.doc_date)}`, style: 'fieldLine' },
        { text: `${isIncoming ? '收文字號' : '發文字號'}：${doc.doc_number || '—'}`, style: 'fieldLine' },
        { text: `速　　別：普通件`, style: 'fieldLine' },
        { text: `密等及解密條件或保密期限：普通`, style: 'fieldLine' },
        { text: `附　　件：${isIncoming ? (doc.org_doc_number ? `來文字號 ${doc.org_doc_number}` : '無') : '無'}`, style: 'fieldLine' },
        { text: ' ', margin: [0, 6] },
        { text: `主　　旨：${doc.subject || ''}。`, style: 'fieldLine' },
        ...(descriptionBlocks.length ? [
          { text: '說　　明：', style: 'sectionLabel' },
          { stack: descriptionBlocks, margin: [24, 0, 0, 0] },
        ] : []),
        { text: ' ', margin: [0, 6] },
        { text: `承辦人：${doc.assignee_name || '—'}　　　狀態：${statusLabel}`, style: 'metaLine' },
        { text: `處理期限：${toROC(doc.deadline)}`, style: 'metaLine' },
        { text: ' ', margin: [0, 12] },
        { text: `${officeName}　首長：`, alignment: 'right', fontSize: 12 },
      ],
      styles: {
        agency: { fontSize: 18, bold: true, alignment: 'center', characterSpacing: 4, margin: [0, 0, 0, 4] },
        docType: { fontSize: 16, bold: true, alignment: 'center', characterSpacing: 8, margin: [0, 0, 0, 16] },
        fieldLine: { fontSize: 12, lineHeight: 1.7 },
        sectionLabel: { fontSize: 12, bold: true, margin: [0, 4, 0, 2] },
        descBody: { fontSize: 12, lineHeight: 1.6 },
        metaLine: { fontSize: 10, color: '#555', lineHeight: 1.5 },
      },
    }

    const buf = await buildPdf(docDef)
    createAuditLog(request, cu.id, { action: 'export', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: `${doc.doc_number} (PDF)` })
    const filename = `${doc.doc_number || '公文'}.pdf`
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return reply.send(buf)
  })

  fastify.delete('/api/documents/:id', { preHandler: [requirePermission('documents', 'delete')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id)) as any
    if (!doc) return reply.code(404).send({ success: false, error: '公文不存在' })
    db.prepare('DELETE FROM documents WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: doc.doc_number })
    return reply.send({ success: true, message: '公文已刪除' })
  })
}
