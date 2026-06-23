import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  applyVoterFts,
  rollbackVoterFts,
  isVoterFtsReady,
  isFts5Available,
  buildVoterFtsMatch,
} from '../../server/db/voterFts'

// 與 server/db/migrate.ts 中 voters 表「可搜尋欄位」一致的精簡 schema。
function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE voters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT,
      phone TEXT,
      id_number TEXT,
      household_address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `)
  return db
}

const SAMPLE: Array<[string, string, string, string, string]> = [
  ['王大明', '0912345678', '0223456789', 'A123456789', '台北市中山區民權東路100號'],
  ['陳大明', '0987654321', '0298765432', 'B234567890', '新北市板橋區文化路50號'],
  ['林志玲', '0911222333', '0233334444', 'C345678901', '台中市西屯區台灣大道200號'],
  ['王小明', '0900111222', '0211112222', 'D456789012', '台北市中山區一號'],
]

function seed(db: Database.Database) {
  const ins = db.prepare(
    'INSERT INTO voters (name,mobile,phone,id_number,household_address) VALUES (?,?,?,?,?)',
  )
  for (const r of SAMPLE) ins.run(...r)
}

// 既有 LIKE 行為（作為 oracle 比對基準）。
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}
function likeIds(db: Database.Database, cols: string[], kw: string): number[] {
  const es = escapeLike(kw)
  const where = cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')
  return (
    db
      .prepare(`SELECT id FROM voters WHERE is_active=1 AND (${where})`)
      .all(...cols.map(() => `%${es}%`)) as Array<{ id: number }>
  )
    .map((r) => r.id)
    .sort((a, b) => a - b)
}
function ftsIds(db: Database.Database, match: string): number[] {
  return (
    db
      .prepare(
        'SELECT id FROM voters WHERE is_active=1 AND id IN (SELECT rowid FROM voters_fts WHERE voters_fts MATCH ?)',
      )
      .all(match) as Array<{ id: number }>
  )
    .map((r) => r.id)
    .sort((a, b) => a - b)
}

test('FTS5 與 trigram 在此環境可用', () => {
  const db = makeDb()
  assert.equal(isFts5Available(db), true)
  db.close()
})

test('applyVoterFts 建立索引且回填既有資料；rollback 後完整移除', () => {
  const db = makeDb()
  seed(db)
  assert.equal(isVoterFtsReady(db), false)

  const enabled = applyVoterFts(db)
  assert.equal(enabled, true)
  assert.equal(isVoterFtsReady(db), true)
  const count = (db.prepare('SELECT COUNT(*) AS c FROM voters_fts').get() as any).c
  assert.equal(count, SAMPLE.length)

  rollbackVoterFts(db)
  assert.equal(isVoterFtsReady(db), false)
  // 原表資料不受影響
  const voterCount = (db.prepare('SELECT COUNT(*) AS c FROM voters').get() as any).c
  assert.equal(voterCount, SAMPLE.length)
  db.close()
})

test('FTS 結果與 LIKE 在 >=3 字元查詢完全一致（各端點欄位範圍）', () => {
  const db = makeDb()
  seed(db)
  applyVoterFts(db)

  const cases: Array<{ cols: ('name' | 'mobile' | 'phone' | 'id_number' | 'household_address')[]; q: string }> = [
    { cols: ['name', 'mobile', 'phone', 'household_address'], q: '民權東路' },
    { cols: ['name', 'mobile', 'phone', 'household_address'], q: '王大明' },
    { cols: ['name', 'mobile', 'phone', 'household_address'], q: '中山區' },
    { cols: ['name', 'mobile'], q: '0912' },
    { cols: ['name', 'mobile', 'id_number'], q: 'A123456789' },
  ]
  for (const { cols, q } of cases) {
    const match = buildVoterFtsMatch(q, cols)
    assert.ok(match, `match expr should exist for "${q}"`)
    assert.deepEqual(
      ftsIds(db, match!),
      likeIds(db, cols, q),
      `FTS vs LIKE mismatch for q="${q}" cols=${cols.join(',')}`,
    )
  }
  db.close()
})

test('< 3 字元查詢回傳 null（呼叫端回退 LIKE）', () => {
  assert.equal(buildVoterFtsMatch('大明'), null)
  assert.equal(buildVoterFtsMatch('王'), null)
  assert.equal(buildVoterFtsMatch(''), null)
  assert.equal(buildVoterFtsMatch('  '), null)
  assert.ok(buildVoterFtsMatch('王大明'))
})

test('特殊字元輸入不會拋 FTS 語法錯誤', () => {
  const db = makeDb()
  seed(db)
  applyVoterFts(db)
  for (const q of ['"; DROP', 'a* b', '(test)', 'a:b:c', 'NEAR AND OR']) {
    const match = buildVoterFtsMatch(q, ['name', 'mobile', 'household_address'])
    if (match) {
      assert.doesNotThrow(() => ftsIds(db, match))
    }
  }
  db.close()
})

test('trigger 在 INSERT/UPDATE/DELETE 後同步索引', () => {
  const db = makeDb()
  seed(db)
  applyVoterFts(db)
  const cols: ('name' | 'household_address')[] = ['name', 'household_address']

  // INSERT
  db.prepare('INSERT INTO voters (name,household_address) VALUES (?,?)').run(
    '新增測試員',
    '宜蘭縣羅東鎮中正路999號',
  )
  let m = buildVoterFtsMatch('羅東鎮', cols)
  assert.ok(m)
  assert.equal(ftsIds(db, m!).length, 1)

  // UPDATE：搬到新地址，舊地址應搜不到、新地址搜得到
  const row = db.prepare("SELECT id FROM voters WHERE name='新增測試員'").get() as any
  db.prepare('UPDATE voters SET household_address=? WHERE id=?').run('花蓮縣吉安鄉自強路1號', row.id)
  m = buildVoterFtsMatch('羅東鎮', cols)
  assert.equal(ftsIds(db, m!).length, 0, '舊地址應已從索引移除')
  m = buildVoterFtsMatch('吉安鄉', cols)
  assert.equal(ftsIds(db, m!).length, 1, '新地址應已進索引')

  // DELETE
  db.prepare('DELETE FROM voters WHERE id=?').run(row.id)
  m = buildVoterFtsMatch('吉安鄉', cols)
  assert.equal(ftsIds(db, m!).length, 0, 'DELETE 後索引應移除')
  db.close()
})

test('軟刪除（is_active=0）的選民被查詢層的 is_active 過濾排除', () => {
  const db = makeDb()
  seed(db)
  applyVoterFts(db)
  // 將「王大明」軟刪除
  db.prepare("UPDATE voters SET is_active=0 WHERE name='王大明'").run()
  const m = buildVoterFtsMatch('王大明', ['name'])
  assert.ok(m)
  // 查詢層 WHERE is_active=1 應排除軟刪除者（FTS 仍索引，但被 JOIN 過濾）
  const visible = ftsIds(db, m!)
  assert.ok(!visible.includes(1), '軟刪除選民不應出現在 is_active=1 結果中')
  db.close()
})
