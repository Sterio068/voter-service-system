import type { Database } from 'better-sqlite3'
import {
  anonymizeVoter,
  buildInactiveVoterAnonymizePreviewWhereClause,
} from './voterAnonymization'

export type DataRetentionPolicy = {
  enabled: boolean
  auditLogArchiveDays: number
  clientErrorRetentionDays: number
  softDeletedVoterAnonymizeDays: number
}

export type DataRetentionCounts = {
  audit_logs_to_archive: number
  client_errors_to_delete: number
  inactive_voters_to_anonymize: number
}

export type DataRetentionResult = {
  audit_logs_archived: number
  client_errors_deleted: number
  inactive_voters_anonymized: number
}

const DEFAULT_POLICY: DataRetentionPolicy = {
  enabled: false,
  auditLogArchiveDays: 90,
  clientErrorRetentionDays: 90,
  softDeletedVoterAnonymizeDays: 365,
}

function clampDays(value: unknown, fallback: number, min: number, max = 3650): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function readSetting(database: Database, key: string): string | null {
  const row = database.prepare('SELECT value FROM settings WHERE key=?').get(key) as any
  return row?.value ?? null
}

function olderThanModifier(days: number): string {
  return `-${days} days`
}

export function getDataRetentionPolicy(database: Database): DataRetentionPolicy {
  return {
    enabled: readSetting(database, 'data_retention_enabled') === '1',
    auditLogArchiveDays: clampDays(readSetting(database, 'retention_audit_archive_days'), DEFAULT_POLICY.auditLogArchiveDays, 30),
    clientErrorRetentionDays: clampDays(readSetting(database, 'retention_client_error_days'), DEFAULT_POLICY.clientErrorRetentionDays, 7),
    softDeletedVoterAnonymizeDays: clampDays(readSetting(database, 'retention_soft_deleted_voter_days'), DEFAULT_POLICY.softDeletedVoterAnonymizeDays, 30),
  }
}

export function previewDataRetention(database: Database, policy = getDataRetentionPolicy(database)): DataRetentionCounts {
  const auditLogs = database.prepare(`
    SELECT COUNT(*) AS count
    FROM audit_logs
    WHERE created_at < datetime('now','localtime', ?)
  `).get(olderThanModifier(policy.auditLogArchiveDays)) as any

  const clientErrors = database.prepare(`
    SELECT COUNT(*) AS count
    FROM client_errors
    WHERE created_at < datetime('now','localtime', ?)
  `).get(olderThanModifier(policy.clientErrorRetentionDays)) as any

  const inactiveVoters = database.prepare(`
    SELECT COUNT(*) AS count
    FROM voters
    WHERE ${buildInactiveVoterAnonymizePreviewWhereClause()}
  `).get(olderThanModifier(policy.softDeletedVoterAnonymizeDays)) as any

  return {
    audit_logs_to_archive: Number(auditLogs?.count || 0),
    client_errors_to_delete: Number(clientErrors?.count || 0),
    inactive_voters_to_anonymize: Number(inactiveVoters?.count || 0),
  }
}

export function applyDataRetention(database: Database, policy = getDataRetentionPolicy(database)): DataRetentionResult {
  let auditLogsArchived = 0
  let clientErrorsDeleted = 0
  let inactiveVotersAnonymized = 0

  database.exec('BEGIN')
  try {
    const auditResult = database.prepare(`
      INSERT OR IGNORE INTO archive_audit_logs
        (id, user_id, action, module, target_type, target_id, target_name, detail, ip, created_at)
      SELECT id, user_id, action, module, target_type, target_id, target_name, detail, ip_address, created_at
      FROM audit_logs
      WHERE created_at < datetime('now','localtime', ?)
    `).run(olderThanModifier(policy.auditLogArchiveDays))
    auditLogsArchived = Number(auditResult.changes || 0)

    database.prepare(`
      DELETE FROM audit_logs
      WHERE created_at < datetime('now','localtime', ?)
    `).run(olderThanModifier(policy.auditLogArchiveDays))

    const clientErrorsResult = database.prepare(`
      DELETE FROM client_errors
      WHERE created_at < datetime('now','localtime', ?)
    `).run(olderThanModifier(policy.clientErrorRetentionDays))
    clientErrorsDeleted = Number(clientErrorsResult.changes || 0)

    const inactiveVoterIds = (
      database.prepare(`
        SELECT id
        FROM voters
        WHERE ${buildInactiveVoterAnonymizePreviewWhereClause()}
      `).all(olderThanModifier(policy.softDeletedVoterAnonymizeDays)) as Array<{ id: number }>
    ).map((row) => Number(row.id))

    for (const voterId of inactiveVoterIds) {
      anonymizeVoter(database, voterId, 'anonymize')
    }
    inactiveVotersAnonymized = inactiveVoterIds.length

    database.prepare(`
      INSERT INTO settings(key,value,updated_at)
      VALUES('last_data_retention_run', ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(new Date().toISOString())

    database.exec('COMMIT')
  } catch (error) {
    try { database.exec('ROLLBACK') } catch {}
    throw error
  }

  return {
    audit_logs_archived: auditLogsArchived,
    client_errors_deleted: clientErrorsDeleted,
    inactive_voters_anonymized: inactiveVotersAnonymized,
  }
}
