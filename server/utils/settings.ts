import { db } from '../db/index'
import { decryptSecretValue, encryptSecretValue, isSecretSettingKey } from './secrets'

// 模組級快取：避免同一請求或頻繁呼叫重複讀 DB
const _cache = new Map<string, { value: any; at: number }>()
const CACHE_TTL_MS = 30_000  // 30 秒過期

export type SettingKey =
  | 'office_name'
  | 'office_address'
  | 'office_phone'
  | 'office_fax'
  | 'office_email'
  | 'office_contact'
  | 'auto_backup_enabled'
  | 'auto_backup_interval'
  | 'data_retention_enabled'
  | 'retention_audit_archive_days'
  | 'retention_client_error_days'
  | 'retention_soft_deleted_voter_days'
  | 'idle_timeout_minutes'
  | 'stats_exclude_inactive'
  | 'election_year_mode'
  | 'theme'
  | 'backup_path'
  | 'gcal_client_id'
  | 'gcal_client_secret'
  | 'jwt_secret'
  | 'ai_provider'
  | 'ai_model'
  | 'ai_api_key'
  | 'ai_base_url'
  | 'ai_max_tokens'
  | 'line_channel_access_token'
  | 'line_channel_secret'
  | 'first_run'
  | 'port'

interface SettingTypes {
  office_name: string
  office_address: string
  office_phone: string
  office_fax: string
  office_email: string
  office_contact: string
  auto_backup_enabled: boolean
  auto_backup_interval: 'daily' | 'weekly'
  data_retention_enabled: string
  retention_audit_archive_days: string
  retention_client_error_days: string
  retention_soft_deleted_voter_days: string
  idle_timeout_minutes: number
  stats_exclude_inactive: boolean
  election_year_mode: boolean
  theme: 'light' | 'dark'
  backup_path: string
  gcal_client_id: string
  gcal_client_secret: string
  jwt_secret: string
  ai_provider: string
  ai_model: string
  ai_api_key: string
  ai_base_url: string
  ai_max_tokens: string
  line_channel_access_token: string
  line_channel_secret: string
  first_run: string
  port: string
}

export function getSetting<K extends SettingKey>(key: K): SettingTypes[K] | null {
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any
    if (!row) { _cache.set(key, { value: null, at: Date.now() }); return null }
    const val = isSecretSettingKey(key) ? decryptSecretValue(row.value) : row.value
    let parsed: any
    if (isSecretSettingKey(key)) parsed = val || ''
    // Auto-parse booleans and numbers
    else if (val === 'true') parsed = true
    else if (val === 'false') parsed = false
    else if (!isNaN(Number(val)) && val !== '') parsed = Number(val)
    else parsed = val
    _cache.set(key, { value: parsed, at: Date.now() })
    return parsed as any
  } catch (error) {
    // Secret 解密失敗不可靜默降級成 null，否則可能觸發重新產生 secret 或錯誤設定。
    if (isSecretSettingKey(key)) throw error
    return null
  }
}

export function setSetting<K extends SettingKey>(key: K, value: SettingTypes[K]): void {
  const rawVal = String(value)
  const strVal = isSecretSettingKey(key) ? encryptSecretValue(rawVal) : rawVal
  db.prepare(`
    INSERT INTO settings(key,value,updated_at)
    VALUES(?,?,datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(key, strVal)
  // 寫入後清除快取，確保下次讀到最新值
  _cache.delete(key)
}
