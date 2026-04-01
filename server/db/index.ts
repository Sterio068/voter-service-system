import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let dbPath: string

if (process.env.DATA_PATH) {
  // 由 Electron main process 設定（支援 NAS / 自訂路徑）
  fs.mkdirSync(process.env.DATA_PATH, { recursive: true })
  dbPath = path.join(process.env.DATA_PATH, 'voter-service.db')
} else {
  // 判斷是否在 Electron 環境（比 NODE_ENV 更可靠）
  let userDataDir: string
  try {
    const electronApp = require('electron').app
    userDataDir = electronApp.getPath('userData')
  } catch {
    // 純 Node.js 開發環境
    userDataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true })
  }
  dbPath = path.join(userDataDir, 'voter-service.db')
}

export const db = new Database(dbPath)

db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA busy_timeout = 15000")
db.exec("PRAGMA cache_size = -2000")
db.exec("PRAGMA synchronous = NORMAL")
db.exec("PRAGMA temp_store = MEMORY")
db.exec("PRAGMA foreign_keys = ON")

export { dbPath }

export function withDbRetry<T>(fn: () => T, maxRetries = 4): T {
  const delays = [100, 300, 700, 1500]
  let lastError: unknown
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn()
    } catch (e: any) {
      lastError = e
      const msg = e?.message || ''
      const code = e?.code || ''
      const isBusy = code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' ||
        msg.includes('database is locked')
      if (!isBusy || i === maxRetries - 1) throw e
      const sab = new SharedArrayBuffer(4)
      Atomics.wait(new Int32Array(sab), 0, 0, delays[i])
    }
  }
  throw lastError
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  return db.prepare(sql).all(...params) as T[]
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}

export function run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(...params)
  return { changes: result.changes as number, lastInsertRowid: result.lastInsertRowid as number }
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
