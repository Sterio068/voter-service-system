import { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { db, dbPath } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { getSetting, setSetting } from '../utils/settings'
import {
  buildBackupMetadata,
  getBackupMetadataPath,
  isPathInsideAllowedRoots,
  readBackupMetadata,
  verifyBackupMetadata,
  writeBackupMetadata,
} from '../utils/backupMetadata'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const defaultBackupsDir = process.env.BACKUPS_PATH || path.join(process.cwd(), 'backups')
if (!fs.existsSync(defaultBackupsDir)) fs.mkdirSync(defaultBackupsDir, { recursive: true })

// 模組級快取，避免每次請求重複讀取 DB
let _cachedBackupsDir: string | null = null

function getBackupsDir(): string {
  if (_cachedBackupsDir) return _cachedBackupsDir
  try {
    const saved = getSetting('backup_path')
    const dir = (saved && typeof saved === 'string' && saved.trim()) ? saved.trim() : defaultBackupsDir
    if (!isBackupPathAllowed(dir)) return defaultBackupsDir
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    _cachedBackupsDir = dir
    return dir
  } catch {
    return defaultBackupsDir
  }
}

/** 轉義路徑中的單引號，用於 VACUUM INTO SQL */
function escapeSqlPath(p: string): string {
  return p.replace(/'/g, "''")
}

function getBackupFileName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `voter-service-${ts}-${crypto.randomBytes(3).toString('hex')}.db`
}

function getBackupAllowedRoots(): string[] {
  const configured = process.env.VOTER_SERVICE_BACKUP_ALLOWED_ROOTS || process.env.BACKUP_ALLOWED_ROOTS || ''
  if (!configured.trim()) return []
  const separator = path.delimiter === ';' ? /[;\n]/ : /[:;\n]/
  return configured
    .split(separator)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => path.resolve(item))
}

function isBackupPathAllowed(candidatePath: string): boolean {
  const allowedRoots = getBackupAllowedRoots()
  return allowedRoots.length === 0 || isPathInsideAllowedRoots(candidatePath, allowedRoots)
}

function getCurrentSchemaVersion(): string | null {
  try {
    const row = db.prepare('SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1').get() as any
    return row?.version ? String(row.version) : null
  } catch {
    return null
  }
}

function resolveBackupPath(name: string): string | null {
  const safeName = path.basename(name)
  if (!safeName.endsWith('.db') || safeName.includes('..')) return null
  const backupsDir = path.resolve(getBackupsDir())
  const resolved = path.resolve(backupsDir, safeName)
  return resolved.startsWith(backupsDir + path.sep) ? resolved : null
}

function runIntegrityCheck(filePath: string): { ok: boolean; messages: string[] } {
  let backupDb: Database.Database | null = null
  try {
    backupDb = new Database(filePath, { readonly: true })
    const rows = backupDb.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>
    const messages = rows.map(row => String(row.integrity_check || 'unknown'))
    return { ok: messages.length === 1 && messages[0] === 'ok', messages }
  } finally {
    try {
      backupDb?.close()
    } catch (closeErr) {
      console.warn(`[Backup] close failed for ${filePath}:`, closeErr instanceof Error ? closeErr.message : closeErr)
    }
  }
}

function validateApplicationBackup(filePath: string): { ok: boolean; missingTables: string[]; hasSchemaVersion: boolean } {
  const requiredTables = [
    'users',
    'settings',
    'voters',
    'petitions',
    'documents',
    'schedules',
    'audit_logs',
    'categories',
    'schema_migrations',
  ]
  let backupDb: Database.Database | null = null
  try {
    backupDb = new Database(filePath, { readonly: true })
    const tables = new Set(
      (backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
        .map(row => row.name)
    )
    const missingTables = requiredTables.filter(table => !tables.has(table))
    const hasSchemaVersion = missingTables.includes('schema_migrations')
      ? false
      : !!backupDb.prepare('SELECT version FROM schema_migrations ORDER BY rowid DESC LIMIT 1').get()
    return { ok: missingTables.length === 0 && hasSchemaVersion, missingTables, hasSchemaVersion }
  } finally {
    try {
      backupDb?.close()
    } catch (closeErr) {
      console.warn(`[Backup] close failed for ${filePath}:`, closeErr instanceof Error ? closeErr.message : closeErr)
    }
  }
}

export default async function backupRoutes(fastify: FastifyInstance) {
  // ===== 手動備份 — 下載資料庫檔案 =====
  fastify.get('/api/admin/backup/download', {
    preHandler: [requirePermission('system', 'edit')],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const cu = (request as any).currentUser
    // Force WAL checkpoint to ensure all data is in main DB
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e) {
      console.warn('[Backup] WAL checkpoint failed:', e)
    }
    // 先用 VACUUM INTO 產生乾淨的備份
    const tmpPath = path.join(getBackupsDir(), getBackupFileName())
    db.exec(`VACUUM INTO '${escapeSqlPath(tmpPath)}'`)
    const metadata = await buildBackupMetadata(tmpPath, { schemaVersion: getCurrentSchemaVersion() })
    let buf: Buffer
    try {
      buf = fs.readFileSync(tmpPath)
    } finally {
      try {
        fs.unlinkSync(tmpPath)
      } catch (cleanupErr) {
        console.warn(`[Backup] cleanup failed for ${tmpPath}:`, cleanupErr instanceof Error ? cleanupErr.message : cleanupErr)
      }
    }
    const fname = path.basename(tmpPath)
    createAuditLog(request, cu.id, { action: 'export', module: '系統備份', target_name: fname })
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`)
    reply.header('X-Backup-SHA256', metadata.sha256)
    reply.header('X-Backup-Signature-Algorithm', metadata.signature_algorithm)
    reply.header('X-Backup-Signature', metadata.signature)
    return reply.send(buf)
  })

  // ===== 列出本機備份清單 =====
  fastify.get('/api/admin/backup/list', { preHandler: [requirePermission('system', 'view')] }, async (request, reply) => {
    const files = (await Promise.all(fs.readdirSync(getBackupsDir())
      .filter(f => f.endsWith('.db'))
      .map(async f => {
        const filePath = resolveBackupPath(f)
        if (!filePath) return null
        const stat = fs.statSync(filePath)
        const metadata = readBackupMetadata(filePath)
        return {
          name: f,
          size: stat.size,
          created_at: stat.birthtime.toISOString(),
          signed: !!metadata,
          sha256: metadata?.sha256 ?? null,
          schema_version: metadata?.schema_version ?? null,
        }
      })))
      .filter((item): item is {
        name: string
        size: number
        created_at: string
        signed: boolean
        sha256: string | null
        schema_version: string | null
      } => !!item)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return reply.send({ success: true, data: files })
  })

  // ===== 備份到本機（不下載，儲存在 backups/ 目錄） =====
  fastify.post('/api/admin/backup', {
    preHandler: [requirePermission('system', 'edit')],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const cu = (request as any).currentUser
    const fname = getBackupFileName()
    const destPath = resolveBackupPath(fname)
    if (!destPath) return reply.code(500).send({ success: false, error: '無法建立備份檔案' })
    // Force WAL checkpoint to ensure all data is in main DB
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e) {
      console.warn('[Backup] WAL checkpoint failed:', e)
    }
    db.exec(`VACUUM INTO '${escapeSqlPath(destPath)}'`)
    const metadata = await buildBackupMetadata(destPath, { schemaVersion: getCurrentSchemaVersion() })
    writeBackupMetadata(destPath, metadata)
    const stat = fs.statSync(destPath)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO settings(key,value,updated_at)
      VALUES('last_backup', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(now)
    createAuditLog(request, cu.id, { action: 'export', module: '系統備份', target_name: fname })
    return reply.send({
      success: true,
      message: `備份完成：${fname}`,
      data: {
        name: fname,
        size: stat.size,
        sha256: metadata.sha256,
        signed: true,
        metadata_file: path.basename(getBackupMetadataPath(destPath)),
      },
    })
  })

  // ===== 還原備份 — 上傳 .db 檔案（可選同時上傳 .meta.json sidecar 或填 metadata field） =====
  // 測試環境放寬 rate limit；正式環境保留嚴格限制
  const restoreRate = process.env.NODE_ENV === 'test'
    ? { max: 100, timeWindow: '1 minute' }
    : { max: 3, timeWindow: '1 hour' }
  fastify.post('/api/admin/restore', {
    preHandler: [requirePermission('system', 'edit')],
    config: { rateLimit: restoreRate },
  }, async (request, reply) => {
    const cu = (request as any).currentUser

    // 收集 multipart：可帶 backup (.db) + 可選 metadata (.meta.json) + 可選 force flag
    let backupBuf: Buffer | null = null
    let backupName = ''
    let metadataJson: string | null = null
    let forceUnsigned = false

    try {
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type === 'file') {
          const filename = path.basename(part.filename || '').toLowerCase()
          if (filename.endsWith('.meta.json')) {
            metadataJson = (await part.toBuffer()).toString('utf8')
          } else if (filename.endsWith('.db')) {
            backupBuf = await part.toBuffer()
            backupName = part.filename
          } else {
            return reply.code(400).send({ success: false, error: `不支援的檔案：${part.filename}` })
          }
        } else if (part.type === 'field') {
          if (part.fieldname === 'force_unsigned' && (part.value === '1' || part.value === 'true')) {
            forceUnsigned = true
          } else if (part.fieldname === 'metadata' && typeof part.value === 'string') {
            metadataJson = part.value
          }
        }
      }
    } catch (e) {
      console.warn('[Restore] Multipart read failed:', e)
      return reply.code(413).send({ success: false, error: '備份檔案過大或讀取失敗' })
    }

    if (!backupBuf) return reply.code(400).send({ success: false, error: '請選擇備份檔案 (.db)' })
    if (backupBuf.length === 0) return reply.code(400).send({ success: false, error: '備份檔案不可為空' })

    // Step 1: Write to temp path first
    const tempPath = `${dbPath}.${Date.now()}-${crypto.randomBytes(6).toString('hex')}.tmp.db`
    try {
      fs.writeFileSync(tempPath, backupBuf)
    } catch (e) {
      console.warn('[Restore] Temp write failed:', e)
      return reply.code(500).send({ success: false, error: '無法寫入暫存檔案' })
    }

    // Step 2: Verify the temp copy with PRAGMA integrity_check + schema
    try {
      const integrity = runIntegrityCheck(tempPath)
      if (!integrity.ok) {
        fs.unlinkSync(tempPath)
        const errMsg = integrity.messages.slice(0, 5).join('; ')
        return reply.code(400).send({ success: false, error: `備份檔案完整性驗證失敗：${errMsg}` })
      }
      const schema = validateApplicationBackup(tempPath)
      if (!schema.ok) {
        fs.unlinkSync(tempPath)
        console.warn('[Restore] Backup schema validation failed:', schema)
        return reply.code(400).send({ success: false, error: '備份檔案不是本系統可還原格式' })
      }
    } catch (e) {
      try { fs.unlinkSync(tempPath) } catch {}
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Restore] Integrity check failed:', e instanceof Error ? e.message : e)
      }
      return reply.code(400).send({ success: false, error: '無法驗證備份檔案完整性' })
    }

    // Step 2.5: HMAC 簽章驗證（B-3）
    let signatureStatus: 'signed' | 'unsigned_legacy' | 'failed' = 'unsigned_legacy'
    let signatureReason: string | undefined
    if (metadataJson) {
      try {
        const sidecarPath = getBackupMetadataPath(tempPath)
        fs.writeFileSync(sidecarPath, metadataJson, { mode: 0o600 })
        const verification = await verifyBackupMetadata(tempPath)
        try { fs.unlinkSync(sidecarPath) } catch {}
        if (verification.ok) {
          signatureStatus = 'signed'
        } else {
          signatureStatus = 'failed'
          signatureReason = verification.reason
          fs.unlinkSync(tempPath)
          createAuditLog(request, cu.id, {
            action: 'check', module: '系統還原', target_name: backupName,
            detail: { stage: 'signature_verify', signature_status: 'failed', reason: verification.reason },
          })
          return reply.code(400).send({ success: false, error: `備份簽章驗證失敗（${verification.reason}），請改傳對應的 .meta.json 或確認備份未被竄改` })
        }
      } catch (e) {
        try { fs.unlinkSync(getBackupMetadataPath(tempPath)) } catch {}
        try { fs.unlinkSync(tempPath) } catch {}
        return reply.code(400).send({ success: false, error: 'metadata sidecar 解析失敗，請確認上傳的是對應 .meta.json 檔案' })
      }
    } else if (!forceUnsigned) {
      // 無 sidecar 且未傳 force_unsigned → 拒絕，避免靜默接受偽造備份
      fs.unlinkSync(tempPath)
      createAuditLog(request, cu.id, {
        action: 'check', module: '系統還原', target_name: backupName,
        detail: { stage: 'signature_verify', signature_status: 'missing_metadata' },
      })
      return reply.code(400).send({
        success: false,
        error: '此備份缺少 .meta.json 簽章。請一併上傳對應 sidecar；若確認備份來源安全，可重新上傳並勾選「強制接受未簽章備份」(force_unsigned=1)，操作會寫入稽核紀錄。',
      })
    } else {
      // force_unsigned: 仍寫稽核
      createAuditLog(request, cu.id, {
        action: 'check', module: '系統還原', target_name: backupName,
        detail: { stage: 'signature_verify', signature_status: 'unsigned_legacy', forced: true },
      })
    }

    // Step 3: Backup current database before replacing
    const currentBackup = path.join(getBackupsDir(), `pre-restore-${getBackupFileName()}`)
    try {
      db.exec(`VACUUM INTO '${escapeSqlPath(currentBackup)}'`)
      const metadata = await buildBackupMetadata(currentBackup, { schemaVersion: getCurrentSchemaVersion() })
      writeBackupMetadata(currentBackup, metadata)
    } catch (e) {
      try { fs.unlinkSync(tempPath) } catch {}
      console.warn('[Restore] Current DB backup failed:', e)
      return reply.code(500).send({ success: false, error: '無法備份目前資料庫' })
    }

    // Step 4: Move temp file to restore path (verified before replacing)
    // 由於 DatabaseSync 不支援動態替換，將已驗證的檔案移至還原路徑後通知前端重啟
    const restorePath = dbPath + '.restore'
    try {
      fs.renameSync(tempPath, restorePath)
    } catch (e) {
      // If rename fails (e.g. cross-device), fall back to copy+delete
      try {
        fs.copyFileSync(tempPath, restorePath)
        fs.unlinkSync(tempPath)
      } catch (e2) {
        try { fs.unlinkSync(tempPath) } catch {}
        console.warn('[Restore] Moving restore file failed:', e2)
        return reply.code(500).send({ success: false, error: '無法移動還原檔案' })
      }
    }

    createAuditLog(request, cu.id, {
      action: 'update', module: '系統還原', target_name: backupName,
      detail: { signature_status: signatureStatus, signature_reason: signatureReason ?? null },
    })
    return reply.send({
      success: true,
      message: '還原檔案已驗證並上傳，請重新啟動系統以完成還原',
      data: {
        restoreFile: path.basename(restorePath),
        currentBackup: path.basename(currentBackup),
        signature_status: signatureStatus,
      },
    })
  })

  // ===== 備份狀態 =====
  fastify.get('/api/admin/backup/status', { preHandler: [requirePermission('system', 'view')] }, async (request, reply) => {
    const lastBackup = (db.prepare("SELECT value FROM settings WHERE key='last_backup'").get() as any)?.value ?? null
    const lastAutoBackup = (db.prepare("SELECT value FROM settings WHERE key='last_auto_backup'").get() as any)?.value ?? null
    const autoBackupEnabled = (db.prepare("SELECT value FROM settings WHERE key='auto_backup_enabled'").get() as any)?.value ?? '0'
    const lastAutoBackupError = (db.prepare("SELECT value FROM settings WHERE key='last_auto_backup_error'").get() as any)?.value ?? null
    const lastAutoBackupErrorAt = (db.prepare("SELECT value FROM settings WHERE key='last_auto_backup_error_at'").get() as any)?.value ?? null
    const lastErrorRow = db.prepare(
      `SELECT target_name FROM audit_logs WHERE action='error' AND module='自動備份' ORDER BY created_at DESC LIMIT 1`
    ).get() as any
    const lastError = lastAutoBackupError || lastErrorRow?.target_name || null
    return reply.send({
      success: true,
      data: {
        last_backup: lastBackup,
        last_auto_backup: lastAutoBackup,
        auto_backup_enabled: autoBackupEnabled,
        last_error: lastError,
        last_error_at: lastAutoBackupErrorAt,
      },
    })
  })

  // ===== E-5: 驗證備份完整性 =====
  fastify.get('/api/backup/verify/:filename', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const { filename } = request.params as any
    const safeName = path.basename(filename)
    const filePath = resolveBackupPath(safeName)
    if (!filePath) {
      return reply.code(400).send({ success: false, error: '無效的檔案名稱' })
    }
    if (!fs.existsSync(filePath)) return reply.code(404).send({ success: false, error: '備份檔案不存在' })
    try {
      const integrity = runIntegrityCheck(filePath)
      const schema = validateApplicationBackup(filePath)
      const signature = await verifyBackupMetadata(filePath)
      const signatureStatus = signature.ok ? 'ok' : signature.reason
      return reply.send({
        success: true,
        data: {
          filename: safeName,
          integrity_check: integrity.messages[0] || 'unknown',
          messages: integrity.ok ? [] : integrity.messages.slice(0, 10),
          application_schema_ok: schema.ok,
          signed: signature.ok,
          signature_ok: signature.ok,
          signature_status: signatureStatus,
          trust_level: signature.ok ? 'signed' : signatureStatus === 'missing_metadata' ? 'unsigned_legacy' : 'failed',
          backup_file_ok: integrity.ok && schema.ok,
          ok: integrity.ok && schema.ok && (signature.ok || signatureStatus === 'missing_metadata'),
        },
      })
    } catch (e) {
      console.warn('[Backup] Verification failed:', e)
      return reply.code(500).send({ success: false, error: '無法開啟備份檔案' })
    }
  })

  // ===== 下載指定本機備份的 .meta.json sidecar =====
  // 配合 /api/admin/backup/list 的檔名，讓使用者可以把 .db + .meta.json
  // 一起搬到外部儲存，方便日後 restore 時通過 HMAC 驗證。
  fastify.get('/api/admin/backup/download-meta', {
    preHandler: [requirePermission('system', 'view')],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const { file } = request.query as { file?: string }
    if (!file) return reply.code(400).send({ success: false, error: 'file 參數為必填' })
    const safeName = path.basename(file)
    const dbPath = resolveBackupPath(safeName)
    if (!dbPath || !fs.existsSync(dbPath)) {
      return reply.code(404).send({ success: false, error: '備份不存在' })
    }
    const metaPath = getBackupMetadataPath(dbPath)
    if (!fs.existsSync(metaPath)) {
      return reply.code(404).send({ success: false, error: '此備份沒有對應的 .meta.json sidecar' })
    }
    const buf = fs.readFileSync(metaPath)
    const metaName = path.basename(metaPath)
    reply.header('Content-Type', 'application/json; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(metaName)}`)
    return reply.send(buf)
  })

  // ===== 刪除本機備份 =====
  fastify.delete('/api/admin/backup/:name', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { name } = request.params as any
    // 防路徑穿越
    const safeName = path.basename(name)
    const filePath = resolveBackupPath(safeName)
    if (!filePath) {
      return reply.code(400).send({ success: false, error: '無效的檔案名稱' })
    }
    if (!fs.existsSync(filePath)) return reply.code(404).send({ success: false, error: '備份不存在' })
    fs.unlinkSync(filePath)
    try {
      const metadataPath = getBackupMetadataPath(filePath)
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath)
    } catch (e) {
      console.warn('[Backup] Metadata delete failed:', e)
    }
    createAuditLog(request, cu.id, { action: 'delete', module: '系統備份', target_name: safeName })
    return reply.send({ success: true, message: '備份已刪除' })
  })

  // ===== 取得備份目錄 =====
  fastify.get('/api/admin/backup/path', { preHandler: [requirePermission('system', 'view')] }, async (_request, reply) => {
    const allowedRoots = getBackupAllowedRoots()
    return reply.send({
      success: true,
      data: {
        path: getBackupsDir(),
        whitelist_enforced: allowedRoots.length > 0,
        allowed_roots: allowedRoots,
      },
    })
  })

  // ===== 設定備份目錄 =====
  fastify.post('/api/admin/backup/path', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { path: newPath } = request.body as any
    if (!newPath || typeof newPath !== 'string') {
      return reply.code(400).send({ success: false, error: '請提供備份目錄路徑' })
    }
    // 防路徑穿越：解析絕對路徑後確認不含 '..' 元件
    const resolvedPath = path.resolve(newPath)
    if (resolvedPath !== path.normalize(resolvedPath) || newPath.includes('..')) {
      return reply.code(400).send({ success: false, error: '路徑不合法（含 .. 穿越片段）' })
    }
    if (!isBackupPathAllowed(resolvedPath)) {
      return reply.code(400).send({ success: false, error: '備份目錄不在系統允許範圍內' })
    }
    // 驗證可寫入
    try {
      fs.mkdirSync(resolvedPath, { recursive: true })
      const testFile = path.join(resolvedPath, '.write-test')
      fs.writeFileSync(testFile, '')
      fs.unlinkSync(testFile)
    } catch (e) {
      console.warn('[Backup] Backup path write check failed:', e)
      return reply.code(400).send({ success: false, error: '無法寫入目錄，請確認權限與磁碟可用空間' })
    }
    setSetting('backup_path', resolvedPath)
    // 清除快取，下次請求重新讀取新路徑
    _cachedBackupsDir = null
    createAuditLog(request, cu.id, { action: 'update', module: '備份設定', target_name: resolvedPath })
    return reply.send({ success: true, message: '備份目錄已更新', data: { path: resolvedPath } })
  })
}
