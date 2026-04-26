import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '../db/index'
import { authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const LoginSchema = z.object({
  username: z.string().min(1, '帳號為必填'),
  password: z.string().min(1, '密碼為必填'),
})

interface ChangePasswordBody { old_password: string; new_password: string }

// JWT 預設有效期，必須與 jwt.sign 的 expiresIn 一致；用於計算 revoked_tokens.expires_at。
const TOKEN_TTL_SECONDS = 8 * 60 * 60

// Security M-2: 登入失敗鎖定狀態（持久化於 login_attempts 表）。
// 將原本的 in-process Map 替換為 SQLite，避免重啟即重置計數器導致無限次撞密碼。
interface LoginAttemptRow { username: string; count: number; locked_until: string | null }

function getLoginAttempt(username: string): LoginAttemptRow | undefined {
  return db.prepare('SELECT username, count, locked_until FROM login_attempts WHERE username = ?').get(username) as LoginAttemptRow | undefined
}

function clearLoginAttempt(username: string): void {
  db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username)
}

function recordFailedAttempt(username: string, lockMinutes: number, maxAttempts: number): { count: number; lockedUntilMs: number | null } {
  const existing = getLoginAttempt(username)
  const nextCount = (existing?.count ?? 0) + 1
  const shouldLock = nextCount >= maxAttempts
  const lockedUntilDate = shouldLock ? new Date(Date.now() + lockMinutes * 60_000) : null
  const lockedUntilStr = lockedUntilDate ? lockedUntilDate.toISOString() : null

  db.prepare(`
    INSERT INTO login_attempts (username, count, locked_until)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until
  `).run(username, nextCount, lockedUntilStr)

  return {
    count: nextCount,
    lockedUntilMs: lockedUntilDate ? lockedUntilDate.getTime() : null,
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const { username, password } = parsed.data

    const lockAttemptsSetting = db.prepare("SELECT value FROM settings WHERE key = 'login_lock_attempts'").get() as any
    const lockMinutesSetting = db.prepare("SELECT value FROM settings WHERE key = 'login_lock_minutes'").get() as any
    const maxAttempts = parseInt(lockAttemptsSetting?.value || '5')
    const lockMinutes = parseInt(lockMinutesSetting?.value || '15')

    // 檢查鎖定狀態（持久化於 DB）
    const attempts = getLoginAttempt(username)
    if (attempts?.locked_until) {
      const lockedUntilMs = Date.parse(attempts.locked_until)
      if (!Number.isNaN(lockedUntilMs) && Date.now() < lockedUntilMs) {
        const remaining = Math.ceil((lockedUntilMs - Date.now()) / 60000)
        return reply.code(429).send({ success: false, error: `帳號已鎖定，請於 ${remaining} 分鐘後再試` })
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any

    // Validate credentials — keep error message generic regardless of failure reason
    const validUser = user && user.is_active
    const match = validUser ? await bcrypt.compare(password, user.password) : false

    if (!validUser || !match) {
      // Always increment attempt counter (prevents username enumeration via lockout bypass)
      const result = recordFailedAttempt(username, lockMinutes, maxAttempts)
      if (result.lockedUntilMs !== null) {
        return reply.code(429).send({ success: false, error: `登入失敗次數過多，已鎖定 ${lockMinutes} 分鐘` })
      }
      return reply.code(401).send({ success: false, error: '帳號或密碼錯誤' })
    }

    clearLoginAttempt(username)
    const jti = randomUUID()
    const token = fastify.jwt.sign(
      { id: user.id, username: user.username, role: user.role, jti },
      { expiresIn: `${TOKEN_TTL_SECONDS}s` }
    )
    createAuditLog(request, user.id, { action: 'login', module: '認證', target_name: user.username })

    const { password: _, ...userOut } = user
    return reply.send({ success: true, data: { token, user: userOut } })
  })

  fastify.post('/api/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    // Security M-1: 將目前 token 加入撤銷清單，使其立即失效
    const payload = request.user as { jti?: string; exp?: number }
    if (payload?.jti) {
      const expiresAt = payload.exp
        ? new Date(payload.exp * 1000).toISOString()
        : new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString()
      db.prepare(`
        INSERT OR IGNORE INTO revoked_tokens (jti, user_id, expires_at)
        VALUES (?, ?, ?)
      `).run(payload.jti, user.id, expiresAt)
    }
    createAuditLog(request, user.id, { action: 'logout', module: '認證', target_name: user.username })
    return reply.send({ success: true, message: '已成功登出' })
  })

  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    // 中介軟體查 SELECT * 會帶到 password 欄位，回傳前剝除
    const { password: _, ...out } = user as typeof user & { password?: string }
    return reply.send({ success: true, data: out })
  })

  fastify.put('/api/auth/password', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
    const { old_password, new_password } = request.body as ChangePasswordBody
    if (!old_password || !new_password) return reply.code(400).send({ success: false, error: '請填寫完整資料' })
    if (new_password.length < 8) return reply.code(400).send({ success: false, error: '新密碼至少需要 8 個字元' })

    const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
    if (!await bcrypt.compare(old_password, dbUser.password))
      return reply.code(400).send({ success: false, error: '原密碼錯誤' })

    const hashed = await bcrypt.hash(new_password, 12)
    db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hashed, user.id)
    createAuditLog(request, user.id, { action: 'update', module: '認證', target_name: '密碼修改' })
    return reply.send({ success: true, message: '密碼已更新' })
  })
}
