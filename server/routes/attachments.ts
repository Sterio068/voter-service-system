import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

function getAttachmentsDir(): string {
  const base = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
  const dir = path.join(base, 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export default async function attachmentRoutes(fastify: FastifyInstance) {
  // 上傳附件
  fastify.post('/api/attachments', { preHandler: [authenticate] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { ref_type, ref_id } = request.query as any

    if (!ref_type || !ref_id) {
      return reply.code(400).send({ success: false, error: '缺少 ref_type 或 ref_id' })
    }

    const data = await request.file()
    if (!data) return reply.code(400).send({ success: false, error: '未收到檔案' })

    const allowedMime = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
    ]
    if (!allowedMime.includes(data.mimetype)) {
      return reply.code(400).send({ success: false, error: '僅支援 PDF 和圖片格式' })
    }

    const ext = path.extname(data.filename) || (data.mimetype === 'application/pdf' ? '.pdf' : '.jpg')
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
    const dir = getAttachmentsDir()
    const filePath = path.join(dir, uniqueName)

    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    const buf = Buffer.concat(chunks)

    if (buf.length > 20 * 1024 * 1024) {
      return reply.code(400).send({ success: false, error: '檔案大小不能超過 20MB' })
    }

    fs.writeFileSync(filePath, buf)

    const relativePath = path.join('attachments', uniqueName)
    const r = db.prepare(
      'INSERT INTO attachments(ref_type,ref_id,file_name,file_path,file_size,mime_type,created_by) VALUES(?,?,?,?,?,?,?)'
    ).run(ref_type, Number(ref_id), data.filename, relativePath, buf.length, data.mimetype, cu.id)

    createAuditLog(request, cu.id, { action: 'create', module: '附件', target_type: ref_type, target_id: Number(ref_id), target_name: data.filename })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid, file_name: data.filename, file_path: relativePath, mime_type: data.mimetype, file_size: buf.length } })
  })

  // 列出附件
  fastify.get('/api/attachments', { preHandler: [authenticate] }, async (request, reply) => {
    const { ref_type, ref_id } = request.query as any
    if (!ref_type || !ref_id) return reply.code(400).send({ success: false, error: '缺少參數' })
    const rows = db.prepare(
      'SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON a.created_by=u.id WHERE a.ref_type=? AND a.ref_id=? ORDER BY a.created_at DESC'
    ).all(ref_type, Number(ref_id))
    return reply.send({ success: true, data: rows })
  })

  // 刪除附件
  fastify.delete('/api/attachments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const att = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(id)) as any
    if (!att) return reply.code(404).send({ success: false, error: '附件不存在' })

    const base = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
    const filePath = path.join(base, att.file_path)
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath) } catch {}
    }

    db.prepare('DELETE FROM attachments WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '附件', target_type: att.ref_type, target_id: att.ref_id, target_name: att.file_name })
    return reply.send({ success: true, message: '附件已刪除' })
  })
}
