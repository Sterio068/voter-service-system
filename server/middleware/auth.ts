import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index'
import {
  hasPermission,
  type PermissionAction,
  type PermissionModule,
} from '../../shared/permissions'

export { hasPermission }

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as { id: number; username: string; role: string }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as any
    if (!user || !user.is_active) {
      return reply.code(401).send({ success: false, error: '帳號已停用或不存在' })
    }
    ;(request as any).currentUser = user
  } catch {
    reply.code(401).send({ success: false, error: '未授權，請重新登入' })
  }
}

export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return
    const user = (request as any).currentUser
    if (!hasPermission(user.role, module, action)) {
      return reply.code(403).send({ success: false, error: '權限不足' })
    }
  }
}
