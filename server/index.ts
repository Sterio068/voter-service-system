import Fastify, { FastifyError } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import { subscribe as wsSubscribe, unsubscribe as wsUnsubscribe } from './utils/realtimeBus'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { exec } from 'child_process'
import { runMigrations } from './db/migrate'
import { db } from './db/index'
import { getSetting, setSetting } from './utils/settings'
import { applySecurityHeaders } from './utils/securityHeaders'
import { sendSpaFallback } from './utils/spaFallback'
import { applyDataRetention, getDataRetentionPolicy } from './utils/dataRetention'
import { authenticate, requirePermission } from './middleware/auth'
import authRoutes from './routes/auth'
import adminRoutes from './routes/admin'
import voterRoutes from './routes/voters'
import petitionRoutes from './routes/petitions'
import documentRoutes from './routes/documents'
import scheduleRoutes from './routes/schedules'
import groupRoutes from './routes/groups'
import importExportRoutes from './routes/importExport'
import backupRoutes from './routes/backup'
import contactRecordRoutes from './routes/contactRecords'
import electionAreaRoutes from './routes/electionAreas'
import taskRoutes from './routes/tasks'
import eventRoutes from './routes/events'
import notificationRoutes from './routes/notifications'
import surveyRoutes from './routes/surveys'
import reportRoutes from './routes/reports'
import consultationRoutes from './routes/consultations'
import dailyLogRoutes from './routes/dailyLogs'
import lineWebhookRoutes from './routes/lineWebhook'
import searchRoutes from './routes/search'
import attachmentRoutes from './routes/attachments'
import googleCalendarRoutes from './routes/googleCalendar'
import vendorRoutes from './routes/vendors'
import ceremonyRoutes from './routes/ceremonies'
import expenseRoutes from './routes/expenses'
import proposalRoutes from './routes/proposals'
import aiRoutes from './routes/ai'
import savedFiltersRoutes from './routes/savedFilters'

const PORT = parseInt(process.env.PORT || '8080')
const HOST = process.env.HOST || '0.0.0.0'
let schedulesStarted = false

// Catch unhandled errors to prevent complete process death
process.on('uncaughtException', (error: Error) => {
  console.error('[FATAL] Uncaught exception:', error.message, error.stack)
  // Try to log to DB
  try {
    db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
      .run(0, 'fatal_error', '系統', 'process_error', JSON.stringify({ message: error.message }))
  } catch {}
  // Don't exit - let Fastify handle gracefully
})

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[WARN] Unhandled rejection:', reason)
  try {
    const msg = reason instanceof Error ? reason.message : String(reason)
    db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
      .run(0, 'unhandled_rejection', '系統', 'process_error', JSON.stringify({ message: msg }))
  } catch {}
})

export async function buildServer() {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test',
    trustProxy: true,
  })

  fastify.addHook('onRequest', async (_request, reply) => {
    applySecurityHeaders(reply)
  })

  // 先執行資料庫遷移，以便可從 settings 讀取 jwt_secret
  await runMigrations()

  // JWT secret：優先使用環境變數，否則從 DB 取出或自動產生隨機值並儲存
  const jwtSecret = (() => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET
    let existingSecret: string | null = null
    try {
      existingSecret = getSetting('jwt_secret')
    } catch (error) {
      console.error('[Security] Failed to decrypt JWT secret. Check VOTER_SERVICE_SETTINGS_KEY / SETTINGS_ENCRYPTION_KEY.')
      throw error
    }
    if (existingSecret && existingSecret.length >= 32) return existingSecret

    const { randomBytes } = require('crypto')
    const newSecret: string = randomBytes(32).toString('hex')
    try {
      setSetting('jwt_secret', newSecret)
    } catch (error) {
      console.error('[Security] Failed to persist generated JWT secret.')
      throw error
    }
    console.log('[Security] Generated new JWT secret and stored in settings')
    return newSecret
  })()

  // JWT 設定
  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  })

  // CORS
  await fastify.register(fastifyCors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  })

  // Cookie
  await fastify.register(fastifyCookie)

  // API rate limiting：先加全域保護，再由登入/Webhook 等敏感路由覆寫更嚴格限制。
  await fastify.register(fastifyRateLimit, {
    max: Number.parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      success: false,
      error: '請求過於頻繁，請稍後再試',
      retry_after: context.after,
    }),
  })

  // 檔案上傳
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  })

  // 上傳目錄（支援自訂路徑 / NAS）
  const uploadsDir = process.env.UPLOADS_PATH ||
    (process.env.NODE_ENV === 'production'
      ? (() => { try { return require('electron').app.getPath('userData') + '/uploads' } catch { return path.join(process.cwd(), 'uploads') } })()
      : path.join(process.cwd(), 'uploads'))
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  // 靜態前端（生產模式）
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../dist')
    const indexHtmlPath = path.join(distPath, 'index.html')
    await fastify.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      decorateReply: false,
    })

    // SPA fallback
    fastify.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api/')) {
        return sendSpaFallback(reply, indexHtmlPath)
      } else {
        return reply.code(404).send({ success: false, error: 'Not Found' })
      }
    })
  }

  // WebSocket：即時推播 audit 事件，取代輪詢
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 64 * 1024, // 64KB upper-bound on incoming frames
    },
  })

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    // JWT 驗證：優先讀 ?token= query；保留 Authorization header 作為相容後援
    const tokenFromQuery = (request.query as any)?.token as string | undefined
    const authHeader = request.headers['authorization']
    const headerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined
    const rawToken = tokenFromQuery || headerToken

    if (!rawToken) {
      try { socket.close(1008, 'unauthorized') } catch {}
      return
    }

    try {
      ;(fastify as any).jwt.verify(rawToken)
    } catch {
      try { socket.close(1008, 'unauthorized') } catch {}
      return
    }

    wsSubscribe(socket as any)

    // Heartbeat：每 30s ping 一次；若 60s 內未收到 pong 視為失聯。
    let alive = true
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { socket.terminate() } catch { try { socket.close() } catch {} }
        return
      }
      alive = false
      try {
        if (typeof (socket as any).ping === 'function') {
          ;(socket as any).ping()
        } else {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      } catch {}
    }, 30000)

    if (typeof (socket as any).on === 'function') {
      ;(socket as any).on('pong', () => { alive = true })
      ;(socket as any).on('message', (raw: any) => {
        // 任何下行訊息都視為仍然活著；客戶端可選擇回 'pong' 字串。
        alive = true
        try {
          const text = typeof raw === 'string' ? raw : raw.toString()
          if (text === 'pong' || text === '"pong"') return
        } catch {}
      })
    }

    socket.on('close', () => {
      clearInterval(heartbeat)
      wsUnsubscribe(socket as any)
    })
    socket.on('error', () => {
      clearInterval(heartbeat)
      wsUnsubscribe(socket as any)
    })
  })

  // 路由
  await fastify.register(authRoutes)
  await fastify.register(adminRoutes)
  await fastify.register(voterRoutes)
  await fastify.register(petitionRoutes)
  await fastify.register(documentRoutes)
  await fastify.register(scheduleRoutes)
  await fastify.register(groupRoutes)
  await fastify.register(importExportRoutes)
  await fastify.register(backupRoutes)
  await fastify.register(contactRecordRoutes)
  await fastify.register(electionAreaRoutes)
  await fastify.register(taskRoutes)
  await fastify.register(eventRoutes)
  await fastify.register(notificationRoutes)
  await fastify.register(surveyRoutes)
  await fastify.register(reportRoutes)
  await fastify.register(consultationRoutes)
  await fastify.register(dailyLogRoutes)
  await fastify.register(lineWebhookRoutes)
  await fastify.register(searchRoutes)
  await fastify.register(attachmentRoutes)
  await fastify.register(googleCalendarRoutes)
  await fastify.register(vendorRoutes)
  await fastify.register(ceremonyRoutes)
  await fastify.register(expenseRoutes)
  await fastify.register(proposalRoutes)
  await fastify.register(aiRoutes)
  await fastify.register(savedFiltersRoutes)

  // 全域錯誤處理
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    if ((error as any).name === 'AppError') {
      const appErr = error as any
      return reply.code(appErr.statusCode).send({ success: false, error: { code: appErr.statusCode, message: appErr.message } })
    }

    const statusCode = error.statusCode || 500
    const code = (error as any).code || ''

    // SQLite constraint errors → 400
    if (code === 'ERR_SQLITE_ERROR' || (typeof code === 'string' && code.startsWith('SQLITE_'))) {
      const msg = error.message || ''
      if (msg.includes('NOT NULL constraint failed')) {
        const field = msg.split('.').pop() || '欄位'
        return reply.code(400).send({ success: false, error: { code: 400, message: `必填欄位「${field}」不可為空` } })
      }
      if (msg.includes('UNIQUE constraint failed')) {
        return reply.code(409).send({ success: false, error: { code: 409, message: '資料重複，請確認是否已存在相同資料' } })
      }
      // 不回傳原始 SQLite 訊息（含欄位/表名稱），避免洩露 schema
      console.error('[DB Error]', msg)
      return reply.code(400).send({ success: false, error: { code: 400, message: '資料庫操作失敗，請稍後再試' } })
    }

    if (statusCode === 400) {
      return reply.code(400).send({ success: false, error: { code: 400, message: error.message || '請求格式錯誤' } })
    }

    if (statusCode === 429) {
      return reply.code(429).send({ success: false, error: '請求過於頻繁，請稍後再試' })
    }

    const msg = error.message || 'Unknown error'
    console.error(`[API Error] ${request.method} ${request.url}: ${msg}`)
    // Log to DB for 5xx errors
    if (statusCode >= 500) {
      try {
        db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
          .run(0, 'api_error', 'API', 'server_error', JSON.stringify({ url: request.url, method: request.method, error: msg }))
      } catch {}
    }

    fastify.log.error(error)
    return reply.code(statusCode).send({ success: false, error: { code: statusCode, message: '伺服器內部錯誤，請稍後再試' } })
  })

  // 健康檢查
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // 取得區網 IP
  fastify.get('/api/network-info', { preHandler: [authenticate] }, async () => {
    const interfaces = os.networkInterfaces()
    const ips: string[] = []
    for (const iface of Object.values(interfaces)) {
      if (!iface) continue
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          ips.push(alias.address)
        }
      }
    }
    return { success: true, data: { ips, port: PORT } }
  })

  // 偵測 Tailscale 狀態
  fastify.get('/api/admin/tailscale/status', { preHandler: [requirePermission('system', 'view')] }, async (_req, reply) => {
    const getTailscaleIp = (): Promise<{ installed: boolean; running: boolean; ip: string | null }> =>
      new Promise(resolve => {
        // Windows 下指令路徑可能需要完整路徑
        const cmd = process.platform === 'win32'
          ? 'tailscale ip -4'
          : 'tailscale ip -4 2>/dev/null || /usr/local/bin/tailscale ip -4 2>/dev/null'
        exec(cmd, { timeout: 6000 }, (err, stdout) => {
          if (err) {
            // code 127 = command not found（Unix）
            // ENOENT = 執行檔不存在
            const msg = (err.message || '').toLowerCase()
            const notInstalled = (err as any).code === 127
              || msg.includes('not found')
              || msg.includes('no such file')
              || msg.includes('is not recognized')   // Windows
              || (err as any).code === 'ENOENT'
            resolve({ installed: !notInstalled, running: false, ip: null })
          } else {
            const ip = stdout.trim().split('\n')[0].trim()
            resolve({ installed: true, running: !!ip, ip: ip || null })
          }
        })
      })

    const result = await getTailscaleIp()
    return reply.send({ success: true, data: { ...result, port: PORT } })
  })

  return fastify
}

function getSettingValue(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any
    return row?.value ?? null
  } catch { return null }
}

function setSettingValue(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key, value)
}

// A-2: Scheduler last-run tracking helpers
function getLastRun(taskName: string): Date | null {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(`scheduler_last_run_${taskName}`) as any
    if (!row?.value) return null
    return new Date(row.value)
  } catch { return null }
}

function setLastRun(taskName: string): void {
  try {
    db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(`scheduler_last_run_${taskName}`, new Date().toISOString())
  } catch {}
}

function shouldRunCatchUp(taskName: string, intervalHours: number): boolean {
  const last = getLastRun(taskName)
  if (!last) return true
  const hoursSince = (Date.now() - last.getTime()) / (1000 * 60 * 60)
  return hoursSince >= intervalHours
}

function scheduleAutoBackup() {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000 // check every hour

  const doCheck = () => {
    try {
      if (getSettingValue('auto_backup_enabled') !== '1') return

      const interval = getSettingValue('auto_backup_interval') || 'daily'
      const intervalMs = interval === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000

      const lastStr = getSettingValue('last_auto_backup')
      const lastMs = lastStr ? new Date(lastStr).getTime() : 0
      if (Date.now() - lastMs < intervalMs) return

      // Perform backup
      const backupDir = process.env.BACKUPS_PATH || path.join(process.cwd(), 'backups')
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(backupDir, `auto-${ts}.db`)
      db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)

      const now = new Date().toISOString()
      setSettingValue('last_auto_backup', now)
      setSettingValue('last_auto_backup_error', '')
      setSettingValue('last_auto_backup_error_at', '')
      console.log(`✅ 自動備份完成：${backupPath}`)

      // Keep only last 10 auto-backups
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('auto-') && f.endsWith('.db'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
      files.slice(10).forEach(f => {
        try { fs.unlinkSync(path.join(backupDir, f.name)) } catch {}
      })
    } catch (e) {
      console.error('自動備份失敗：', e)
      const message = e instanceof Error ? e.message : String(e)
      setSettingValue('last_auto_backup_error', message)
      setSettingValue('last_auto_backup_error_at', new Date().toISOString())
      try {
        db.prepare(`INSERT INTO audit_logs(user_id, action, module, target_name, created_at)
          VALUES(1,'error','自動備份','自動備份失敗：' || ?,datetime('now','localtime'))`).run(message)
      } catch {}
    }
  }

  // Run once after 1 minute, then every hour
  setTimeout(() => { doCheck(); setInterval(doCheck, CHECK_INTERVAL_MS) }, 60 * 1000)
}

function scheduleConsistencyCheck() {
  // Run daily at 2am
  const now = new Date()
  const next2am = new Date(now)
  next2am.setHours(2, 0, 0, 0)
  if (next2am <= now) next2am.setDate(next2am.getDate() + 1)
  const msUntil2am = next2am.getTime() - now.getTime()

  setTimeout(() => {
    runConsistencyCheck()
    setLastRun('consistency_check')
    setInterval(() => {
      runConsistencyCheck()
      setLastRun('consistency_check')
    }, 24 * 60 * 60 * 1000)
  }, msUntil2am)
}

function runConsistencyCheck() {
  try {
    const issues: string[] = []

    // Closed petitions with incomplete tasks
    const closedWithTasks = db.prepare(`
      SELECT COUNT(*) as c FROM tasks t
      JOIN petitions p ON t.related_petition_id=p.id
      WHERE p.status='closed' AND t.status NOT IN ('done','cancelled')
    `).get() as any
    if (closedWithTasks.c > 0) issues.push(`已結案陳情有 ${closedWithTasks.c} 個未完成待辦`)

    // Petitions with passed follow_up_date but not closed
    const overdueFollowups = db.prepare(`
      SELECT COUNT(*) as c FROM petitions
      WHERE follow_up_date < date('now') AND status NOT IN ('closed','cancelled')
    `).get() as any
    if (overdueFollowups.c > 0) issues.push(`${overdueFollowups.c} 件陳情追蹤日已過期`)

    // A-4: Voters with contact_count mismatch (soft check - just log)
    try {
      const mismatch = db.prepare(`
        SELECT COUNT(*) as c FROM voters v
        WHERE v.is_active=1 AND (SELECT COUNT(*) FROM contact_records WHERE voter_id=v.id) != COALESCE(v.activity_score,0)
      `).get() as any
      if (mismatch.c > 0) console.warn(`[ConsistencyCheck] ${mismatch.c} 位選民聯絡次數與 activity_score 不符（軟性警告）`)
    } catch {}

    // A-4: Petitions with follow_up_date < today and status not closed
    try {
      const overdueFollowUpDate = db.prepare(`
        SELECT COUNT(*) as c FROM petitions
        WHERE follow_up_date < date('now') AND status NOT IN ('closed','cancelled')
      `).get() as any
      if (overdueFollowUpDate.c > 0) issues.push(`${overdueFollowUpDate.c} 件陳情追蹤日期已逾期未結案`)
    } catch {}

    // A-4: Tasks assigned to soft-deleted voters
    try {
      const ghostTasks = db.prepare(`
        SELECT COUNT(*) as c FROM tasks t
        JOIN voters v ON t.related_voter_id=v.id
        WHERE v.is_active=0 AND t.status NOT IN ('done','cancelled')
      `).get() as any
      if (ghostTasks.c > 0) issues.push(`${ghostTasks.c} 個待辦指派給已停用選民`)
    } catch {}

    if (issues.length > 0) {
      db.prepare("INSERT INTO audit_logs (user_id,action,module,detail,created_at) VALUES (1,'check','系統一致性',?,datetime('now','localtime'))").run(JSON.stringify(issues))
    }
  } catch (e) {
    console.error('Consistency check error:', e)
  }
}

// E-5: Weekly backup integrity check
function scheduleWeeklyBackupVerify() {
  const getNextMonday3am = () => {
    const now = new Date()
    const d = new Date(now)
    // Day of week: 0=Sun, 1=Mon
    const daysUntilMonday = (1 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysUntilMonday)
    d.setHours(3, 0, 0, 0)
    if (d <= now) d.setDate(d.getDate() + 7)
    return d
  }

  const runVerify = () => {
    try {
      const backupDir = process.env.BACKUPS_PATH || path.join(process.cwd(), 'backups')
      if (!fs.existsSync(backupDir)) return
      const files = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.db'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
      if (files.length === 0) return
      const BetterSqlite3 = require('better-sqlite3')
      const latestFile = files[0].name
      const filePath = path.join(backupDir, latestFile)
      let result: any = 'unknown'
      let backupDb: any = null
      try {
        backupDb = new BetterSqlite3(filePath, { readonly: true })
        result = (backupDb.prepare('PRAGMA integrity_check').get() as any)?.integrity_check ?? 'unknown'
      } catch (dbErr) {
        result = String(dbErr)
      } finally {
        try { backupDb?.close() } catch {}
      }
      const detail = JSON.stringify({ file: latestFile, result, checked_at: new Date().toISOString() })
      console.log(`[WeeklyBackupVerify] ${latestFile}: ${result}`)
      db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,target_name,detail,created_at) VALUES(1,'check','系統備份','backup_verify',?,?,datetime('now','localtime'))`).run(latestFile, detail)
      setLastRun('backup_verify')
    } catch (e) {
      console.error('[WeeklyBackupVerify] Error:', e)
    }
    const next = getNextMonday3am()
    setTimeout(runVerify, next.getTime() - Date.now())
  }

  const first = getNextMonday3am()
  setTimeout(runVerify, first.getTime() - Date.now())
}

// C-4: Daily 9am anomaly alert job
function scheduleDailyAlerts() {
  const now = new Date()
  const next9am = new Date(now)
  next9am.setHours(9, 0, 0, 0)
  if (now >= next9am) next9am.setDate(next9am.getDate() + 1)
  const msUntil = next9am.getTime() - now.getTime()

  setTimeout(function runAlerts() {
    checkAndCreateAlerts()
    setLastRun('daily_alerts')
    setTimeout(runAlerts, 24 * 60 * 60 * 1000)
  }, msUntil)
}

function checkAndCreateAlerts() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Check 1: overdue petitions > 5
    const overdue = (db.prepare(`SELECT COUNT(*) as c FROM petitions WHERE due_date < ? AND status NOT IN ('closed','cancelled')`).get(today) as any).c

    // Check 2: uncontacted voters > 100 for 60+ days
    const uncontacted = (db.prepare(`
      SELECT COUNT(*) as c
      FROM voters v
      WHERE v.is_active=1
        AND NOT EXISTS (
          SELECT 1 FROM contact_records cr
          WHERE cr.voter_id=v.id AND cr.contact_date >= ?
        )
    `).get(twoMonthsAgo) as any).c

    // Check 3: petition count increase vs last month
    const thisMonthStart = today.slice(0, 7) + '-01'
    const lastMonthStart = lastMonth.slice(0, 7) + '-01'
    const thisMonthCount = (db.prepare(`SELECT COUNT(*) as c FROM petitions WHERE petition_date >= ?`).get(thisMonthStart) as any).c
    const lastMonthCount = (db.prepare(`SELECT COUNT(*) as c FROM petitions WHERE petition_date >= ? AND petition_date < ?`).get(lastMonthStart, thisMonthStart) as any).c

    const alerts: string[] = []
    if (overdue > 5) alerts.push(`逾期陳情 ${overdue} 件`)
    if (uncontacted > 100) alerts.push(`超過 60 天未聯絡選民 ${uncontacted} 位`)
    if (lastMonthCount > 0 && thisMonthCount > lastMonthCount * 1.2) alerts.push(`本月陳情量已達上月 ${Math.round(thisMonthCount / lastMonthCount * 100)}%，請注意異常趨勢`)

    if (alerts.length > 0) {
      db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
        .run(0, 'alert', '系統預警', 'system_alert', JSON.stringify({ alerts, checked_at: today }))
    }
  } catch (e) {
    console.error('[DailyAlerts] Error:', e)
  }
}

// Security M-1: 每小時清除已過期的撤銷 token，避免 revoked_tokens 表無限增長
function scheduleRevokedTokenCleanup() {
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // hourly
  const doCleanup = () => {
    try {
      db.prepare("DELETE FROM revoked_tokens WHERE expires_at < datetime('now','localtime')").run()
    } catch (e) {
      console.error('[RevokedTokenCleanup] Error:', e)
    }
  }
  doCleanup()
  setInterval(doCleanup, CLEANUP_INTERVAL_MS)
}

// F-2: Audit log archiving
function archiveOldAuditLogs() {
  try {
    const policy = getDataRetentionPolicy(db)
    if (!policy.enabled) return
    const result = applyDataRetention(db, policy)
    console.log(`[DataRetention] Archived ${result.audit_logs_archived} audit logs, deleted ${result.client_errors_deleted} client errors, anonymized ${result.inactive_voters_anonymized} inactive voters`)
  } catch (e) {
    console.error('[DataRetention] Failed:', e)
  }
}

function scheduleAuditArchive() {
  const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // check daily

  const doCheck = () => {
    try {
      const lastArchiveRow = db.prepare("SELECT value FROM settings WHERE key='last_audit_archive'").get() as any
      const lastRetentionRow = db.prepare("SELECT value FROM settings WHERE key='last_data_retention_run'").get() as any
      const lastValue = lastRetentionRow?.value || lastArchiveRow?.value
      const lastArchive = lastValue ? new Date(lastValue) : null
      const daysSince = lastArchive ? (Date.now() - lastArchive.getTime()) / (1000 * 60 * 60 * 24) : Infinity
      // Run if > 25 days since last archive
      if (daysSince > 25) {
        archiveOldAuditLogs()
      }
    } catch (e) {
      console.error('[ArchiveScheduler] Error:', e)
    }
  }

  // Catch-up on startup (after 5s delay to let DB stabilize)
  setTimeout(doCheck, 5000)

  // Check daily
  setInterval(doCheck, CHECK_INTERVAL_MS)
}


async function start() {
  const fastify = await buildServer()
  try {
    await fastify.listen({ port: PORT, host: HOST })
    console.log(`✅ 選民服務系統伺服器啟動於 http://localhost:${PORT}`)
    scheduleAutoBackup()
    scheduleConsistencyCheck()
    scheduleWeeklyBackupVerify()
    scheduleDailyAlerts()
    scheduleAuditArchive()
    scheduleRevokedTokenCleanup()

    // Catch-up: run missed scheduled tasks on startup
    async function runMissedTasks() {
      console.log('[Scheduler] Checking for missed tasks on startup...')
      if (shouldRunCatchUp('consistency_check', 20)) {
        console.log('[Scheduler] Running missed consistency check')
        runConsistencyCheck()
        setLastRun('consistency_check')
      }
      if (shouldRunCatchUp('daily_alerts', 20)) {
        console.log('[Scheduler] Running missed daily alerts')
        checkAndCreateAlerts()
        setLastRun('daily_alerts')
      }
      if (shouldRunCatchUp('backup_verify', 160)) { // ~7 days
        console.log('[Scheduler] Running missed backup verify')
        // Inline backup verify logic for catch-up
        try {
          const backupDir = process.env.BACKUPS_PATH || path.join(process.cwd(), 'backups')
          if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir)
              .filter((f: string) => f.endsWith('.db'))
              .map((f: string) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
              .sort((a: any, b: any) => b.mtime - a.mtime)
            if (files.length > 0) {
              const BetterSqlite3 = require('better-sqlite3')
              const latestFile = (files[0] as any).name
              const filePath = path.join(backupDir, latestFile)
              let result: any = 'unknown'
              let backupDb: any = null
              try {
                backupDb = new BetterSqlite3(filePath, { readonly: true })
                result = (backupDb.prepare('PRAGMA integrity_check').get() as any)?.integrity_check ?? 'unknown'
              } catch (dbErr) {
                result = String(dbErr)
              } finally {
                try { backupDb?.close() } catch {}
              }
              const detail = JSON.stringify({ file: latestFile, result, checked_at: new Date().toISOString() })
              console.log(`[BackupVerify] ${latestFile}: ${result}`)
              db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,target_name,detail,created_at) VALUES(1,'check','系統備份','backup_verify',?,?,datetime('now','localtime'))`).run(latestFile, detail)
              setLastRun('backup_verify')
            }
          }
        } catch (e) {
          console.error('[BackupVerify] Catch-up error:', e)
        }
      }
    }
    setTimeout(runMissedTasks, 3000) // run 3 seconds after startup

    // 顯示區網 IP
    const interfaces = os.networkInterfaces()
    for (const [name, iface] of Object.entries(interfaces)) {
      if (!iface) continue
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          console.log(`📡 區網連線：http://${alias.address}:${PORT}`)
        }
      }
    }
  } catch (err) {
    console.error('伺服器啟動失敗：', err)
    process.exit(1)
  }
}

export function startSchedules() {
  if (schedulesStarted) return false
  schedulesStarted = true
  scheduleAutoBackup()
  scheduleConsistencyCheck()
  scheduleWeeklyBackupVerify()
  scheduleDailyAlerts()
  scheduleAuditArchive()
  scheduleRevokedTokenCleanup()
  return true
}

if (require.main === module && !process.versions.electron) {
  start()
}
