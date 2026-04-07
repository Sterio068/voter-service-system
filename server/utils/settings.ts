import { db } from '../db/index'

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
  | 'idle_timeout_minutes'
  | 'stats_exclude_inactive'
  | 'election_year_mode'
  | 'theme'
  | 'backup_path'
  | 'gcal_client_id'
  | 'gcal_client_secret'
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
  idle_timeout_minutes: number
  stats_exclude_inactive: boolean
  election_year_mode: boolean
  theme: 'light' | 'dark'
  backup_path: string
  gcal_client_id: string
  gcal_client_secret: string
  port: string
}

export function getSetting<K extends SettingKey>(key: K): SettingTypes[K] | null {
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any
    if (!row) { _cache.set(key, { value: null, at: Date.now() }); return null }
    const val = row.value
    let parsed: any
    // Auto-parse booleans and numbers
    if (val === 'true') parsed = true
    else if (val === 'false') parsed = false
    else if (!isNaN(Number(val)) && val !== '') parsed = Number(val)
    else parsed = val
    _cache.set(key, { value: parsed, at: Date.now() })
    return parsed as any
  } catch {
    return null
  }
}

export function setSetting<K extends SettingKey>(key: K, value: SettingTypes[K]): void {
  const strVal = String(value)
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, strVal)
  // 寫入後清除快取，確保下次讀到最新值
  _cache.delete(key)
}
