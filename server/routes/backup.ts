import { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { db, dbPath } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { getSetting, setSetting } from '../utils/settings'
import fs from 'fs'
import path from 'path'

const defaultBackupsDir = process.env.BACKUPS_PATH || path.join(process.cwd(), 'backups')
if (!fs.existsSync(defaultBackupsDir)) fs.mkdirSync(defaultBackupsDir, { recursive: true })

// 模組級快取，避免每次請求重複讀取 DB
let _cachedBackupsDir: string | null = null

function getBackupsDir(): string {
  if (_cachedBackupsDir) return _cachedBackupsDir
  try {
    const saved = getSetting('backup_path')
    const dir = (saved && typeof saved === 'string' && saved.trim()) ? saved.trim() : defaultBackupsDir
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
  return `voter-service-${ts}.db`
}

export default async function backupRoutes(fastify: FastifyInstance) {
  // ===== 手動備份 — 下載資料庫檔案 =====
  fastify.get('/api/admin/backup/download', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
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
    let buf: Buffer
    try {
      buf = fs.readFileSync(tmpPath)
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
    const fname = path.basename(tmpPath)
    createAuditLog(request, cu.id, { action: 'export', module: '系統備份', target_name: fname })
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`)
    return reply.send(buf)
  })

  // ===== 列出本機備份清單 =====
  fastify.get('/api/admin/backup/list', { preHandler: [requirePermission('system', 'view')] }, async (request, reply) => {
    const files = fs.readdirSync(getBackupsDir())
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(getBackupsDir(), f))
        return { name: f, size: stat.size, created_at: stat.birthtime.toISOString() }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return reply.send({ success: true, data: files })
  })

  // ===== 備份到本機（不下載，儲存在 backups/ 目錄） =====
  fastify.post('/api/admin/backup', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const fname = getBackupFileName()
    const destPath = path.join(getBackupsDir(), fname)
    // Force WAL checkpoint to ensure all data is in main DB
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e) {
      console.warn('[Backup] WAL checkpoint failed:', e)
    }
    db.exec(`VACUUM INTO '${escapeSqlPath(destPath)}'`)
    const stat = fs.statSync(destPath)
    createAuditLog(request, cu.id, { action: 'export', module: '系統備份', target_name: fname })
    return reply.send({ success: true, message: `備份完成：${fname}`, data: { name: fname, size: stat.size } })
  })

  // ===== 還原備份 — 上傳 .db 檔案 =====
  fastify.post('/api/admin/restore', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const data = await request.file()
    if (!data) return reply.code(400).send({ success: false, error: '請選擇備份檔案' })
    if (!data.filename.endsWith('.db')) return reply.code(400).send({ success: false, error: '只接受 .db 格式的備份檔案' })

    const buf = await data.toBuffer()

    // Step 1: Write to temp path first
    const tempPath = dbPath + '.tmp.db'
    try {
      fs.writeFileSync(tempPath, buf)
    } catch (e) {
      return reply.code(500).send({ success: false, error: '無法寫入暫存檔案：' + String(e) })
    }

    // Step 2: Verify the temp copy with PRAGMA integrity_check
    try {
      const tempDb = new Database(tempPath, { readonly: true })
      const integrityResult = tempDb.prepare('PRAGMA integrity_check').get() as any
      tempDb.close()
      if (integrityResult?.integrity_check !== 'ok') {
        fs.unlinkSync(tempPath)
        return reply.code(400).send({ success: false, error: `備份檔案完整性驗證失敗：${integrityResult?.integrity_check}` })
      }
    } catch (e) {
      try { fs.unlinkSync(tempPath) } catch {}
      return reply.code(400).send({ success: false, error: '無法驗證備份檔案完整性：' + String(e) })
    }

    // Step 3: Backup current database before replacing
    const currentBackup = path.join(getBackupsDir(), `pre-restore-${getBackupFileName()}`)
    try {
      db.exec(`VACUUM INTO '${escapeSqlPath(currentBackup)}'`)
    } catch (e) {
      try { fs.unlinkSync(tempPath) } catch {}
      return reply.code(500).send({ success: false, error: '無法備份目前資料庫：' + String(e) })
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
        return reply.code(500).send({ success: false, error: '無法移動還原檔案：' + String(e2) })
      }
    }

    createAuditLog(request, cu.id, { action: 'update', module: '系統還原', target_name: data.filename })
    return reply.send({
      success: true,
      message: '還原檔案已驗證並上傳，請重新啟動系統以完成還原',
      data: { restoreFile: path.basename(restorePath), currentBackup: path.basename(currentBackup) },
    })
  })

  // ===== 備份狀態 =====
  fastify.get('/api/admin/backup/status', { preHandler: [requirePermission('system', 'view')] }, async (request, reply) => {
    const lastBackup = (db.prepare("SELECT value FROM settings WHERE key='last_backup'").get() as any)?.value ?? null
    const lastAutoBackup = (db.prepare("SELECT value FROM settings WHERE key='last_auto_backup'").get() as any)?.value ?? null
    const autoBackupEnabled = (db.prepare("SELECT value FROM settings WHERE key='auto_backup_enabled'").get() as any)?.value ?? '0'
    const lastErrorRow = db.prepare(
      `SELECT target_name FROM audit_logs WHERE action='error' AND module='自動備份' ORDER BY created_at DESC LIMIT 1`
    ).get() as any
    const lastError = lastErrorRow?.target_name ?? null
    return reply.send({
      success: true,
      data: {
        last_backup: lastBackup,
        last_auto_backup: lastAutoBackup,
        auto_backup_enabled: autoBackupEnabled,
        last_error: lastError,
      },
    })
  })

  // ===== E-5: 驗證備份完整性 =====
  fastify.get('/api/backup/verify/:filename', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const { filename } = request.params as any
    const safeName = path.basename(filename)
    if (!safeName.endsWith('.db') || safeName.includes('..')) {
      return reply.code(400).send({ success: false, error: '無效的檔案名稱' })
    }
    const filePath = path.join(getBackupsDir(), safeName)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ success: false, error: '備份檔案不存在' })
    try {
      const backupDb = new Database(filePath, { readonly: true })
      const result = (backupDb.prepare('PRAGMA integrity_check').get() as any)?.integrity_check ?? 'unknown'
      backupDb.close()
      return reply.send({ success: true, data: { filename: safeName, integrity_check: result, ok: result === 'ok' } })
    } catch (e) {
      return reply.code(500).send({ success: false, error: '無法開啟備份檔案：' + String(e) })
    }
  })

  // ===== 刪除本機備份 =====
  fastify.delete('/api/admin/backup/:name', { preHandler: [requirePermission('system', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { name } = request.params as any
    // 防路徑穿越
    const safeName = path.basename(name)
    if (!safeName.endsWith('.db') || safeName.includes('..')) {
      return reply.code(400).send({ success: false, error: '無效的檔案名稱' })
    }
    const filePath = path.join(getBackupsDir(), safeName)
    if (!fs.existsSync(filePath)) return reply.code(404).send({ success: false, error: '備份不存在' })
    fs.unlinkSync(filePath)
    createAuditLog(request, cu.id, { action: 'delete', module: '系統備份', target_name: safeName })
    return reply.send({ success: true, message: '備份已刪除' })
  })

  // ===== 取得備份目錄 =====
  fastify.get('/api/admin/backup/path', { preHandler: [requirePermission('system', 'view')] }, async (_request, reply) => {
    return reply.send({ success: true, data: { path: getBackupsDir() } })
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
    // 驗證可寫入
    try {
      fs.mkdirSync(resolvedPath, { recursive: true })
      const testFile = path.join(resolvedPath, '.write-test')
      fs.writeFileSync(testFile, '')
      fs.unlinkSync(testFile)
    } catch (e) {
      return reply.code(400).send({ success: false, error: `無法寫入目錄：${String(e)}` })
    }
    setSetting('backup_path', resolvedPath)
    // 清除快取，下次請求重新讀取新路徑
    _cachedBackupsDir = null
    createAuditLog(request, cu.id, { action: 'update', module: '備份設定', target_name: resolvedPath })
    return reply.send({ success: true, message: '備份目錄已更新', data: { path: resolvedPath } })
  })
}
