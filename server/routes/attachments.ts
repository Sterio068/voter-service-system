import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission, authenticate, hasPermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { PermissionAction, PermissionModule } from '../../shared/permissions'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  buildInlineContentDisposition,
  extensionForAttachmentMime,
  isAllowedAttachmentContent,
  sanitizeDisplayFileName,
} from '../utils/fileSecurity'

function getAttachmentsDir(): string {
  const base = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
  const dir = path.join(base, 'attachments')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export default async function attachmentRoutes(fastify: FastifyInstance) {
  // 上傳附件
  fastify.post('/api/attachments', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const cu = request.currentUser!
    const { ref_type, ref_id } = request.query as any
    const refId = Number(ref_id)

    if (!ref_type || !Number.isSafeInteger(refId) || refId <= 0) {
      return reply.code(400).send({ success: false, error: '缺少 ref_type 或 ref_id' })
    }
    if (!canAccessRef(cu, ref_type, refId)) return reply.code(403).send({ success: false, error: '無上傳權限' })

    const data = await request.file()
    if (!data) return reply.code(400).send({ success: false, error: '未收到檔案' })

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(data.mimetype)) {
      return reply.code(400).send({ success: false, error: '僅支援 PDF 和圖片格式' })
    }

    const displayName = sanitizeDisplayFileName(data.filename)
    const ext = extensionForAttachmentMime(data.mimetype)
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
    const dir = getAttachmentsDir()
    const filePath = path.join(dir, uniqueName)

    const maxAttachmentSize = 20 * 1024 * 1024
    const chunks: Buffer[] = []
    let totalSize = 0
    for await (const chunk of data.file) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalSize += buffer.length
      if (totalSize > maxAttachmentSize) {
        return reply.code(400).send({ success: false, error: '檔案大小不能超過 20MB' })
      }
      chunks.push(buffer)
    }
    const buf = Buffer.concat(chunks, totalSize)
    if (!isAllowedAttachmentContent(data.mimetype, buf)) {
      return reply.code(400).send({ success: false, error: '檔案內容與格式不符' })
    }

    fs.writeFileSync(filePath, buf)

    const relativePath = path.join('attachments', uniqueName)
    const r = db.prepare(
      'INSERT INTO attachments(ref_type,ref_id,file_name,file_path,file_size,mime_type,created_by) VALUES(?,?,?,?,?,?,?)'
    ).run(ref_type, refId, displayName, relativePath, buf.length, data.mimetype, cu.id)

    createAuditLog(request, cu.id, { action: 'create', module: '附件', target_type: ref_type, target_id: refId, target_name: displayName })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid, file_name: displayName, file_path: relativePath, mime_type: data.mimetype, file_size: buf.length } })
  })

  // 列出附件
  fastify.get('/api/attachments', { preHandler: [authenticate] }, async (request, reply) => {
    const cu = request.currentUser!
    const { ref_type, ref_id } = request.query as any
    const refId = Number(ref_id)
    if (!ref_type || !Number.isSafeInteger(refId) || refId <= 0) return reply.code(400).send({ success: false, error: '缺少參數' })
    if (!canAccessRef(cu, ref_type, refId)) return reply.code(403).send({ success: false, error: '無存取權限' })
    const rows = db.prepare(
      'SELECT a.*, u.name as uploader_name FROM attachments a LEFT JOIN users u ON a.created_by=u.id WHERE a.ref_type=? AND a.ref_id=? ORDER BY a.created_at DESC'
    ).all(ref_type, refId)
    return reply.send({ success: true, data: rows })
  })

  // ref_type → 需要的 view 權限模組
  const REF_TYPE_MODULE: Record<string, { module: PermissionModule; action: PermissionAction }> = {
    petition:     { module: 'petitions',  action: 'view' },
    voter:        { module: 'voters',     action: 'view' },
    document:     { module: 'documents',  action: 'view' },
    consultation: { module: 'documents',  action: 'view' },
    ceremony:     { module: 'ceremonies', action: 'view' },
    event:        { module: 'events',     action: 'view' },
    proposal:     { module: 'proposals',  action: 'view' },
  }

  const REF_EXISTS_SQL: Record<string, string> = {
    petition:     'SELECT id FROM petitions WHERE id=? AND COALESCE(is_active,1)=1',
    voter:        'SELECT id FROM voters WHERE id=? AND is_active=1',
    document:     'SELECT id FROM documents WHERE id=?',
    consultation: 'SELECT id FROM consultation_appointments WHERE id=?',
    ceremony:     'SELECT id FROM ceremony_records WHERE id=?',
    event:        'SELECT id FROM events WHERE id=? AND is_active=1',
    proposal:     'SELECT id FROM proposals WHERE id=? AND is_active=1',
  }

  function canAccessRef(cu: any, ref_type: string, ref_id?: number): boolean {
    const perm = REF_TYPE_MODULE[ref_type]
    if (!perm) return false
    if (!hasPermission(cu.role, perm.module, perm.action)) return false
    if (ref_id === undefined) return true
    const sql = REF_EXISTS_SQL[ref_type]
    return !!(sql && db.prepare(sql).get(ref_id))
  }

  // 下載 / 預覽附件（需認證）
  fastify.get('/api/attachments/:id/file', { preHandler: [authenticate] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const att = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(id)) as any
    if (!att) return reply.code(404).send({ success: false, error: '附件不存在' })
    if (!canAccessRef(cu, att.ref_type, Number(att.ref_id))) return reply.code(403).send({ success: false, error: '無存取權限' })

    const base = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
    const filePath = path.join(base, att.file_path)
    // 防止路徑穿越
    const normalized = path.resolve(filePath)
    if (!normalized.startsWith(path.resolve(base) + path.sep)) {
      return reply.code(400).send({ success: false, error: '路徑不合法' })
    }
    if (!fs.existsSync(filePath)) return reply.code(404).send({ success: false, error: '檔案不存在' })

    const stream = fs.createReadStream(filePath)
    // Re-validate stored MIME against allowlist before serving — prevents stored XSS via arbitrary Content-Type
    const safeType = ALLOWED_ATTACHMENT_MIME_TYPES.has(att.mime_type) ? att.mime_type : 'application/octet-stream'
    reply.header('Content-Type', safeType)
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Content-Disposition', buildInlineContentDisposition(att.file_name))
    return reply.send(stream)
  })

  // 刪除附件
  fastify.delete('/api/attachments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const cu = request.currentUser!
    const { id } = request.params as any
    const att = db.prepare('SELECT * FROM attachments WHERE id=?').get(Number(id)) as any
    if (!att) return reply.code(404).send({ success: false, error: '附件不存在' })
    // 必須是上傳者或有父資源 edit 權限
    const isUploader = att.created_by === cu.id
    const hasEditPerm = canAccessRef(cu, att.ref_type, Number(att.ref_id)) && (cu.role === 'admin' || cu.role === 'supervisor')
    if (!isUploader && !hasEditPerm) return reply.code(403).send({ success: false, error: '無刪除權限' })

    const base = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
    const filePath = path.join(base, att.file_path)
    let cleanupWarning: string | null = null
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (cleanupErr) {
        const msg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        console.warn(`[Attachments] file delete failed for ${filePath}:`, msg)
        cleanupWarning = `檔案實體刪除失敗（資料庫記錄已移除）：${msg}`
      }
    }

    db.prepare('DELETE FROM attachments WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '附件', target_type: att.ref_type, target_id: att.ref_id, target_name: att.file_name })
    const responseBody: Record<string, any> = { success: true, message: '附件已刪除' }
    if (cleanupWarning) responseBody.cleanup_warning = cleanupWarning
    return reply.send(responseBody)
  })
}
