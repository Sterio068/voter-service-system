import Database from 'better-sqlite3'

/**
 * 選民全文搜尋（FTS5）模組
 *
 * 設計原則（保守、可回滾、不破壞既有資料）：
 * - 原 `voters` 表結構完全不變。
 * - 以「外部內容（external content）」FTS5 虛擬表掛在 voters 上：
 *   `content='voters', content_rowid='id'`，FTS 只儲存索引、不複製欄位內容。
 * - INSERT / UPDATE / DELETE trigger 自動同步，所有寫入路徑（含批次匯入、
 *   軟刪除 UPDATE、合併）皆自動維護索引，無需改寫任何 route 的寫入邏輯。
 * - 查詢時仍 JOIN 回 voters 表套用既有過濾（is_active 等），結果格式不變。
 *
 * 為什麼用 trigram tokenizer：
 * - 中文姓名/地址沒有空白分詞，預設 unicode61 會把整段 CJK 視為單一 token，
 *   只能前綴比對，無法做「中段子字串」搜尋（例如「大明」搜不到「王大明」）。
 * - trigram tokenizer 以 3 字元為單位索引，可做任意位置子字串比對，語意與
 *   既有 LIKE '%kw%' 對齊（已實測：>=3 字元查詢結果集與 LIKE 完全一致）。
 * - trigram 限制：查詢字串需 >= 3 字元。故查詢層對 < 3 字元仍回退 LIKE，
 *   確保短查詢結果完全不變（短查詢本就便宜，無效能疑慮）。
 *
 * 可被 migrate.ts（套用）與 rollback 腳本（移除）共用。
 */

/** trigram tokenizer 的最小查詢長度（< 此長度需回退 LIKE）。 */
export const VOTER_FTS_MIN_QUERY_LEN = 3

// FTS 索引涵蓋的可搜尋欄位（姓名 / 手機 / 市話 / 身分證 / 地址）。
// 順序固定，trigger 與 rebuild 都依此順序填值。
// 此為「索引」涵蓋的欄位超集；各查詢端點再用 column-filtered MATCH
// 限縮到與既有 LIKE 完全相同的欄位，確保結果集不變。
export const VOTER_FTS_COLUMNS = [
  'name',
  'mobile',
  'phone',
  'id_number',
  'household_address',
] as const

export type VoterFtsColumn = (typeof VOTER_FTS_COLUMNS)[number]

type DB = Database.Database

function ftsColsList(): string {
  return VOTER_FTS_COLUMNS.join(', ')
}

function newRowValues(): string {
  return VOTER_FTS_COLUMNS.map((c) => `new.${c}`).join(', ')
}

function oldRowValues(): string {
  return VOTER_FTS_COLUMNS.map((c) => `old.${c}`).join(', ')
}

/**
 * 檢測目前的 SQLite build 是否支援 FTS5 + trigram tokenizer。
 * 不支援時，呼叫端應跳過 FTS（查詢層自動回退 LIKE），不可使系統啟動失敗。
 */
export function isFts5Available(db: DB): boolean {
  try {
    // trigram 自 SQLite 3.34 起支援；一併驗證 FTS5 與 trigram 皆可用。
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS __fts5_probe USING fts5(x, tokenize='trigram')")
    db.exec('DROP TABLE IF EXISTS __fts5_probe')
    return true
  } catch {
    try { db.exec('DROP TABLE IF EXISTS __fts5_probe') } catch {}
    return false
  }
}

/**
 * 判斷 FTS 索引是否已建立且可用。查詢層用此決定走 FTS 或回退 LIKE。
 */
export function isVoterFtsReady(db: DB): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='voters_fts'")
      .get()
    return !!row
  } catch {
    return false
  }
}

/**
 * 建立 FTS5 虛擬表 + 同步 trigger，並以既有 voters 資料回填索引。
 * 冪等：可重複呼叫。原 voters 表不受影響。
 *
 * 回傳是否成功啟用 FTS（false 代表此環境不支援 FTS5，已安全跳過）。
 */
export function applyVoterFts(db: DB): boolean {
  if (!isFts5Available(db)) return false

  const cols = ftsColsList()

  // 1) 外部內容 FTS5 表：只索引、不複製欄位資料。
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS voters_fts USING fts5(
      ${cols},
      content='voters',
      content_rowid='id',
      tokenize='trigram'
    );
  `)

  // 2) 同步 trigger（掛在 voters 表，涵蓋所有寫入路徑）。
  //    使用 external-content FTS5 的標準 delete 慣例（special 'delete' command）。
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS voters_fts_ai AFTER INSERT ON voters BEGIN
      INSERT INTO voters_fts(rowid, ${cols}) VALUES (new.id, ${newRowValues()});
    END;

    CREATE TRIGGER IF NOT EXISTS voters_fts_ad AFTER DELETE ON voters BEGIN
      INSERT INTO voters_fts(voters_fts, rowid, ${cols}) VALUES ('delete', old.id, ${oldRowValues()});
    END;

    CREATE TRIGGER IF NOT EXISTS voters_fts_au AFTER UPDATE ON voters BEGIN
      INSERT INTO voters_fts(voters_fts, rowid, ${cols}) VALUES ('delete', old.id, ${oldRowValues()});
      INSERT INTO voters_fts(rowid, ${cols}) VALUES (new.id, ${newRowValues()});
    END;
  `)

  // 3) 回填既有資料：用 FTS5 'rebuild' 由 content table 重建整個索引（冪等）。
  db.exec(`INSERT INTO voters_fts(voters_fts) VALUES('rebuild');`)

  return true
}

/**
 * 回滾：移除 trigger 與 FTS 表。原 voters 表與資料不受影響。
 * 冪等：可重複呼叫。
 */
export function rollbackVoterFts(db: DB): void {
  db.exec(`
    DROP TRIGGER IF EXISTS voters_fts_ai;
    DROP TRIGGER IF EXISTS voters_fts_ad;
    DROP TRIGGER IF EXISTS voters_fts_au;
    DROP TABLE IF EXISTS voters_fts;
  `)
}

/**
 * 將使用者輸入轉為安全的 FTS5 (trigram) MATCH 查詢字串，並限縮到指定欄位。
 *
 * - trigram tokenizer 以整段字串做子字串比對（語意對齊 LIKE '%kw%'）。
 * - 用雙引號包成字串字面，避免 MATCH 把特殊字元（" * : ( ) - 等）
 *   解讀為查詢語法而拋錯或造成注入。
 * - 以 column-filter `{c1 c2 ...} : "kw"` 限縮搜尋欄位，使結果集與
 *   各端點既有 LIKE 的欄位範圍完全一致。
 *
 * @param input 使用者輸入關鍵字
 * @param columns 限縮的欄位（須為 VOTER_FTS_COLUMNS 子集）；省略則搜尋全部索引欄位
 * @returns null 代表此輸入不適用 FTS（空字串、去除空白後 < 3 字元），
 *          呼叫端應回退 LIKE 以保持短查詢結果與既有行為一致。
 */
export function buildVoterFtsMatch(
  input: string,
  columns?: readonly VoterFtsColumn[],
): string | null {
  if (!input) return null
  // trigram 以原字串子字串比對，內部空白也算字元；不切 token，整段比對。
  // 去除雙引號避免破壞字串字面語法。
  const cleaned = String(input).trim().replace(/"/g, '')
  // 以實際字元數（非 UTF-16 code unit）計算，確保 CJK 判斷正確。
  if ([...cleaned].length < VOTER_FTS_MIN_QUERY_LEN) return null
  const literal = `"${cleaned}"`
  if (!columns || columns.length === 0) return literal
  // 欄位名來自固定常數白名單，非使用者輸入，無注入風險。
  return `{${columns.join(' ')}} : ${literal}`
}
