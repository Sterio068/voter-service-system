import { db } from '../db/index'

export type SettingKey =
  | 'office_name'
  | 'auto_backup_enabled'
  | 'auto_backup_interval'
  | 'idle_timeout_minutes'
  | 'stats_exclude_inactive'
  | 'election_year_mode'
  | 'theme'
  | 'backup_path'

interface SettingTypes {
  office_name: string
  auto_backup_enabled: boolean
  auto_backup_interval: 'daily' | 'weekly'
  idle_timeout_minutes: number
  stats_exclude_inactive: boolean
  election_year_mode: boolean
  theme: 'light' | 'dark'
  backup_path: string
}

export function getSetting<K extends SettingKey>(key: K): SettingTypes[K] | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any
    if (!row) return null
    const val = row.value
    // Auto-parse booleans and numbers
    if (val === 'true') return true as any
    if (val === 'false') return false as any
    if (!isNaN(Number(val)) && val !== '') return Number(val) as any
    return val as any
  } catch {
    return null
  }
}

export function setSetting<K extends SettingKey>(key: K, value: SettingTypes[K]): void {
  const strVal = String(value)
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, strVal)
}
