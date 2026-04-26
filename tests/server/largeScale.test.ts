import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bearer,
  createApiTestServer,
  loginAs,
  parseJsonResponse,
  type ApiTestContext,
} from '../helpers/apiTestServer'

let ctx: ApiTestContext
let adminToken = ''

// 50k 選民 + 5k 案件壓測：
// - API list/search 應在 1 秒內回應
// - export 超過上限時應回 413 並提示縮小範圍
// - LIKE 搜尋至少能在合理時間內回（< 3 秒）
// CI / 本機都跑；插入用 transaction batch 控制在 ~5–10 秒
const VOTER_COUNT = Number.parseInt(process.env.LARGE_SCALE_VOTER_COUNT || '50000', 10)
const PETITION_COUNT = Number.parseInt(process.env.LARGE_SCALE_PETITION_COUNT || '5000', 10)

test.before(async () => {
  process.env.NODE_ENV = 'test'
  // 把 export 上限暫時設小，方便測 413
  process.env.VOTER_EXPORT_LIMIT = String(Math.floor(VOTER_COUNT / 5))
  ctx = await createApiTestServer()
  adminToken = (await loginAs(ctx.app, 'admin', 'admin123')).token

  // 直接用 SQL 批次塞資料，跳過 API 開銷
  console.log(`[large-scale] seeding ${VOTER_COUNT} voters + ${PETITION_COUNT} petitions ...`)
  const t0 = Date.now()
  const insertVoter = ctx.db.prepare(`
    INSERT INTO voters (name, mobile, household_city, household_district, household_village, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
  `)
  const cities = ['臺北市', '新北市', '桃園市', '臺中市', '高雄市']
  const districts = ['信義區', '大安區', '中山區', '板橋區', '中壢區', '北屯區', '左營區']
  ctx.db.exec('BEGIN')
  try {
    for (let i = 0; i < VOTER_COUNT; i++) {
      insertVoter.run(
        `壓測選民${i + 1}`,
        `09${String(10000000 + i).padStart(8, '0').slice(-8)}`,
        cities[i % cities.length],
        districts[i % districts.length],
        `第${(i % 30) + 1}里`,
      )
    }
    ctx.db.exec('COMMIT')
  } catch (e) {
    ctx.db.exec('ROLLBACK')
    throw e
  }

  const insertPetition = ctx.db.prepare(`
    INSERT INTO petitions (case_number, petition_date, voter_id, content, status, urgency, is_active, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 'normal', 1, 1, datetime('now','localtime'), datetime('now','localtime'))
  `)
  ctx.db.exec('BEGIN')
  try {
    for (let i = 0; i < PETITION_COUNT; i++) {
      insertPetition.run(
        `LST-${String(i + 1).padStart(6, '0')}`,
        '2026-04-25',
        (i % VOTER_COUNT) + 1,
        `壓測陳情內容 ${i + 1}：水溝堵塞、路燈故障、垃圾車異常等案件範例。`,
      )
    }
    ctx.db.exec('COMMIT')
  } catch (e) {
    ctx.db.exec('ROLLBACK')
    throw e
  }
  const dt = Date.now() - t0
  console.log(`[large-scale] seed completed in ${dt}ms`)
})

test.after(async () => {
  await ctx.close()
  delete process.env.VOTER_EXPORT_LIMIT
})

test('voter list query stays under 1.5s under large dataset', async () => {
  const t0 = Date.now()
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?page=1&pageSize=20',
    headers: bearer(adminToken),
  }))
  const dt = Date.now() - t0
  assert.equal(resp.statusCode, 200)
  assert.equal(resp.body.data.length, 20)
  assert.equal(resp.body.total, VOTER_COUNT)
  assert.ok(dt < 1500, `voter list query took ${dt}ms (expected < 1500ms)`)
  console.log(`[large-scale] voter list 20/${VOTER_COUNT}: ${dt}ms`)
})

test('voter list with city filter is fast (uses index)', async () => {
  const t0 = Date.now()
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?city=臺北市&page=1&pageSize=50',
    headers: bearer(adminToken),
  }))
  const dt = Date.now() - t0
  assert.equal(resp.statusCode, 200)
  assert.ok(resp.body.total > 0)
  assert.ok(dt < 1500, `voter filter query took ${dt}ms`)
  console.log(`[large-scale] voter filter city=臺北市: ${resp.body.total} matched in ${dt}ms`)
})

test('voter LIKE search is bounded (< 3s) even on full table scan', async () => {
  const t0 = Date.now()
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?search=壓測選民1&page=1&pageSize=20',
    headers: bearer(adminToken),
  }))
  const dt = Date.now() - t0
  assert.equal(resp.statusCode, 200)
  assert.ok(resp.body.total > 0)
  assert.ok(dt < 3000, `voter search took ${dt}ms (LIKE is full-scan, allow up to 3s)`)
  console.log(`[large-scale] voter LIKE search: ${resp.body.total} matched in ${dt}ms`)
})

test('voter timeline endpoint stays well under 100ms even on a 50k voter dataset', async () => {
  // Voter id 1 owns ~5000/50000 = 0 (mod 50000) but iteration is i % VOTER_COUNT + 1
  // so voter id 1 owns indices i=0,50000,... → exactly 1 petition with 50k voters & 5k petitions.
  // Even so the worst case is the schedules JSON LIKE scan (no rows inserted here).
  const t0 = Date.now()
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/1/timeline',
    headers: bearer(adminToken),
  }))
  const dt = Date.now() - t0
  assert.equal(resp.statusCode, 200)
  assert.ok(Array.isArray(resp.body.data))
  assert.ok(dt < 100, `voter timeline took ${dt}ms (expected < 100ms)`)
  console.log(`[large-scale] voter timeline (50k voters / 5k petitions): ${dt}ms`)
})

test('petition list query stays under 1s with large dataset', async () => {
  const t0 = Date.now()
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/petitions?page=1&pageSize=20',
    headers: bearer(adminToken),
  }))
  const dt = Date.now() - t0
  assert.equal(resp.statusCode, 200)
  assert.equal(resp.body.total, PETITION_COUNT)
  assert.ok(dt < 1000, `petition list query took ${dt}ms`)
  console.log(`[large-scale] petition list 20/${PETITION_COUNT}: ${dt}ms`)
})

test('voter export rejects when result exceeds VOTER_EXPORT_LIMIT', async () => {
  // 全表匯出應超過上限（VOTER_EXPORT_LIMIT 設為 VOTER_COUNT/5 = 10000）
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/export',
    headers: bearer(adminToken),
  }))
  assert.equal(resp.statusCode, 413, '無篩選的全表匯出應被擋下')
  assert.match(String(resp.body.error), /超過單次匯出上限|縮小範圍/)
})

test('voter export within limit returns Excel buffer', async () => {
  // 只匯出某縣市，命中數應 < limit
  const resp = await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/export?city=臺北市',
    headers: bearer(adminToken),
  })
  // 臺北市約佔 1/5 = 10000 筆，正好等於 limit；要再加區域才會在以內
  // 改用 city + district 雙條件確保通過
  const resp2 = await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/export?city=臺北市&district=信義區',
    headers: bearer(adminToken),
  })
  assert.equal(resp2.statusCode, 200, 'city+district 過濾後應在 limit 內並回 Excel')
  assert.equal(
    String(resp2.headers['content-type']),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  // resp 可能 413 或 200 視 limit 邊界，至少不應 500
  assert.ok([200, 413].includes(resp.statusCode), `city only export status ${resp.statusCode}`)
})
