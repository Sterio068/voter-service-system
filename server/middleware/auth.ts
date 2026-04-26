import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index'
import type { User } from '../../shared/types'
import {
  hasPermission,
  type PermissionAction,
  type PermissionModule,
} from '../../shared/permissions'

export { hasPermission }

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as { id: number; username: string; role: string; jti?: string }

    // Security M-1: 檢查 token 是否已被登出/撤銷
    if (payload.jti) {
      const revoked = db.prepare(
        "SELECT 1 FROM revoked_tokens WHERE jti = ? AND expires_at > datetime('now','localtime')"
      ).get(payload.jti)
      if (revoked) {
        return reply.code(401).send({ success: false, error: 'Token 已失效，請重新登入' })
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as User | undefined
    if (!user || !user.is_active) {
      return reply.code(401).send({ success: false, error: '帳號已停用或不存在' })
    }
    request.currentUser = user
  } catch {
    reply.code(401).send({ success: false, error: '未授權，請重新登入' })
  }
}

export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return
    const user = request.currentUser!
    if (!hasPermission(user.role, module, action)) {
      return reply.code(403).send({ success: false, error: '權限不足' })
    }
  }
}
