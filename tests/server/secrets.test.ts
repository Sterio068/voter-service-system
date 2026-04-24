import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import {
  decryptSecretValue,
  encryptSecretValue,
  isEncryptedSecret,
  migrateSecretsAtRest,
} from '../../server/utils/secrets'

const testKey = createHash('sha256').update('unit-test-key').digest()

test('encryptSecretValue encrypts and decrypts a secret', () => {
  const encrypted = encryptSecretValue('super-secret-token', testKey)

  assert.equal(isEncryptedSecret(encrypted), true)
  assert.notEqual(encrypted, 'super-secret-token')
  assert.equal(decryptSecretValue(encrypted, testKey), 'super-secret-token')
})

test('encryptSecretValue is idempotent for encrypted payloads', () => {
  const encrypted = encryptSecretValue('already-secret', testKey)

  assert.equal(encryptSecretValue(encrypted, testKey), encrypted)
})

test('decryptSecretValue rejects tampered encrypted payloads', () => {
  const encrypted = encryptSecretValue('tamper-sensitive-token', testKey)
  const parts = encrypted.split(':')
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`

  assert.throws(() => decryptSecretValue(parts.join(':'), testKey))
})

test('decryptSecretValue rejects a different encryption key', () => {
  const encrypted = encryptSecretValue('wrong-key-token', testKey)
  const otherKey = createHash('sha256').update('other-unit-test-key').digest()

  assert.throws(() => decryptSecretValue(encrypted, otherKey))
})

test('migrateSecretsAtRest encrypts supported settings and Google tokens only', () => {
  const settings = new Map<string, string | null>([
    ['ai_api_key', 'plain-ai-key'],
    ['office_name', 'plain-office'],
  ])
  const account = {
    id: 1,
    access_token: 'plain-access-token' as string | null,
    refresh_token: 'plain-refresh-token' as string | null,
  }
  const db = {
    prepare(sql: string) {
      if (sql.startsWith('SELECT key, value FROM settings')) {
        return {
          all: (...keys: string[]) => keys
            .filter(key => settings.has(key))
            .map(key => ({ key, value: settings.get(key) })),
        }
      }
      if (sql.startsWith('UPDATE settings SET value=')) {
        return { run: (value: string, key: string) => settings.set(key, value) }
      }
      if (sql.includes("sqlite_master")) {
        return { get: () => ({ name: 'google_calendar_accounts' }) }
      }
      if (sql.startsWith('SELECT id, access_token, refresh_token')) {
        return { all: () => [account] }
      }
      if (sql.startsWith('UPDATE google_calendar_accounts SET')) {
        return {
          run: (accessToken: string, refreshToken: string) => {
            account.access_token = accessToken
            account.refresh_token = refreshToken
          },
        }
      }
      throw new Error(`Unexpected SQL in fake DB: ${sql}`)
    },
  }

  migrateSecretsAtRest(db as any, testKey)

  const aiValue = settings.get('ai_api_key') || ''
  const officeValue = settings.get('office_name')

  assert.equal(isEncryptedSecret(aiValue), true)
  assert.equal(decryptSecretValue(aiValue, testKey), 'plain-ai-key')
  assert.equal(officeValue, 'plain-office')
  assert.equal(isEncryptedSecret(account.access_token), true)
  assert.equal(isEncryptedSecret(account.refresh_token), true)
  assert.equal(decryptSecretValue(account.access_token, testKey), 'plain-access-token')
  assert.equal(decryptSecretValue(account.refresh_token, testKey), 'plain-refresh-token')

  const encryptedOnce = aiValue
  migrateSecretsAtRest(db as any, testKey)
  assert.equal(settings.get('ai_api_key'), encryptedOnce)
})
