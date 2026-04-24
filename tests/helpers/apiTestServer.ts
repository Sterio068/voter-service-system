import type { FastifyInstance } from 'fastify'
import type { Database } from 'better-sqlite3'
import type { OutgoingHttpHeaders } from 'http'
import { randomBytes } from 'crypto'
import { mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

export type ApiTestContext = {
  app: FastifyInstance
  db: Database
  rootDir: string
  dataPath: string
  backupsPath: string
  uploadsPath: string
  close: () => Promise<void>
}

export type JsonResponse<T = any> = {
  statusCode: number
  body: T
  headers: OutgoingHttpHeaders
}

export function parseJsonResponse<T = any>(response: {
  statusCode: number
  payload: string
  headers: OutgoingHttpHeaders
}): JsonResponse<T> {
  return {
    statusCode: response.statusCode,
    body: response.payload ? JSON.parse(response.payload) : null,
    headers: response.headers,
  }
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

export function multipartPayload(file: {
  fieldName?: string
  filename: string
  contentType: string
  content: Buffer | string
}, fields: Record<string, string> = {}): { payload: Buffer; contentType: string } {
  const boundary = `----vss-test-${randomBytes(8).toString('hex')}`
  const chunks: Buffer[] = []
  const push = (value: string | Buffer) => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value))

  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`)
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`)
    push(`${value}\r\n`)
  }

  push(`--${boundary}\r\n`)
  push(`Content-Disposition: form-data; name="${file.fieldName || 'file'}"; filename="${file.filename}"\r\n`)
  push(`Content-Type: ${file.contentType}\r\n\r\n`)
  push(file.content)
  push(`\r\n--${boundary}--\r\n`)

  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

export async function createApiTestServer(): Promise<ApiTestContext> {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'vss-api-test-'))
  const dataPath = path.join(rootDir, 'data')
  const backupsPath = path.join(rootDir, 'backups')
  const uploadsPath = path.join(rootDir, 'uploads')

  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = dataPath
  process.env.BACKUPS_PATH = backupsPath
  process.env.UPLOADS_PATH = uploadsPath
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters'
  process.env.VOTER_SERVICE_SETTINGS_KEY = 'test-settings-encryption-key'
  process.env.VOTER_SERVICE_BACKUP_SIGNING_KEY = 'test-backup-signing-key'
  process.env.RATE_LIMIT_MAX = '10000'
  process.env.RATE_LIMIT_WINDOW = '1 minute'

  const [{ buildServer }, { db }] = await Promise.all([
    import('../../server/index'),
    import('../../server/db/index'),
  ])
  const app = await buildServer()
  await app.ready()

  return {
    app,
    db,
    rootDir,
    dataPath,
    backupsPath,
    uploadsPath,
    close: async () => {
      await app.close()
      try { db.close() } catch {}
      rmSync(rootDir, { recursive: true, force: true })
    },
  }
}

export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string
): Promise<{ token: string; user: any }> {
  const response = parseJsonResponse(await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  }))
  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${username}: ${response.statusCode} ${JSON.stringify(response.body)}`)
  }
  return response.body.data
}
