import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/index'

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'print' | 'use'

const rolePermissions: Record<string, Record<string, PermissionAction[]>> = {
  admin: {
    system: ['view', 'create', 'edit', 'delete', 'export'],
    admin: ['view', 'create', 'edit', 'delete', 'export'],
    users: ['view', 'create', 'edit', 'delete'],
    audit_logs: ['view', 'export'],
    petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    documents: ['view', 'create', 'edit', 'delete', 'export'],
    schedules: ['view', 'create', 'edit', 'delete', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'export'],
    categories: ['view', 'create', 'edit', 'delete'],
    settings: ['view', 'edit'],
    notifications: ['view', 'create', 'edit', 'delete', 'export'],
    reports: ['view', 'export'],
    events: ['view', 'create', 'edit', 'delete'],
    surveys: ['view', 'create', 'edit', 'delete'],
    contact_records: ['view', 'create', 'edit', 'delete'],
    proposals: ['view', 'create', 'edit', 'delete', 'export'],
    ai: ['use', 'view'],
  },
  supervisor: {
    system: ['view'], admin: [], users: [], audit_logs: ['view'],
    petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    documents: ['view', 'create', 'edit', 'delete', 'export'],
    schedules: ['view', 'create', 'edit', 'delete', 'export'],
    tasks: ['view', 'create', 'edit', 'delete'],
    categories: ['view'], settings: ['view'],
    notifications: ['view', 'create', 'edit'],
    reports: ['view', 'export'],
    events: ['view', 'create', 'edit', 'delete'],
    surveys: ['view', 'create', 'edit'],
    contact_records: ['view', 'create', 'edit'],
    proposals: ['view', 'create', 'edit', 'delete', 'export'],
    ai: ['use', 'view'],
  },
  assistant: {
    system: [], admin: [], users: [], audit_logs: [],
    petitions: ['view', 'create', 'edit'],
    voters: ['view', 'create', 'edit'],
    groups: ['view', 'create', 'edit'],
    documents: ['view', 'create', 'edit'],
    schedules: ['view', 'create', 'edit'],
    tasks: ['view', 'create', 'edit'],
    categories: ['view'], settings: ['view'],
    notifications: ['view'],
    reports: ['view'],
    events: ['view', 'create', 'edit'],
    surveys: ['view'],
    contact_records: ['view', 'create', 'edit'],
    proposals: ['view', 'create', 'edit'],
    ai: ['use'],
  },
  volunteer: {
    system: [], admin: [], users: [], audit_logs: [],
    petitions: ['view'], voters: ['view'], groups: ['view'],
    documents: ['view'], schedules: ['view'], tasks: ['view'],
    categories: ['view'], settings: [],
    notifications: [], reports: [], events: ['view'], surveys: [],
    contact_records: ['view'],
    proposals: ['view'],
    ai: [],
  },
}

export function hasPermission(role: string, module: string, action: PermissionAction): boolean {
  return (rolePermissions[role]?.[module] || []).includes(action)
}

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

export function requirePermission(module: string, action: PermissionAction) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply)
    if (reply.sent) return
    const user = (request as any).currentUser
    if (!hasPermission(user.role, module, action)) {
      return reply.code(403).send({ success: false, error: '權限不足' })
    }
  }
}
