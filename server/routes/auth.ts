import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { db } from '../db/index'
import { authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

const LoginSchema = z.object({
  username: z.string().min(1, '帳號為必填'),
  password: z.string().min(1, '密碼為必填'),
})

interface ChangePasswordBody { old_password: string; new_password: string }

const loginAttempts = new Map<string, { count: number; lockUntil?: number }>()

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

    const attempts = loginAttempts.get(username)
    if (attempts?.lockUntil && Date.now() < attempts.lockUntil) {
      const remaining = Math.ceil((attempts.lockUntil - Date.now()) / 60000)
      return reply.code(429).send({ success: false, error: `帳號已鎖定，請於 ${remaining} 分鐘後再試` })
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any

    // Validate credentials — keep error message generic regardless of failure reason
    const validUser = user && user.is_active
    const match = validUser ? await bcrypt.compare(password, user.password) : false

    if (!validUser || !match) {
      // Always increment attempt counter (prevents username enumeration via lockout bypass)
      const cur = loginAttempts.get(username) || { count: 0 }
      cur.count += 1
      if (cur.count >= maxAttempts) {
        cur.lockUntil = Date.now() + lockMinutes * 60000
        loginAttempts.set(username, cur)
        return reply.code(429).send({ success: false, error: `登入失敗次數過多，已鎖定 ${lockMinutes} 分鐘` })
      }
      loginAttempts.set(username, cur)
      return reply.code(401).send({ success: false, error: '帳號或密碼錯誤' })
    }

    loginAttempts.delete(username)
    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role }, { expiresIn: '8h' })
    createAuditLog(request, user.id, { action: 'login', module: '認證', target_name: user.username })

    const { password: _, ...userOut } = user
    return reply.send({ success: true, data: { token, user: userOut } })
  })

  fastify.post('/api/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.currentUser!
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
