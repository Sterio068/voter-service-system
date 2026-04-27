import { FastifyRequest } from 'fastify'
import { db } from '../db/index'
import { publish as publishRealtime } from '../utils/realtimeBus'

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

const REALTIME_ACTIONS = new Set(['create', 'update', 'delete', 'merge'])

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

  // Realtime fan-out — must never throw past the audit insert. We only push
  // mutating actions; logins/exports/etc. don't need to invalidate caches.
  if (opts.target_type && REALTIME_ACTIONS.has(opts.action)) {
    try {
      publishRealtime({
        target_type: opts.target_type,
        target_id: opts.target_id ?? null,
        action: opts.action,
        user_id: userId,
      })
    } catch {
      // Silently swallow — audit log already persisted.
    }
  }
}
