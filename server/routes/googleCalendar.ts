import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { db } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

// ── 取得 OAuth2 client ──────────────────────────────────────
export function getOAuth2Client() {
  const clientId     = (db.prepare("SELECT value FROM settings WHERE key='gcal_client_id'").get() as any)?.value
  const clientSecret = (db.prepare("SELECT value FROM settings WHERE key='gcal_client_secret'").get() as any)?.value
  if (!clientId || !clientSecret) return null
  const port = (db.prepare("SELECT value FROM settings WHERE key='port'").get() as any)?.value || '3000'
  const redirectUri = `http://localhost:${port}/api/integrations/gcal/callback`
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

// ── 幫一個已授權帳號建立可用的 auth client ──────────────────
export async function getAuthedClient(accountId: number) {
  const account = db.prepare('SELECT * FROM google_calendar_accounts WHERE id=? AND is_active=1').get(accountId) as any
  if (!account) return null
  const oauth2 = getOAuth2Client()
  if (!oauth2) return null
  oauth2.setCredentials({
    access_token:  account.access_token,
    refresh_token: account.refresh_token,
    expiry_date:   account.expiry_date,
  })
  // 自動刷新 token
  oauth2.on('tokens', (tokens) => {
    if (tokens.access_token) {
      db.prepare("UPDATE google_calendar_accounts SET access_token=?, expiry_date=? WHERE id=?")
        .run(tokens.access_token, tokens.expiry_date ?? null, accountId)
    }
  })
  return oauth2
}

// ── 同步單一行程到所有已啟用帳號 ───────────────────────────
export async function syncScheduleToGCal(scheduleId: number, action: 'create' | 'update' | 'delete') {
  try {
    const schedule = db.prepare('SELECT * FROM schedules WHERE id=?').get(scheduleId) as any
    if (!schedule) return
    const accounts = db.prepare('SELECT * FROM google_calendar_accounts WHERE is_active=1').all() as any[]
    if (!accounts.length) return

    let syncData: Record<string, string> = {}
    try { syncData = JSON.parse(schedule.gcal_sync_data || '{}') } catch {}

    for (const account of accounts) {
      try {
        const auth = await getAuthedClient(account.id)
        if (!auth) continue
        const cal = google.calendar({ version: 'v3', auth })
        const calId = account.calendar_id || 'primary'
        const existingEventId = syncData[String(account.id)]

        if (action === 'delete') {
          if (existingEventId) {
            await cal.events.delete({ calendarId: calId, eventId: existingEventId }).catch(() => {})
            delete syncData[String(account.id)]
          }
          continue
        }

        const event = {
          summary:     schedule.title,
          location:    schedule.location || undefined,
          description: schedule.note || undefined,
          start: schedule.end_time
            ? { dateTime: new Date(schedule.start_time).toISOString(), timeZone: 'Asia/Taipei' }
            : { date: schedule.start_time.slice(0, 10) },
          end: schedule.end_time
            ? { dateTime: new Date(schedule.end_time).toISOString(), timeZone: 'Asia/Taipei' }
            : { date: schedule.start_time.slice(0, 10) },
        }

        if (action === 'update' && existingEventId) {
          const res = await cal.events.update({ calendarId: calId, eventId: existingEventId, requestBody: event })
          syncData[String(account.id)] = res.data.id!
        } else {
          const res = await cal.events.insert({ calendarId: calId, requestBody: event })
          syncData[String(account.id)] = res.data.id!
        }
      } catch (e) {
        console.warn(`[GCal] sync account ${account.id} failed:`, e)
      }
    }

    db.prepare("UPDATE schedules SET gcal_sync_data=? WHERE id=?")
      .run(JSON.stringify(syncData), scheduleId)
  } catch (e) {
    console.warn('[GCal] syncScheduleToGCal error:', e)
  }
}

// ── Routes ─────────────────────────────────────────────────
export default async function googleCalendarRoutes(fastify: FastifyInstance) {
  // 取得 OAuth 設定狀態與已連結帳號
  fastify.get('/api/integrations/gcal/status', { preHandler: [requirePermission('settings', 'edit')] }, async (_, reply) => {
    const clientId     = (db.prepare("SELECT value FROM settings WHERE key='gcal_client_id'").get() as any)?.value || ''
    const clientSecret = (db.prepare("SELECT value FROM settings WHERE key='gcal_client_secret'").get() as any)?.value || ''
    const accounts = db.prepare('SELECT id,label,email,calendar_id,is_active,created_at FROM google_calendar_accounts ORDER BY id').all()
    return reply.send({ success: true, data: { configured: !!(clientId && clientSecret), clientId, accounts } })
  })

  // 儲存 OAuth 用戶端憑證
  fastify.post('/api/integrations/gcal/credentials', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const { client_id, client_secret } = request.body as any
    if (!client_id || !client_secret) return reply.code(400).send({ success: false, error: '請填寫用戶端 ID 和密鑰' })
    db.prepare("INSERT INTO settings(key,value) VALUES('gcal_client_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(client_id)
    db.prepare("INSERT INTO settings(key,value) VALUES('gcal_client_secret',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(client_secret)
    return reply.send({ success: true })
  })

  // 產生 OAuth 授權 URL
  fastify.get('/api/integrations/gcal/auth-url', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const { label } = request.query as any
    const oauth2 = getOAuth2Client()
    if (!oauth2) return reply.code(400).send({ success: false, error: '請先設定 Google OAuth 用戶端 ID 與密鑰' })
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: encodeURIComponent(label || '我的日曆'),
    })
    return reply.send({ success: true, data: { url } })
  })

  // OAuth 回呼（Google 導向到這裡）
  fastify.get('/api/integrations/gcal/callback', async (request, reply) => {
    const { code, state, error } = request.query as any
    if (error) {
      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ 授權失敗</h2><p>${error}</p><p>可以關閉此視窗。</p></body></html>`)
    }
    const oauth2 = getOAuth2Client()
    if (!oauth2 || !code) {
      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ 設定錯誤</h2><p>找不到 OAuth 設定，請重新設定。</p></body></html>`)
    }
    try {
      const { tokens } = await oauth2.getToken(code)
      oauth2.setCredentials(tokens)
      // 取得使用者 email
      let email = ''
      try {
        const oauth2Info = google.oauth2({ version: 'v2', auth: oauth2 })
        const info = await oauth2Info.userinfo.get()
        email = info.data.email || ''
      } catch {}

      const label = decodeURIComponent(state || '我的日曆')
      db.prepare(`INSERT INTO google_calendar_accounts (label,email,access_token,refresh_token,expiry_date)
        VALUES (?,?,?,?,?)`)
        .run(label, email, tokens.access_token ?? null, tokens.refresh_token!, tokens.expiry_date ?? null)

      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px;color:#1a1a1a">
        <h2 style="color:#28a745">✅ Google 日曆已連結成功</h2>
        <p>帳號：<strong>${email || label}</strong></p>
        <p>已連結到「<strong>${label}</strong>」</p>
        <p style="color:#666">可以關閉此視窗，回到系統繼續操作。</p>
        <script>setTimeout(()=>window.close(),3000)</script>
      </body></html>`)
    } catch (e: any) {
      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>❌ 授權失敗</h2><p>${e.message}</p><p>可以關閉此視窗。</p></body></html>`)
    }
  })

  // 更新帳號設定（名稱、calendar_id、啟用/停用）
  fastify.put('/api/integrations/gcal/accounts/:id', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const { label, calendar_id, is_active } = request.body as any
    db.prepare('UPDATE google_calendar_accounts SET label=COALESCE(?,label), calendar_id=COALESCE(?,calendar_id), is_active=COALESCE(?,is_active) WHERE id=?')
      .run(label ?? null, calendar_id ?? null, is_active ?? null, Number(id))
    return reply.send({ success: true })
  })

  // 刪除帳號
  fastify.delete('/api/integrations/gcal/accounts/:id', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    db.prepare('DELETE FROM google_calendar_accounts WHERE id=?').run(Number(id))
    return reply.send({ success: true })
  })

  // 手動同步指定行程（測試用）
  fastify.post('/api/integrations/gcal/sync/:scheduleId', { preHandler: [requirePermission('schedules', 'edit')] }, async (request, reply) => {
    const { scheduleId } = request.params as any
    await syncScheduleToGCal(Number(scheduleId), 'update')
    return reply.send({ success: true, message: '同步完成' })
  })
}
