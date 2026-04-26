import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import os from 'os'
import type { Database } from 'better-sqlite3'

export const ENCRYPTED_SECRET_PREFIX = 'enc:v1:'

export const SECRET_SETTING_KEYS = new Set([
  'ai_api_key',
  'gcal_client_secret',
  'jwt_secret',
  'line_channel_access_token',
  'line_channel_secret',
])

const GCAL_SECRET_COLUMNS = ['access_token', 'refresh_token'] as const

export function isSecretSettingKey(key: string): boolean {
  return SECRET_SETTING_KEYS.has(key)
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_SECRET_PREFIX)
}

export function getSecretEncryptionKey(): Buffer {
  const explicit = process.env.VOTER_SERVICE_SETTINGS_KEY || process.env.SETTINGS_ENCRYPTION_KEY

  // Production must supply an explicit key. Hostname + username are not
  // secret — on a VM clone or predictable host name, an attacker with DB
  // read access could reconstruct the key and decrypt all stored
  // secrets. The fallback only stays available in development / test
  // (where reproducibility matters and the threat model is local-only).
  if (!explicit && process.env.NODE_ENV === 'production') {
    throw new Error(
      'VOTER_SERVICE_SETTINGS_KEY (or legacy SETTINGS_ENCRYPTION_KEY) must be set in production. ' +
      'Generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"` ' +
      'and persist it in your service configuration.'
    )
  }

  const material = explicit || [
    'voter-service-system',
    os.hostname(),
    os.userInfo().username,
    process.env.DATA_PATH || os.homedir(),
  ].join('|')

  return createHash('sha256').update(material).digest()
}

export function encryptSecretValue(value: string | null | undefined, key = getSecretEncryptionKey()): string {
  if (value === null || value === undefined || value === '') return ''
  if (isEncryptedSecret(value)) return value

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENCRYPTED_SECRET_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

export function decryptSecretValue(value: string | null | undefined, key = getSecretEncryptionKey()): string {
  if (!value) return ''
  if (!isEncryptedSecret(value)) return value

  const payload = value.slice(ENCRYPTED_SECRET_PREFIX.length)
  const [ivB64, tagB64, ciphertextB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !ciphertextB64) throw new Error('Encrypted secret payload is malformed')

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskSecret(value: string | null | undefined): string {
  const plain = decryptSecretValue(value)
  if (!plain) return ''
  return plain.length >= 8 ? `***${plain.slice(-4)}` : '***'
}

export function migrateSecretsAtRest(db: Database, key = getSecretEncryptionKey()): void {
  const migrate = () => {
    const settingRows = db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${Array.from(SECRET_SETTING_KEYS).map(() => '?').join(',')})`
    ).all(...Array.from(SECRET_SETTING_KEYS)) as Array<{ key: string; value: string | null }>

    const updateSetting = db.prepare("UPDATE settings SET value=?, updated_at=datetime('now','localtime') WHERE key=?")
    for (const row of settingRows) {
      if (row.value && !isEncryptedSecret(row.value)) {
        updateSetting.run(encryptSecretValue(row.value, key), row.key)
      }
    }

    const hasGcalAccounts = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='google_calendar_accounts'"
    ).get()
    if (!hasGcalAccounts) return

    const accounts = db.prepare('SELECT id, access_token, refresh_token FROM google_calendar_accounts').all() as Array<{
      id: number
      access_token: string | null
      refresh_token: string | null
    }>
    const updateAccount = db.prepare('UPDATE google_calendar_accounts SET access_token=?, refresh_token=? WHERE id=?')
    for (const account of accounts) {
      const next: Record<typeof GCAL_SECRET_COLUMNS[number], string | null> = {
        access_token: account.access_token,
        refresh_token: account.refresh_token,
      }
      let changed = false
      for (const column of GCAL_SECRET_COLUMNS) {
        const value = next[column]
        if (value && !isEncryptedSecret(value)) {
          next[column] = encryptSecretValue(value, key)
          changed = true
        }
      }
      if (changed) updateAccount.run(next.access_token, next.refresh_token, account.id)
    }
  }

  if (typeof (db as any).transaction === 'function') {
    const transaction = (db as any).transaction(migrate)
    transaction()
    return
  }

  migrate()
}
