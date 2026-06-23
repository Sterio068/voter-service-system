/**
 * 獨立 rollback 腳本：移除選民全文搜尋 FTS5 索引。
 *
 * 執行：
 *   npx tsx server/db/rollbackVoterFts.ts
 *   DATA_PATH=/path/to/data npx tsx server/db/rollbackVoterFts.ts
 *
 * 安全性：
 * - 只移除 voters_fts 虛擬表與 3 個同步 trigger。
 * - 原 voters 表結構與資料完全不受影響（FTS 為 external-content，不含原始資料副本）。
 * - 冪等：可重複執行。
 * - 回滾後查詢層會自動回退 LIKE（isVoterFtsReady() 偵測不到 voters_fts 即回退）。
 *
 * 注意：若之後再次啟動系統，runMigrations() 會重新建立 FTS。
 *       若要永久停用，需同時移除 runMigrations() 中的 applyVoterFts() 呼叫。
 */
import { db, dbPath } from './index'
import { rollbackVoterFts, isVoterFtsReady } from './voterFts'

export function rollbackVoterFtsMigration(): { ready: boolean } {
  rollbackVoterFts(db)
  return { ready: isVoterFtsReady(db) }
}

if (require.main === module && !process.versions.electron) {
  try {
    console.log(`[voter-fts] 目標資料庫: ${dbPath}`)
    const { ready } = rollbackVoterFtsMigration()
    if (!ready) {
      console.log('✅ 選民全文搜尋索引已移除（voters_fts + trigger）；原選民資料未受影響')
    } else {
      console.log('⚠️ voters_fts 仍存在，請檢查日誌')
    }
    process.exit(0)
  } catch (error) {
    console.error('選民全文搜尋 rollback 失敗：', error)
    process.exit(1)
  }
}
