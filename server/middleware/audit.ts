import { FastifyRequest } from 'fastify'
import { db } from '../db/index'

export interface AuditOptions {
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'export' | 'import' | 'print' | 'query' | 'merge' | 'check'
  module: string
  target_type?: string
  target_id?: number
  target_name?: string
  detail?: string | Record<string, any>
  before?: Record<string, any>
  after?: Record<string, any>
}

// Keep backward-compat alias
export type AuditParams = AuditOptions

export function createAuditLog(request: FastifyRequest, userId: number, opts: AuditOptions) {
  const ip = request.ip || (request.headers['x-forwarded-for'] as string) || 'unknown'
  const detail = (opts.before || opts.after)
    ? JSON.stringify({ before: opts.before, after: opts.after })
    : typeof opts.detail === 'string'
      ? opts.detail
      : opts.detail
        ? JSON.stringify(opts.detail)
        : null
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, module, target_type, target_id, target_name, detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, opts.action, opts.module,
    opts.target_type ?? null, opts.target_id ?? null,
    opts.target_name ?? null,
    detail,
    ip
  )
}
