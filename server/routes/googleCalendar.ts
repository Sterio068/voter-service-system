import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { db } from '../db/index'
import { getSetting, setSetting } from '../utils/settings'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { decryptSecretValue, encryptSecretValue } from '../utils/secrets'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── 取得 OAuth2 client（經由 getSetting 快取，避免每次直接讀 DB）──
export function getOAuth2Client() {
  const clientId     = getSetting('gcal_client_id')
  const clientSecret = getSetting('gcal_client_secret')
  if (!clientId || !clientSecret) return null
  const port = getSetting('port') || '3000'
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
    access_token:  decryptSecretValue(account.access_token),
    refresh_token: decryptSecretValue(account.refresh_token),
    expiry_date:   account.expiry_date,
  })
  // 自動刷新 token
  oauth2.on('tokens', (tokens) => {
    if (tokens.access_token) {
      db.prepare("UPDATE google_calendar_accounts SET access_token=?, expiry_date=? WHERE id=?")
        .run(encryptSecretValue(tokens.access_token), tokens.expiry_date ?? null, accountId)
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
    try {
      syncData = JSON.parse(schedule.gcal_sync_data || '{}')
    } catch (parseErr) {
      const rawSnippet = String(schedule.gcal_sync_data ?? '').slice(0, 200)
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
      console.error(`[GCal] gcal_sync_data parse failed for schedule ${scheduleId}: ${msg}; payload[:200]=${rawSnippet}`)
      try {
        db.prepare(
          `INSERT INTO audit_logs(user_id,action,module,target_type,target_id,target_name,detail,ip_address,created_at)
           VALUES(0,'gcal_sync_data_parse_failed','Google日曆同步','schedule',?,?,?,?,datetime('now','localtime'))`
        ).run(scheduleId, schedule.title ?? null, `${msg} | payload[:200]=${rawSnippet}`, '')
      } catch {}
    }

    for (const account of accounts) {
      try {
        const auth = await getAuthedClient(account.id)
        if (!auth) continue
        const cal = google.calendar({ version: 'v3', auth })
        const calId = account.calendar_id || 'primary'
        const existingEventId = syncData[String(account.id)]

        if (action === 'delete') {
          if (existingEventId) {
            await cal.events.delete({ calendarId: calId, eventId: existingEventId }).catch((delErr: unknown) => { console.warn(`[GCal] delete event ${existingEventId} on account ${account.id} failed:`, delErr instanceof Error ? delErr.message : delErr) })
            delete syncData[String(account.id)]
          }
          continue
        }

        // 將 SQLite 本地時間字串（無時區）加上台灣 +08:00，
        // 避免 toISOString() 轉成 UTC Z 後被 Google API 誤解析
        const toTaipeiDT = (s: string) => s.replace(' ', 'T') + '+08:00'
        const event = {
          summary:     schedule.title,
          location:    schedule.location || undefined,
          description: schedule.note || undefined,
          start: schedule.end_time
            ? { dateTime: toTaipeiDT(schedule.start_time), timeZone: 'Asia/Taipei' }
            : { date: schedule.start_time.slice(0, 10) },
          end: schedule.end_time
            ? { dateTime: toTaipeiDT(schedule.end_time), timeZone: 'Asia/Taipei' }
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
    const clientId     = getSetting('gcal_client_id') || ''
    const clientSecret = getSetting('gcal_client_secret') || ''
    const accounts = db.prepare('SELECT id,label,email,calendar_id,is_active,created_at FROM google_calendar_accounts ORDER BY id').all()
    return reply.send({ success: true, data: { configured: !!(clientId && clientSecret), clientId, accounts } })
  })

  // 儲存 OAuth 用戶端憑證
  fastify.post('/api/integrations/gcal/credentials', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { client_id, client_secret } = request.body as any
    const trimmedClientId = String(client_id || '').trim()
    const trimmedClientSecret = String(client_secret || '').trim()
    const existingSecret = getSetting('gcal_client_secret') || ''
    if (!trimmedClientId || (!trimmedClientSecret && !existingSecret)) {
      return reply.code(400).send({ success: false, error: '請填寫用戶端 ID 和密鑰' })
    }
    if (trimmedClientId.length > 256 || trimmedClientSecret.length > 256) {
      return reply.code(400).send({ success: false, error: 'OAuth 憑證長度過長' })
    }
    setSetting('gcal_client_id', trimmedClientId)
    if (trimmedClientSecret) setSetting('gcal_client_secret', trimmedClientSecret)
    createAuditLog(request, cu.id, { action: 'update', module: '系統設定', target_type: 'gcal_credentials', target_id: 0, target_name: '更新 Google Calendar OAuth 憑證' })
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
        <h2>授權失敗</h2><p>${escapeHtml(error)}</p><p>可以關閉此視窗。</p></body></html>`)
    }
    const oauth2 = getOAuth2Client()
    if (!oauth2 || !code) {
      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>設定錯誤</h2><p>找不到 OAuth 設定，請重新設定。</p></body></html>`)
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
      } catch (userinfoErr) {
        const raw = userinfoErr instanceof Error ? userinfoErr.message : String(userinfoErr)
        const snippet = raw.slice(0, 200)
        console.error(`[GCal] userinfo fetch/parse failed: ${snippet}`)
        try {
          db.prepare(
            `INSERT INTO audit_logs(user_id,action,module,target_type,target_id,target_name,detail,ip_address,created_at)
             VALUES(0,'gcal_sync_data_parse_failed','Google日曆同步','gcal_userinfo',?,?,?,?,datetime('now','localtime'))`
          ).run(0, 'oauth_callback', snippet, request.ip || '')
        } catch {}
      }

      const label = decodeURIComponent(state || '我的日曆')
      const safeLabel = escapeHtml(label)
      const safeEmail = escapeHtml(email)
      db.prepare(`INSERT INTO google_calendar_accounts (label,email,access_token,refresh_token,expiry_date)
        VALUES (?,?,?,?,?)`)
        .run(
          label,
          email,
          tokens.access_token ? encryptSecretValue(tokens.access_token) : null,
          encryptSecretValue(tokens.refresh_token || ''),
          tokens.expiry_date ?? null,
        )

      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px;color:#1a1a1a">
        <h2 style="color:#28a745">Google 日曆已連結成功</h2>
        <p>帳號：<strong>${safeEmail || safeLabel}</strong></p>
        <p>已連結到「<strong>${safeLabel}</strong>」</p>
        <p style="color:#666">可以關閉此視窗，回到系統繼續操作。</p>
      </body></html>`)
    } catch (e: any) {
      return reply.type('text/html').send(`<html><body style="font-family:sans-serif;padding:40px">
        <h2>授權失敗</h2><p>無法完成授權，請回到系統重新操作。</p><p>可以關閉此視窗。</p></body></html>`)
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
    const cu = request.currentUser!
    const { id } = request.params as any
    const acc = db.prepare('SELECT email, label FROM google_calendar_accounts WHERE id=?').get(Number(id)) as any
    db.prepare('DELETE FROM google_calendar_accounts WHERE id=?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '系統設定', target_type: 'gcal_account', target_id: Number(id), target_name: acc?.label || acc?.email || `帳號 ${id}` })
    return reply.send({ success: true })
  })

  // 手動同步指定行程（測試用）
  fastify.post('/api/integrations/gcal/sync/:scheduleId', { preHandler: [requirePermission('schedules', 'edit')] }, async (request, reply) => {
    const { scheduleId } = request.params as any
    await syncScheduleToGCal(Number(scheduleId), 'update')
    return reply.send({ success: true, message: '同步完成' })
  })
}
