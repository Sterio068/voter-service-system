/**
 * 獨立 migration 腳本：建立選民全文搜尋 FTS5 索引。
 *
 * 用途：在不重跑完整 runMigrations() 的情況下，單獨套用 FTS5 索引。
 * （注意：正常啟動時 runMigrations() 已會自動套用，此腳本供手動 / 維運使用。）
 *
 * 執行：
 *   npx tsx server/db/migrateVoterFts.ts
 *   DATA_PATH=/path/to/data npx tsx server/db/migrateVoterFts.ts
 *
 * 安全性：
 * - 原 voters 表結構與資料完全不變。
 * - 冪等：可重複執行。
 * - 環境不支援 FTS5/trigram 時安全跳過（不報錯、不影響系統）。
 */
import { db, dbPath } from './index'
import { applyVoterFts, isVoterFtsReady } from './voterFts'

export function migrateVoterFts(): { enabled: boolean; ready: boolean } {
  const enabled = applyVoterFts(db)
  const ready = isVoterFtsReady(db)
  return { enabled, ready }
}

if (require.main === module && !process.versions.electron) {
  try {
    console.log(`[voter-fts] 目標資料庫: ${dbPath}`)
    const { enabled, ready } = migrateVoterFts()
    if (enabled && ready) {
      const count = (db.prepare('SELECT COUNT(*) AS c FROM voters_fts').get() as any).c
      console.log(`✅ 選民全文搜尋已啟用（voters_fts 索引 ${count} 筆）`)
    } else if (!enabled) {
      console.log('⚠️ 此環境不支援 FTS5/trigram，已安全跳過（查詢層將沿用 LIKE）')
    } else {
      console.log('⚠️ FTS 表未就緒，請檢查日誌')
    }
    process.exit(0)
  } catch (error) {
    console.error('選民全文搜尋 migration 失敗：', error)
    process.exit(1)
  }
}
