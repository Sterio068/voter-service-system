import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { applyPendingRestore } from '../../server/db/restoreOnStartup'

test('applyPendingRestore replaces the main database and removes pending marker sidecars', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vss-restore-startup-'))
  const dbPath = path.join(root, 'voter-service.db')
  const restorePath = `${dbPath}.restore`
  const walPath = `${dbPath}-wal`
  const shmPath = `${dbPath}-shm`

  const currentDb = new Database(dbPath)
  currentDb.exec('CREATE TABLE demo (value TEXT)')
  currentDb.prepare('INSERT INTO demo(value) VALUES (?)').run('current')
  currentDb.close()

  const restoreDb = new Database(restorePath)
  restoreDb.exec('CREATE TABLE demo (value TEXT)')
  restoreDb.prepare('INSERT INTO demo(value) VALUES (?)').run('restored')
  restoreDb.close()

  fs.writeFileSync(walPath, 'stale-wal')
  fs.writeFileSync(shmPath, 'stale-shm')

  const result = applyPendingRestore(dbPath)
  assert.equal(result.applied, true)
  assert.equal(result.rolledBack, false)
  assert.equal(fs.existsSync(restorePath), false)
  assert.equal(fs.existsSync(walPath), false)
  assert.equal(fs.existsSync(shmPath), false)

  const reopenedDb = new Database(dbPath, { readonly: true })
  const row = reopenedDb.prepare('SELECT value FROM demo').get() as { value: string }
  reopenedDb.close()

  assert.equal(row.value, 'restored')
  fs.rmSync(root, { recursive: true, force: true })
})

test('applyPendingRestore is a no-op when there is no pending restore marker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vss-restore-startup-empty-'))
  const dbPath = path.join(root, 'voter-service.db')
  const db = new Database(dbPath)
  db.exec('CREATE TABLE demo (value TEXT)')
  db.prepare('INSERT INTO demo(value) VALUES (?)').run('current')
  db.close()

  const result = applyPendingRestore(dbPath)
  assert.equal(result.applied, false)
  assert.equal(result.rolledBack, false)

  const reopenedDb = new Database(dbPath, { readonly: true })
  const row = reopenedDb.prepare('SELECT value FROM demo').get() as { value: string }
  reopenedDb.close()

  assert.equal(row.value, 'current')
  fs.rmSync(root, { recursive: true, force: true })
})

test('applyPendingRestore rolls back to the current database when the restore file is invalid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vss-restore-startup-rollback-'))
  const dbPath = path.join(root, 'voter-service.db')
  const restorePath = `${dbPath}.restore`

  const currentDb = new Database(dbPath)
  currentDb.exec('CREATE TABLE demo (value TEXT)')
  currentDb.prepare('INSERT INTO demo(value) VALUES (?)').run('current')
  currentDb.close()

  fs.writeFileSync(restorePath, 'not a sqlite database')

  const result = applyPendingRestore(dbPath)
  assert.equal(result.applied, false)
  assert.equal(result.rolledBack, true)
  assert.match(result.error || '', /integrity check failed|not a database/i)
  assert.ok(result.failedRestorePath)
  assert.equal(fs.existsSync(result.failedRestorePath!), true)
  assert.equal(fs.existsSync(restorePath), false)

  const reopenedDb = new Database(dbPath, { readonly: true })
  const row = reopenedDb.prepare('SELECT value FROM demo').get() as { value: string }
  reopenedDb.close()

  assert.equal(row.value, 'current')
  fs.rmSync(root, { recursive: true, force: true })
})
