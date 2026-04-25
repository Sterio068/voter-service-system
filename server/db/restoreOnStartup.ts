import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

function safeUnlink(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

function safeRename(sourcePath: string, targetPath: string): string {
  try {
    fs.renameSync(sourcePath, targetPath)
    return targetPath
  } catch {
    fs.copyFileSync(sourcePath, targetPath)
    fs.unlinkSync(sourcePath)
    return targetPath
  }
}

function runIntegrityCheck(filePath: string): string | null {
  let db: Database.Database | null = null
  try {
    db = new Database(filePath, { readonly: true })
    const rows = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>
    const messages = rows.map((row) => String(row.integrity_check || 'unknown'))
    if (messages.length === 1 && messages[0] === 'ok') return null
    return messages.join('; ')
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    try { db?.close() } catch {}
  }
}

function checkpointDatabaseToMainFile(filePath: string): void {
  let db: Database.Database | null = null
  try {
    db = new Database(filePath)
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    try { db?.close() } catch {}
  }
}

export type ApplyPendingRestoreResult = {
  applied: boolean
  rolledBack: boolean
  hadExistingDatabase: boolean
  failedRestorePath: string | null
  error: string | null
}

export function applyPendingRestore(dbPath: string): ApplyPendingRestoreResult {
  const restorePath = `${dbPath}.restore`
  const hadExistingDatabase = fs.existsSync(dbPath)
  if (!fs.existsSync(restorePath)) {
    return {
      applied: false,
      rolledBack: false,
      hadExistingDatabase,
      failedRestorePath: null,
      error: null,
    }
  }

  const walPath = `${dbPath}-wal`
  const shmPath = `${dbPath}-shm`
  const rollbackPath = path.join(path.dirname(dbPath), `.${path.basename(dbPath)}.startup-rollback`)
  let failedRestorePath: string | null = null

  safeUnlink(rollbackPath)

  try {
    if (hadExistingDatabase) {
      checkpointDatabaseToMainFile(dbPath)
      fs.copyFileSync(dbPath, rollbackPath)
    }

    // Ensure old WAL/SHM sidecars do not get replayed over the restored main DB.
    safeUnlink(walPath)
    safeUnlink(shmPath)

    fs.copyFileSync(restorePath, dbPath)

    const integrityError = runIntegrityCheck(dbPath)
    if (integrityError) {
      throw new Error(`restore integrity check failed: ${integrityError}`)
    }

    fs.unlinkSync(restorePath)

    // Copying the main DB may cause SQLite to recreate sidecars later; keep startup clean.
    safeUnlink(walPath)
    safeUnlink(shmPath)
    safeUnlink(rollbackPath)

    return {
      applied: true,
      rolledBack: false,
      hadExistingDatabase,
      failedRestorePath: null,
      error: null,
    }
  } catch (error) {
    let rolledBack = false
    let message = error instanceof Error ? error.message : String(error)

    try {
      if (hadExistingDatabase && fs.existsSync(rollbackPath)) {
        safeUnlink(walPath)
        safeUnlink(shmPath)
        fs.copyFileSync(rollbackPath, dbPath)
        rolledBack = true
      } else {
        safeUnlink(dbPath)
      }
    } catch (rollbackError) {
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      message = `${message}; rollback failed: ${rollbackMessage}`
    }

    try {
      if (fs.existsSync(restorePath)) {
        failedRestorePath = safeRename(restorePath, `${restorePath}.failed-${Date.now()}`)
      }
    } catch (renameError) {
      const renameMessage = renameError instanceof Error ? renameError.message : String(renameError)
      message = `${message}; failed restore archive failed: ${renameMessage}`
      failedRestorePath = restorePath
    }

    safeUnlink(walPath)
    safeUnlink(shmPath)
    safeUnlink(rollbackPath)

    return {
      applied: false,
      rolledBack,
      hadExistingDatabase,
      failedRestorePath,
      error: message,
    }
  }
}
