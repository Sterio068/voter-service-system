import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'fs'
import path from 'path'
import * as XLSX from '@e965/xlsx'
import { decryptSecretValue, isEncryptedSecret } from '../../server/utils/secrets'
import {
  bearer,
  createApiTestServer,
  loginAs,
  multipartPayload,
  multipartPayloadMulti,
  parseJsonResponse,
  type ApiTestContext,
} from '../helpers/apiTestServer'

let ctx: ApiTestContext
let adminToken = ''
let assistantToken = ''
let volunteerToken = ''

function seedAnonymizeFixture(prefix: string) {
  const referrerId = ctx.db.prepare(`
    INSERT INTO voters (name, mobile, created_by)
    VALUES (?, ?, 1)
  `).run(`${prefix} 介紹人`, `09${String(Date.now()).slice(-8)}`).lastInsertRowid as number

  const voterId = ctx.db.prepare(`
    INSERT INTO voters (
      name, gender, birth_date, id_number, mobile, phone, line_id, email,
      household_city, household_district, household_village, household_neighbor, household_address,
      mailing_address, occupation, company, job_title, election_area, note,
      source, referrer_id, addr_city, addr_district, addr_village, household_key, title, is_active, created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1)
  `).run(
    `${prefix} 選民`,
    '女',
    '1988-02-03',
    `A${String(Date.now()).slice(-9)}`,
    `09${String(Date.now() + 1).slice(-8)}`,
    '0223456789',
    `${prefix.toLowerCase()}-line`,
    `${prefix.toLowerCase()}@example.com`,
    '臺北市',
    '中正區',
    '幸福里',
    '8鄰',
    `${prefix} 戶籍地址`,
    `${prefix} 通訊地址`,
    '工程師',
    `${prefix} 公司`,
    '主任',
    '第一選區',
    `${prefix} 備註`,
    `${prefix} 來源`,
    referrerId,
    '臺北市',
    '中正區',
    '幸福里',
    `${prefix}-household-key`,
    `${prefix} 頭銜`,
  ).lastInsertRowid as number

  ctx.db.prepare('INSERT INTO voter_tags (voter_id, tag) VALUES (?, ?)').run(voterId, `${prefix} 標籤`)
  ctx.db.prepare('INSERT INTO voter_topics (voter_id, topic) VALUES (?, ?)').run(voterId, `${prefix} 議題`)
  ctx.db.prepare(`
    INSERT INTO voter_engagement (voter_id, support_level, activity_count, last_contact_date, notes)
    VALUES (?, 4, 3, '2026-04-20', ?)
  `).run(voterId, `${prefix} 參與度備註`)
  ctx.db.prepare(`
    INSERT INTO voter_relations (voter_id, related_voter_id, relation_type, note)
    VALUES (?, ?, 'family', ?)
  `).run(voterId, referrerId, `${prefix} 關係`)
  ctx.db.prepare(`
    INSERT INTO contact_records (voter_id, contact_date, contact_type, content, result, result_type, follow_up_date, created_by)
    VALUES (?, '2026-04-21', 'phone', ?, '已聯繫', 'follow_up', '2026-04-30', 1)
  `).run(voterId, `${prefix} 聯絡紀錄內容`)
  ctx.db.prepare(`
    INSERT INTO petitions (case_number, petition_date, voter_id, contact_phone, channel, category, content, created_by)
    VALUES (?, '2026-04-22', ?, '0911222333', '電話', '民政', ?, 1)
  `).run(`2026-${String(voterId).padStart(5, '0')}`, voterId, `${prefix} 陳情內容`)
  ctx.db.prepare(`
    INSERT INTO tasks (title, related_voter_id, created_by)
    VALUES (?, ?, 1)
  `).run(`${prefix} 待辦`, voterId)

  const surveyId = ctx.db.prepare(`INSERT INTO surveys (title, created_by) VALUES (?, 1)`).run(`${prefix} 問卷`).lastInsertRowid as number
  ctx.db.prepare(`
    INSERT INTO survey_responses (survey_id, voter_id, respondent_name, answers)
    VALUES (?, ?, ?, ?)
  `).run(surveyId, voterId, `${prefix} 受訪者`, JSON.stringify({ q1: 'yes' }))

  ctx.db.prepare(`
    INSERT INTO consultation_appointments (voter_id, voter_name, voter_phone, appointment_date, time_slot, issue_summary, created_by)
    VALUES (?, ?, '0988777666', '2026-04-23', '09:00', ?, 1)
  `).run(voterId, `${prefix} 諮詢人`, `${prefix} 諮詢摘要`)

  ctx.db.prepare(`
    INSERT INTO ceremony_records (voter_id, ceremony_type, recipient_name, recipient_relation, created_by)
    VALUES (?, 'other', ?, '親友', 1)
  `).run(voterId, `${prefix} 禮儀對象`)

  const groupId = ctx.db.prepare(`INSERT INTO groups (name, created_by) VALUES (?, 1)`).run(`${prefix} 團體`).lastInsertRowid as number
  ctx.db.prepare(`INSERT INTO group_members (group_id, voter_id, role) VALUES (?, ?, 'member')`).run(groupId, voterId)

  const eventId = ctx.db.prepare(`INSERT INTO events (title, event_date, created_by) VALUES (?, '2026-04-24', 1)`).run(`${prefix} 活動`).lastInsertRowid as number
  ctx.db.prepare(`INSERT INTO event_participants (event_id, voter_id, role) VALUES (?, ?, 'participant')`).run(eventId, voterId)

  const notificationId = ctx.db.prepare(`INSERT INTO notifications (title, content, created_by) VALUES (?, ?, 1)`).run(`${prefix} 通知`, '內容').lastInsertRowid as number
  ctx.db.prepare(`INSERT INTO notification_recipients (notification_id, voter_id, status) VALUES (?, ?, 'pending')`).run(notificationId, voterId)

  ctx.db.prepare(`
    INSERT INTO voter_activity_history (voter_id, activity_score, snapshot_date)
    VALUES (?, 88, '2026-04-01')
  `).run(voterId)

  return {
    voterId,
    referrerId,
  }
}

test.before(async () => {
  ctx = await createApiTestServer()
  adminToken = (await loginAs(ctx.app, 'admin', 'admin123')).token

  const createVolunteer = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: bearer(adminToken),
    payload: {
      username: 'volunteer_api_test',
      password: 'volunteer123',
      name: '測試志工',
      role: 'volunteer',
    },
  }))
  assert.equal(createVolunteer.statusCode, 201)
  volunteerToken = (await loginAs(ctx.app, 'volunteer_api_test', 'volunteer123')).token

  const createAssistant = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/users',
    headers: bearer(adminToken),
    payload: {
      username: 'assistant_api_test',
      password: 'assistant123',
      name: '測試助理',
      role: 'assistant',
    },
  }))
  assert.equal(createAssistant.statusCode, 201)
  assistantToken = (await loginAs(ctx.app, 'assistant_api_test', 'assistant123')).token
})

test.after(async () => {
  if (ctx) {
    await ctx.close()
  }
})

test('auth endpoints require a token and return the current user without password', async () => {
  const unauthorized = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/auth/me',
  }))
  assert.equal(unauthorized.statusCode, 401)

  const me = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: bearer(adminToken),
  }))
  assert.equal(me.statusCode, 200)
  assert.equal(me.body.success, true)
  assert.equal(me.body.data.username, 'admin')
  assert.equal(me.body.data.password, undefined)
})

test('fresh install seeds first-run and baseline settings defaults', async () => {
  const seededRows = ctx.db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN ('backup_path', 'first_run', 'office_name', 'idle_timeout', 'login_lock_attempts')
    ORDER BY key
  `).all() as Array<{ key: string; value: string }>

  assert.deepEqual(
    Object.fromEntries(seededRows.map((row) => [row.key, row.value])),
    {
      backup_path: ctx.backupsPath,
      first_run: 'true',
      idle_timeout: '30',
      login_lock_attempts: '5',
      office_name: '服務處',
    },
  )

  const settings = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
  }))
  assert.equal(settings.statusCode, 200)
  assert.equal(settings.body.data.first_run, 'true')
  assert.equal(settings.body.data.office_name, '服務處')
  assert.equal(settings.body.data.idle_timeout, '30')
})

test('first_run cannot be cleared until the default admin password has been changed', async () => {
  const blocked = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
    payload: { first_run: 'false' },
  }))
  assert.equal(blocked.statusCode, 400)
  assert.match(blocked.body.error, /請先完成首次管理員密碼修改/)

  const passwordChanged = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/users/1/password',
    headers: bearer(adminToken),
    payload: {
      password: 'Admin12345!',
      confirm_self_password: 'admin123',
    },
  }))
  assert.equal(passwordChanged.statusCode, 200)

  const rotatedAdminToken = (await loginAs(ctx.app, 'admin', 'Admin12345!')).token
  const allowed = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(rotatedAdminToken),
    payload: { first_run: 'false' },
  }))
  assert.equal(allowed.statusCode, 200)

  const restoreFirstRun = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(rotatedAdminToken),
    payload: { first_run: 'true' },
  }))
  assert.equal(restoreFirstRun.statusCode, 200)

  const passwordRestored = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/users/1/password',
    headers: bearer(rotatedAdminToken),
    payload: {
      password: 'admin123',
      confirm_self_password: 'Admin12345!',
    },
  }))
  assert.equal(passwordRestored.statusCode, 200)
})

test('role permissions allow volunteer reads but reject voter writes', async () => {
  const read = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters',
    headers: bearer(volunteerToken),
  }))
  assert.equal(read.statusCode, 200)
  assert.equal(read.body.success, true)

  const write = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(volunteerToken),
    payload: { name: '志工不可新增', mobile: '0911111111' },
  }))
  assert.equal(write.statusCode, 403)
})

test('admin account safeguards block self-disable and self-delete operations', async () => {
  const adminUser = ctx.db.prepare("SELECT id FROM users WHERE username='admin'").get() as { id: number }

  const disableSelf = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/admin/users/${adminUser.id}/disable`,
    headers: bearer(adminToken),
    payload: {},
  }))
  assert.equal(disableSelf.statusCode, 400)
  assert.match(disableSelf.body.error, /不可停用或刪除自己的帳號/)

  const deleteSelf = parseJsonResponse(await ctx.app.inject({
    method: 'DELETE',
    url: `/api/admin/users/${adminUser.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(deleteSelf.statusCode, 400)
  assert.match(deleteSelf.body.error, /不可停用或刪除自己的帳號/)
})

test('client error ingestion requires authentication and records the current user when present', async () => {
  const anonymous = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/client-errors',
    payload: {
      message: '匿名錯誤',
      source: 'window.onerror',
    },
  }))
  assert.equal(anonymous.statusCode, 401)

  const authenticated = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/client-errors',
    headers: bearer(adminToken),
    payload: {
      message: '登入後錯誤',
      source: 'ErrorBoundary',
      url: '/dashboard',
    },
  }))
  assert.equal(authenticated.statusCode, 200)

  const saved = ctx.db.prepare(`
    SELECT message, source, url, user_id
    FROM client_errors
    WHERE message='登入後錯誤'
    ORDER BY id DESC
    LIMIT 1
  `).get() as any
  assert.equal(saved.source, 'ErrorBoundary')
  assert.equal(saved.url, '/dashboard')
  assert.equal(saved.user_id, 1)
})

test('ceremony, expense, and import template routes enforce module permissions', async () => {
  const createdCeremony = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/ceremonies',
    headers: bearer(adminToken),
    payload: {
      ceremony_type: 'other',
      recipient_name: '權限測試禮儀',
      event_date: '2026-04-24',
      items: [],
    },
  }))
  assert.equal(createdCeremony.statusCode, 201)

  const assistantCeremonyList = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/ceremonies',
    headers: bearer(assistantToken),
  }))
  assert.equal(assistantCeremonyList.statusCode, 200)
  assert.equal(assistantCeremonyList.body.success, true)

  const assistantCeremonyUpdate = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/ceremonies/${createdCeremony.body.id}`,
    headers: bearer(assistantToken),
    payload: {
      ceremony_type: 'other',
      recipient_name: '助理不可修改禮儀',
      items: [],
    },
  }))
  assert.equal(assistantCeremonyUpdate.statusCode, 403)

  const assistantExpenseSummary = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/expenses/summary',
    headers: bearer(assistantToken),
  }))
  assert.equal(assistantExpenseSummary.statusCode, 200)

  const assistantBudgetWrite = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/expenses/budgets',
    headers: bearer(assistantToken),
    payload: { year: 2026, amount: 20000 },
  }))
  assert.equal(assistantBudgetWrite.statusCode, 403)

  const volunteerExpenseSummary = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/expenses/summary',
    headers: bearer(volunteerToken),
  }))
  assert.equal(volunteerExpenseSummary.statusCode, 403)

  const voterTemplateForAssistant = await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/import/template',
    headers: bearer(assistantToken),
  })
  assert.equal(voterTemplateForAssistant.statusCode, 200)

  const petitionTemplateForAssistant = await ctx.app.inject({
    method: 'GET',
    url: '/api/petitions/import/template',
    headers: bearer(assistantToken),
  })
  assert.equal(petitionTemplateForAssistant.statusCode, 200)

  const groupTemplateForAssistant = await ctx.app.inject({
    method: 'GET',
    url: '/api/groups/import/template',
    headers: bearer(assistantToken),
  })
  assert.equal(groupTemplateForAssistant.statusCode, 200)

  const voterTemplateForVolunteer = await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/import/template',
    headers: bearer(volunteerToken),
  })
  assert.equal(voterTemplateForVolunteer.statusCode, 403)

  const petitionTemplateForVolunteer = await ctx.app.inject({
    method: 'GET',
    url: '/api/petitions/import/template',
    headers: bearer(volunteerToken),
  })
  assert.equal(petitionTemplateForVolunteer.statusCode, 403)

  const groupTemplateForVolunteer = await ctx.app.inject({
    method: 'GET',
    url: '/api/groups/import/template',
    headers: bearer(volunteerToken),
  })
  assert.equal(groupTemplateForVolunteer.statusCode, 403)
})

test('voter lifecycle validates input, writes audit logs, and excludes soft-deleted records by default', async () => {
  const invalid = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: { name: '格式錯誤', mobile: '12345' },
  }))
  assert.equal(invalid.statusCode, 400)
  assert.match(invalid.body.error, /手機格式/)

  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '測試選民',
      mobile: '0912345678',
      household_city: '臺北市',
      household_district: '中正區',
      tags: ['支持者', '志工'],
    },
  }))
  assert.equal(created.statusCode, 201)
  const voterId = created.body.data.id

  const detail = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/voters/${voterId}`,
    headers: bearer(adminToken),
  }))
  assert.equal(detail.statusCode, 200)
  assert.deepEqual(detail.body.data.tags.sort(), ['志工', '支持者'])

  const deleted = parseJsonResponse(await ctx.app.inject({
    method: 'DELETE',
    url: `/api/voters/${voterId}`,
    headers: bearer(adminToken),
  }))
  assert.equal(deleted.statusCode, 200)

  const listDefault = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?pageSize=50',
    headers: bearer(adminToken),
  }))
  assert.equal(listDefault.statusCode, 200)
  assert.equal(listDefault.body.data.some((voter: any) => voter.id === voterId), false)

  const listInactive = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?is_active=0&pageSize=50',
    headers: bearer(adminToken),
  }))
  assert.equal(listInactive.statusCode, 200)
  assert.equal(listInactive.body.data.some((voter: any) => voter.id === voterId), true)

  const auditCount = (ctx.db.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
    WHERE target_type='voter' AND target_id=? AND action IN ('create','delete')
  `).get(voterId) as any).count
  assert.equal(auditCount, 2)
})

test('voter anonymize clears extended PII and linked voter tables, while full mode also scrubs history snapshots', async () => {
  const anonymizeFixture = seedAnonymizeFixture('匿名化')
  const anonymizeResponse = parseJsonResponse(await ctx.app.inject({
    method: 'DELETE',
    url: `/api/voters/${anonymizeFixture.voterId}/anonymize?mode=anonymize`,
    headers: bearer(adminToken),
  }))
  assert.equal(anonymizeResponse.statusCode, 200)

  const anonymizedVoter = ctx.db.prepare('SELECT * FROM voters WHERE id=?').get(anonymizeFixture.voterId) as any
  assert.equal(anonymizedVoter.name, `已匿名選民 #${anonymizeFixture.voterId}`)
  assert.equal(anonymizedVoter.gender, null)
  assert.equal(anonymizedVoter.phone, null)
  assert.equal(anonymizedVoter.line_id, null)
  assert.equal(anonymizedVoter.occupation, null)
  assert.equal(anonymizedVoter.company, null)
  assert.equal(anonymizedVoter.note, null)
  assert.equal(anonymizedVoter.household_city, null)
  assert.equal(anonymizedVoter.household_district, null)
  assert.equal(anonymizedVoter.household_village, null)
  assert.equal(anonymizedVoter.household_address, null)
  assert.equal(anonymizedVoter.source, null)
  assert.equal(anonymizedVoter.referrer_id, null)
  assert.equal(anonymizedVoter.addr_city, null)
  assert.equal(anonymizedVoter.addr_district, null)
  assert.equal(anonymizedVoter.addr_village, null)

  const anonymizedTagCount = (ctx.db.prepare('SELECT COUNT(*) AS count FROM voter_tags WHERE voter_id=?').get(anonymizeFixture.voterId) as any).count
  const anonymizedTopicCount = (ctx.db.prepare('SELECT COUNT(*) AS count FROM voter_topics WHERE voter_id=?').get(anonymizeFixture.voterId) as any).count
  const anonymizedEngagementCount = (ctx.db.prepare('SELECT COUNT(*) AS count FROM voter_engagement WHERE voter_id=?').get(anonymizeFixture.voterId) as any).count
  const anonymizedRelationCount = (ctx.db.prepare('SELECT COUNT(*) AS count FROM voter_relations WHERE voter_id=? OR related_voter_id=?').get(anonymizeFixture.voterId, anonymizeFixture.voterId) as any).count
  assert.equal(anonymizedTagCount, 0)
  assert.equal(anonymizedTopicCount, 0)
  assert.equal(anonymizedEngagementCount, 0)
  assert.equal(anonymizedRelationCount, 0)

  const anonymizedContact = ctx.db.prepare('SELECT voter_id, content FROM contact_records WHERE content=?').get('匿名化 聯絡紀錄內容') as any
  const anonymizedPetition = ctx.db.prepare('SELECT voter_id, contact_phone FROM petitions WHERE content=?').get('匿名化 陳情內容') as any
  const anonymizedConsultation = ctx.db.prepare('SELECT voter_id, voter_name, voter_phone FROM consultation_appointments WHERE issue_summary=?').get('匿名化 諮詢摘要') as any
  const anonymizedSurvey = ctx.db.prepare('SELECT voter_id, respondent_name FROM survey_responses WHERE respondent_name=?').get('匿名化 受訪者') as any
  assert.equal(anonymizedContact.voter_id, null)
  assert.equal(anonymizedContact.content, '匿名化 聯絡紀錄內容')
  assert.equal(anonymizedPetition.voter_id, null)
  assert.equal(anonymizedPetition.contact_phone, '0911222333')
  assert.equal(anonymizedConsultation.voter_id, null)
  assert.equal(anonymizedConsultation.voter_name, '匿名化 諮詢人')
  assert.equal(anonymizedConsultation.voter_phone, '0988777666')
  assert.equal(anonymizedSurvey.voter_id, null)
  assert.equal(anonymizedSurvey.respondent_name, '匿名化 受訪者')

  const fullFixture = seedAnonymizeFixture('完整刪除')
  const fullResponse = parseJsonResponse(await ctx.app.inject({
    method: 'DELETE',
    url: `/api/voters/${fullFixture.voterId}/anonymize?mode=full`,
    headers: bearer(adminToken),
  }))
  assert.equal(fullResponse.statusCode, 200)

  const fullContact = ctx.db.prepare(`
    SELECT voter_id, content, result, result_type, follow_up_date
    FROM contact_records
    WHERE content=?
  `).get(`已匿名化聯絡紀錄（原選民 #${fullFixture.voterId}）`) as any
  const fullPetition = ctx.db.prepare('SELECT voter_id, contact_phone FROM petitions WHERE content=?').get('完整刪除 陳情內容') as any
  const fullConsultation = ctx.db.prepare('SELECT voter_id, voter_name, voter_phone FROM consultation_appointments WHERE issue_summary=?').get('完整刪除 諮詢摘要') as any
  const fullSurvey = ctx.db.prepare('SELECT voter_id, respondent_name FROM survey_responses WHERE survey_id IN (SELECT id FROM surveys WHERE title=?)').get('完整刪除 問卷') as any
  const fullCeremony = ctx.db.prepare('SELECT voter_id, recipient_name, recipient_relation FROM ceremony_records WHERE recipient_name=?').get(`已匿名選民 #${fullFixture.voterId}`) as any

  assert.equal(fullContact.voter_id, null)
  assert.equal(fullContact.result, null)
  assert.equal(fullContact.result_type, null)
  assert.equal(fullContact.follow_up_date, null)
  assert.equal(fullPetition.voter_id, null)
  assert.equal(fullPetition.contact_phone, null)
  assert.equal(fullConsultation.voter_id, null)
  assert.equal(fullConsultation.voter_name, `已匿名選民 #${fullFixture.voterId}`)
  assert.equal(fullConsultation.voter_phone, null)
  assert.equal(fullSurvey.voter_id, null)
  assert.equal(fullSurvey.respondent_name, `已匿名選民 #${fullFixture.voterId}`)
  assert.equal(fullCeremony.voter_id, null)
  assert.equal(fullCeremony.recipient_name, `已匿名選民 #${fullFixture.voterId}`)
  assert.equal(fullCeremony.recipient_relation, null)
})

test('voter list supports exact mobile and id_number filters for duplicate checks', async () => {
  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '精準比對選民',
      mobile: '0999123456',
      id_number: 'A123456789',
    },
  }))
  assert.equal(created.statusCode, 201)
  const voterId = created.body.data.id

  const byMobile = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?mobile=0999123456&pageSize=5',
    headers: bearer(adminToken),
  }))
  assert.equal(byMobile.statusCode, 200)
  assert.equal(byMobile.body.total, 1)
  assert.equal(byMobile.body.data[0].id, voterId)

  const byIdNumber = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters?id_number=a123456789&pageSize=5',
    headers: bearer(adminToken),
  }))
  assert.equal(byIdNumber.statusCode, 200)
  assert.equal(byIdNumber.body.total, 1)
  assert.equal(byIdNumber.body.data[0].id, voterId)
})

test('voter merge transfers activity history, merges engagement fields, and survives duplicate memberships', async () => {
  const target = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '合併目標選民',
      mobile: '0999000001',
    },
  }))
  assert.equal(target.statusCode, 201)

  const source = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '合併來源選民',
      mobile: '0999000002',
    },
  }))
  assert.equal(source.statusCode, 201)

  const targetId = target.body.data.id
  const sourceId = source.body.data.id

  ctx.db.prepare(`
    INSERT INTO voter_engagement (voter_id, support_level, is_key_supporter, is_volunteer, activity_count, last_contact_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(targetId, 2, 0, 1, 3, '2026-04-01', 'target note')
  ctx.db.prepare(`
    INSERT INTO voter_engagement (voter_id, support_level, is_key_supporter, is_volunteer, activity_count, last_contact_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sourceId, 5, 1, 0, 4, '2026-04-18', 'source note')
  ctx.db.prepare('INSERT INTO voter_activity_history (voter_id, activity_score, snapshot_date) VALUES (?, ?, ?)').run(sourceId, 88, '2026-04-20')

  ctx.db.prepare(`
    INSERT INTO petitions (case_number, petition_date, voter_id, content, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(`MERGE-${Date.now()}`, '2026-04-24', sourceId, 'merge test petition', 1)
  ctx.db.prepare(`
    INSERT INTO contact_records (voter_id, contact_date, content, created_by)
    VALUES (?, ?, ?, ?)
  `).run(sourceId, '2026-04-24', 'merge test contact', 1)
  ctx.db.prepare('INSERT INTO tasks (title, related_voter_id) VALUES (?, ?)').run('merge test task', sourceId)

  const groupId = ctx.db.prepare('INSERT INTO groups (name) VALUES (?)').run('Merge 測試團體').lastInsertRowid as number
  ctx.db.prepare('INSERT INTO group_members (group_id, voter_id, role) VALUES (?, ?, ?)').run(groupId, targetId, 'target-role')
  ctx.db.prepare('INSERT INTO group_members (group_id, voter_id, role) VALUES (?, ?, ?)').run(groupId, sourceId, 'source-role')

  const eventId = ctx.db.prepare('INSERT INTO events (title, event_date) VALUES (?, ?)').run('Merge 測試活動', '2026-04-24').lastInsertRowid as number
  ctx.db.prepare('INSERT INTO event_participants (event_id, voter_id, role, attendance, note) VALUES (?, ?, ?, ?, ?)').run(eventId, targetId, 'participant', 0, 'target participant note')
  ctx.db.prepare('INSERT INTO event_participants (event_id, voter_id, role, attendance, note) VALUES (?, ?, ?, ?, ?)').run(eventId, sourceId, 'speaker', 1, 'source participant note')

  const preview = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/voters/${targetId}/merge?preview=true`,
    headers: bearer(adminToken),
    payload: { merge_from_id: sourceId },
  }))
  assert.equal(preview.statusCode, 200)
  assert.equal(preview.body.preview.petitions, 1)
  assert.equal(preview.body.preview.contacts, 1)
  assert.equal(preview.body.preview.tasks, 1)
  assert.equal(preview.body.preview.engagements, 1)
  assert.equal(preview.body.preview.activity_history, 1)
  assert.equal(preview.body.preview.event_participants, 1)
  assert.equal(preview.body.preview.group_members, 1)

  const merged = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/voters/${targetId}/merge`,
    headers: bearer(adminToken),
    payload: { merge_from_id: sourceId },
  }))
  assert.equal(merged.statusCode, 200)
  assert.equal(merged.body.transferred.activity_history, 1)
  assert.equal(merged.body.transferred.event_participants, 1)
  assert.equal(merged.body.transferred.group_members, 1)

  const sourceVoter = ctx.db.prepare('SELECT is_active, note FROM voters WHERE id=?').get(sourceId) as any
  assert.equal(sourceVoter.is_active, 0)
  assert.match(sourceVoter.note, /已合併至選民ID/)

  const petitionOwner = (ctx.db.prepare("SELECT voter_id FROM petitions WHERE content='merge test petition'").get() as any).voter_id
  assert.equal(petitionOwner, targetId)
  const contactOwner = (ctx.db.prepare("SELECT voter_id FROM contact_records WHERE content='merge test contact'").get() as any).voter_id
  assert.equal(contactOwner, targetId)
  const taskOwner = (ctx.db.prepare("SELECT related_voter_id FROM tasks WHERE title='merge test task'").get() as any).related_voter_id
  assert.equal(taskOwner, targetId)
  const historyOwner = (ctx.db.prepare('SELECT voter_id FROM voter_activity_history WHERE snapshot_date=?').get('2026-04-20') as any).voter_id
  assert.equal(historyOwner, targetId)

  const engagement = ctx.db.prepare('SELECT * FROM voter_engagement WHERE voter_id=?').get(targetId) as any
  assert.equal(engagement.support_level, 5)
  assert.equal(engagement.is_key_supporter, 1)
  assert.equal(engagement.is_volunteer, 1)
  assert.equal(engagement.activity_count, 7)
  assert.equal(engagement.last_contact_date, '2026-04-18')
  assert.match(engagement.notes, /target note/)
  assert.match(engagement.notes, /source note/)
  const sourceEngagementCount = (ctx.db.prepare('SELECT COUNT(*) AS count FROM voter_engagement WHERE voter_id=?').get(sourceId) as any).count
  assert.equal(sourceEngagementCount, 0)

  const groupMembers = ctx.db.prepare('SELECT voter_id, role FROM group_members WHERE group_id=?').all(groupId) as any[]
  assert.equal(groupMembers.length, 1)
  assert.equal(groupMembers[0].voter_id, targetId)
  assert.equal(groupMembers[0].role, 'target-role')

  const eventParticipants = ctx.db.prepare('SELECT voter_id, role, attendance, note FROM event_participants WHERE event_id=?').all(eventId) as any[]
  assert.equal(eventParticipants.length, 1)
  assert.equal(eventParticipants[0].voter_id, targetId)
  assert.equal(eventParticipants[0].role, 'speaker')
  assert.equal(eventParticipants[0].attendance, 1)
  assert.match(eventParticipants[0].note, /target participant note/)
  assert.match(eventParticipants[0].note, /source participant note/)

  const mergeHistory = ctx.db.prepare(`
    SELECT affected_records
    FROM voter_merge_history
    WHERE old_voter_id=? AND new_voter_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(sourceId, targetId) as any
  assert.ok(mergeHistory)
  const affectedRecords = JSON.parse(mergeHistory.affected_records)
  assert.equal(affectedRecords.activity_history, 1)
  assert.equal(affectedRecords.merged_duplicate_event_participants, 1)
  assert.equal(affectedRecords.merged_duplicate_group_members, 1)
})

test('tasks list accepts comma-separated status filters for open queues', async () => {
  const stamp = Date.now()

  const pendingTask = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: bearer(adminToken),
    payload: {
      title: `待辦待處理 ${stamp}`,
      priority: 'normal',
    },
  }))
  assert.equal(pendingTask.statusCode, 201)

  const inProgressTask = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: bearer(adminToken),
    payload: {
      title: `待辦進行中 ${stamp}`,
      priority: 'high',
    },
  }))
  assert.equal(inProgressTask.statusCode, 201)

  const markInProgress = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/tasks/${inProgressTask.body.data.id}`,
    headers: bearer(adminToken),
    payload: { status: 'in_progress' },
  }))
  assert.equal(markInProgress.statusCode, 200)

  const doneTask = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: bearer(adminToken),
    payload: {
      title: `待辦已完成 ${stamp}`,
      priority: 'low',
    },
  }))
  assert.equal(doneTask.statusCode, 201)

  const markDone = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/tasks/${doneTask.body.data.id}`,
    headers: bearer(adminToken),
    payload: { status: 'done' },
  }))
  assert.equal(markDone.statusCode, 200)

  const filtered = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/tasks?status=pending,in_progress&pageSize=100',
    headers: bearer(adminToken),
  }))
  assert.equal(filtered.statusCode, 200)

  const filteredIds = new Set(filtered.body.data.map((task: any) => task.id))
  assert.equal(filteredIds.has(pendingTask.body.data.id), true)
  assert.equal(filteredIds.has(inProgressTask.body.data.id), true)
  assert.equal(filteredIds.has(doneTask.body.data.id), false)
})

test('backup API creates signed metadata and verify reports trusted backups', async () => {
  const backup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  assert.equal(backup.statusCode, 200)
  assert.equal(backup.body.success, true)
  assert.equal(backup.body.data.signed, true)

  const backupName = backup.body.data.name
  const backupPath = path.join(ctx.backupsPath, backupName)
  const metadataPath = `${backupPath}.meta.json`
  assert.equal(existsSync(backupPath), true)
  assert.equal(existsSync(metadataPath), true)

  const list = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/backup/list',
    headers: bearer(adminToken),
  }))
  assert.equal(list.statusCode, 200)
  const listed = list.body.data.find((item: any) => item.name === backupName)
  assert.equal(listed.signed, true)
  assert.equal(typeof listed.sha256, 'string')

  const verify = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/backup/verify/${encodeURIComponent(backupName)}`,
    headers: bearer(adminToken),
  }))
  assert.equal(verify.statusCode, 200)
  assert.equal(verify.body.data.backup_file_ok, true)
  assert.equal(verify.body.data.signature_ok, true)
  assert.equal(verify.body.data.trust_level, 'signed')
})

test('restore accepts a valid system backup with HMAC sidecar and writes a pending restore marker', async () => {
  const backup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  assert.equal(backup.statusCode, 200)

  const backupName = backup.body.data.name
  const backupPath = path.join(ctx.backupsPath, backupName)
  const sidecarPath = `${backupPath}.meta.json`
  assert.equal(existsSync(sidecarPath), true, 'backup metadata sidecar should exist')

  const upload = multipartPayloadMulti([
    { fieldName: 'backup', filename: backupName, contentType: 'application/octet-stream', content: readFileSync(backupPath) },
    { fieldName: 'metadata', filename: `${backupName}.meta.json`, contentType: 'application/json', content: readFileSync(sidecarPath) },
  ])

  const restore = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': upload.contentType },
    payload: upload.payload,
  }))
  assert.equal(restore.statusCode, 200)
  assert.equal(restore.body.success, true)
  assert.equal(restore.body.data.signature_status, 'signed')
  assert.equal(restore.body.data.restoreFile, 'voter-service.db.restore')
  assert.equal(existsSync(path.join(ctx.dataPath, 'voter-service.db.restore')), true)
  assert.match(restore.body.data.currentBackup, /^pre-restore-voter-service-/)
  assert.equal(existsSync(path.join(ctx.backupsPath, `${restore.body.data.currentBackup}.meta.json`)), true)

  // 清掉 marker，避免污染後續 test
  rmSync(path.join(ctx.dataPath, 'voter-service.db.restore'), { force: true })
})

test('restore rejects an unsigned backup unless force_unsigned is set', async () => {
  const backup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  const backupName = backup.body.data.name
  const backupPath = path.join(ctx.backupsPath, backupName)

  // 沒帶 sidecar、沒帶 force → 應 400
  const noSidecar = multipartPayload({
    fieldName: 'backup',
    filename: backupName,
    contentType: 'application/octet-stream',
    content: readFileSync(backupPath),
  })
  const rejected = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': noSidecar.contentType },
    payload: noSidecar.payload,
  }))
  assert.equal(rejected.statusCode, 400)
  assert.match(String(rejected.body.error), /缺少 .meta.json|未簽章|sidecar/)

  // 帶 force_unsigned=1 → 應通過並標示 unsigned_legacy
  const forced = multipartPayload(
    { fieldName: 'backup', filename: backupName, contentType: 'application/octet-stream', content: readFileSync(backupPath) },
    { force_unsigned: '1' },
  )
  const forcedResp = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': forced.contentType },
    payload: forced.payload,
  }))
  assert.equal(forcedResp.statusCode, 200)
  assert.equal(forcedResp.body.data.signature_status, 'unsigned_legacy')
  rmSync(path.join(ctx.dataPath, 'voter-service.db.restore'), { force: true })
})

test('restore rejects a backup whose sidecar signature does not match the .db', async () => {
  const backup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  const backupName = backup.body.data.name
  const backupPath = path.join(ctx.backupsPath, backupName)
  const sidecarPath = `${backupPath}.meta.json`

  // 取得正確 sidecar 但偽造備份內容（同名 .db 但內容是另一個 SQLite）
  const otherBackup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  const otherBackupPath = path.join(ctx.backupsPath, otherBackup.body.data.name)

  const tampered = multipartPayloadMulti([
    { fieldName: 'backup', filename: backupName, contentType: 'application/octet-stream', content: readFileSync(otherBackupPath) },
    { fieldName: 'metadata', filename: `${backupName}.meta.json`, contentType: 'application/json', content: readFileSync(sidecarPath) },
  ])

  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': tampered.contentType },
    payload: tampered.payload,
  }))
  assert.equal(resp.statusCode, 400)
  assert.match(String(resp.body.error), /簽章|signature|sha256|size/i)
})

test('voter export masks sensitive fields by default', async () => {
  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '匯出遮罩測試',
      birth_date: '1980-05-15',
      id_number: 'B223456789',
      mobile: '0922345678',
      phone: '02-23456789',
      line_id: 'line-user',
      email: 'person@example.com',
      household_city: '臺北市',
      household_district: '信義區',
      household_address: '信義路5段1號',
      mailing_address: '台北市信義區信義路5段1號',
    },
  }))
  assert.equal(created.statusCode, 201)

  const exported = await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/export',
    headers: bearer(adminToken),
  })
  assert.equal(exported.statusCode, 200)

  const workbook = XLSX.read((exported as any).rawPayload, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['選民資料'], { header: 1 }) as any[][]
  const headers = rows[0]
  const row = rows.find(item => item[headers.indexOf('姓名*')] === '匯出遮罩測試')
  assert.ok(row)

  assert.equal(row[headers.indexOf('出生日期(YYYY-MM-DD)')], '1980-**-**')
  assert.equal(row[headers.indexOf('身份證號')], 'B******789')
  assert.equal(row[headers.indexOf('手機')], '0922***678')
  assert.equal(row[headers.indexOf('市話')], '02-*****789')
  assert.equal(row[headers.indexOf('LINE ID')], 'l********')
  assert.equal(row[headers.indexOf('電子郵件')], 'p*****@example.com')
  assert.equal(row[headers.indexOf('戶籍地址')], '***')
  assert.equal(row[headers.indexOf('通訊地址')], '***')
})

test('full sensitive voter export requires an admin reason and preserves raw values', async () => {
  const missingReason = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/voters/export?include_sensitive=1',
    headers: bearer(adminToken),
  }))
  assert.equal(missingReason.statusCode, 400)
  assert.match(missingReason.body.error, /匯出理由/)

  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '完整匯出測試',
      birth_date: '1975-01-20',
      id_number: 'C123456789',
      mobile: '0932345678',
      email: 'full@example.com',
      household_address: '完整路1號',
    },
  }))
  assert.equal(created.statusCode, 201)

  const exported = await ctx.app.inject({
    method: 'GET',
    url: `/api/voters/export?include_sensitive=1&reason=${encodeURIComponent('主管核准完整匯出')}`,
    headers: bearer(adminToken),
  })
  assert.equal(exported.statusCode, 200)

  const workbook = XLSX.read((exported as any).rawPayload, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['選民資料'], { header: 1 }) as any[][]
  const headers = rows[0]
  const row = rows.find(item => item[headers.indexOf('姓名*')] === '完整匯出測試')
  assert.ok(row)

  assert.equal(row[headers.indexOf('出生日期(YYYY-MM-DD)')], '1975-01-20')
  assert.equal(row[headers.indexOf('身份證號')], 'C123456789')
  assert.equal(row[headers.indexOf('手機')], '0932345678')
  assert.equal(row[headers.indexOf('電子郵件')], 'full@example.com')
  assert.equal(row[headers.indexOf('戶籍地址')], '完整路1號')
})

test('petition lifecycle creates case numbers, logs, updates status, and audits changes', async () => {
  const volunteerCreate = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/petitions',
    headers: bearer(volunteerToken),
    payload: {
      petition_date: '2026-04-24',
      contact_name: '志工不可新增陳情',
      contact_phone: '0940000000',
      content: '志工權限測試',
    },
  }))
  assert.equal(volunteerCreate.statusCode, 403)

  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/petitions',
    headers: bearer(adminToken),
    payload: {
      petition_date: '2026-04-24',
      contact_name: '陳情測試選民',
      contact_phone: '0941234567',
      channel: 'phone',
      category: '道路交通',
      urgency: 'urgent',
      content: '路燈故障請協助處理',
      area_city: '臺北市',
      area_district: '信義區',
      assignee_id: 1,
    },
  }))
  assert.equal(created.statusCode, 201)
  assert.match(created.body.data.case_number, /^2026-\d{5}$/)
  assert.equal(typeof created.body.data.voter_id, 'number')

  const createdWithExistingVoter = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/petitions',
    headers: bearer(adminToken),
    payload: {
      petition_date: '2026-04-24',
      voter_id: created.body.data.voter_id,
      category: '道路交通',
      content: '同一位選民的第二筆陳情案件',
    },
  }))
  assert.equal(createdWithExistingVoter.statusCode, 201)

  const firstSequence = Number(created.body.data.case_number.split('-')[1])
  const secondSequence = Number(createdWithExistingVoter.body.data.case_number.split('-')[1])
  assert.equal(secondSequence, firstSequence + 1)

  const detail = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/petitions/${created.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.body.data.logs.length, 1)
  assert.equal(detail.body.data.logs[0].action_type, '受理')

  const secondDetail = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/petitions/${createdWithExistingVoter.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(secondDetail.statusCode, 200)
  assert.equal(secondDetail.body.data.contact_phone, '0941234567')

  const updated = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/petitions/${created.body.data.id}`,
    headers: bearer(adminToken),
    payload: { status: 'processing', due_date: '2026-05-01' },
  }))
  assert.equal(updated.statusCode, 200)

  const log = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/petitions/${created.body.data.id}/logs`,
    headers: bearer(adminToken),
    payload: { action_type: '追蹤', content: '已通知權責單位' },
  }))
  assert.equal(log.statusCode, 201)

  const after = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/petitions/${created.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(after.body.data.status, 'processing')
  assert.equal(after.body.data.logs.length, 2)

  const auditCount = (ctx.db.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
    WHERE target_type='petition' AND target_id=? AND action IN ('create','update')
  `).get(created.body.data.id) as any).count
  assert.equal(auditCount, 2)
})

test('document numbers increase sequentially per type', async () => {
  const firstOutgoing = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: bearer(adminToken),
    payload: {
      doc_type: 'outgoing',
      doc_date: '2026-04-24',
      subject: '第一份發文測試',
    },
  }))
  assert.equal(firstOutgoing.statusCode, 201)

  const secondOutgoing = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: bearer(adminToken),
    payload: {
      doc_type: 'outgoing',
      doc_date: '2026-04-24',
      subject: '第二份發文測試',
    },
  }))
  assert.equal(secondOutgoing.statusCode, 201)

  const incoming = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: bearer(adminToken),
    payload: {
      doc_type: 'incoming',
      doc_date: '2026-04-24',
      subject: '第一份收文測試',
    },
  }))
  assert.equal(incoming.statusCode, 201)

  const firstOutgoingSequence = Number(firstOutgoing.body.data.doc_number.split('-')[2])
  const secondOutgoingSequence = Number(secondOutgoing.body.data.doc_number.split('-')[2])
  const firstIncomingSequence = Number(incoming.body.data.doc_number.split('-')[2])

  const incomingDetail = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/documents/${incoming.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(incomingDetail.statusCode, 200)
  assert.equal(incomingDetail.body.data.status, 'pending')

  assert.equal(secondOutgoingSequence, firstOutgoingSequence + 1)
  assert.equal(firstIncomingSequence, 1)
})

test('petition Excel import maps urgency and export includes imported petitions', async () => {
  const voter = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: { name: '陳情匯入選民', mobile: '0972345678' },
  }))
  assert.equal(voter.statusCode, 201)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['陳情日期', '陳情人姓名', '聯絡電話', '陳情方式', '陳情類別', '急迫程度', '陳情內容', '區域縣市', '區域鄉鎮市區', '區域村里', '詳細地址'],
    ['2026-04-25', '陳情匯入選民', '0972345678', '電話', '道路交通', '急件', '匯入的路平案件', '臺北市', '大安區', '測試里', '測試路1號'],
  ]), '陳情資料')
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const upload = multipartPayload({
    filename: 'petitions.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: excelBuffer,
  })
  const imported = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/petitions/import',
    headers: { ...bearer(adminToken), 'content-type': upload.contentType },
    payload: upload.payload,
  }))
  assert.equal(imported.statusCode, 200)
  assert.equal(imported.body.imported, 1)

  const importedPetition = ctx.db.prepare("SELECT * FROM petitions WHERE content='匯入的路平案件'").get() as any
  assert.equal(importedPetition.voter_id, voter.body.data.id)
  assert.equal(importedPetition.urgency, 'urgent')
  assert.equal(importedPetition.status, 'pending')

  const exported = await ctx.app.inject({
    method: 'GET',
    url: '/api/petitions/export?search=匯入的路平案件',
    headers: bearer(adminToken),
  })
  assert.equal(exported.statusCode, 200)
  const exportedWorkbook = XLSX.read((exported as any).rawPayload, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets['陳情資料'], { header: 1 }) as any[][]
  const headers = rows[0]
  const row = rows.find(item => item[headers.indexOf('陳情內容')] === '匯入的路平案件')
  assert.ok(row)
  assert.equal(row[headers.indexOf('急迫程度')], '急件')
  assert.equal(row[headers.indexOf('陳情人')], '陳情匯入選民')
})

test('attachment API accepts real PDF content, rejects spoofed content, and serves safe headers', async () => {
  const voter = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: { name: '附件測試選民', mobile: '0952345678' },
  }))
  assert.equal(voter.statusCode, 201)

  const spoof = multipartPayload({
    filename: 'evil.pdf',
    contentType: 'application/pdf',
    content: '<html>not a pdf</html>',
  })
  const spoofResponse = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/attachments?ref_type=voter&ref_id=${voter.body.data.id}`,
    headers: { ...bearer(adminToken), 'content-type': spoof.contentType },
    payload: spoof.payload,
  }))
  assert.equal(spoofResponse.statusCode, 400)
  assert.match(spoofResponse.body.error, /格式不符/)

  const pdf = multipartPayload({
    filename: '../service-report.pdf',
    contentType: 'application/pdf',
    content: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'),
  })
  const uploaded = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/attachments?ref_type=voter&ref_id=${voter.body.data.id}`,
    headers: { ...bearer(adminToken), 'content-type': pdf.contentType },
    payload: pdf.payload,
  }))
  assert.equal(uploaded.statusCode, 201)
  assert.equal(uploaded.body.data.file_name, 'service-report.pdf')
  assert.equal(uploaded.body.data.mime_type, 'application/pdf')

  const list = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/attachments?ref_type=voter&ref_id=${voter.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(list.statusCode, 200)
  assert.equal(list.body.data.length, 1)

  const download = await ctx.app.inject({
    method: 'GET',
    url: `/api/attachments/${uploaded.body.data.id}/file`,
    headers: bearer(adminToken),
  })
  assert.equal(download.statusCode, 200)
  assert.equal(download.headers['content-type'], 'application/pdf')
  assert.equal(download.headers['x-content-type-options'], 'nosniff')
  assert.match(String(download.headers['content-disposition']), /^inline; filename=/)
  assert.match((download as any).rawPayload.toString(), /^%PDF/)
})

test('schedule API detects overlapping updates and returns cross-day events in date range', async () => {
  const overnight = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/schedules',
    headers: bearer(adminToken),
    payload: {
      title: '跨日值勤',
      start_time: '2026-05-01T23:00:00',
      end_time: '2026-05-02T01:00:00',
      schedule_type: 'service',
    },
  }))
  assert.equal(overnight.statusCode, 201)

  const range = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/schedules?start=2026-05-02T00:00:00&end=2026-05-02T23:59:59',
    headers: bearer(adminToken),
  }))
  assert.equal(range.statusCode, 200)
  assert.equal(range.body.data.some((schedule: any) => schedule.title === '跨日值勤'), true)

  const base = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/schedules',
    headers: bearer(adminToken),
    payload: {
      title: '既有會議',
      start_time: '2026-05-03T10:00:00',
      end_time: '2026-05-03T11:00:00',
    },
  }))
  assert.equal(base.statusCode, 201)

  const second = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/schedules',
    headers: bearer(adminToken),
    payload: {
      title: '待更新會議',
      start_time: '2026-05-03T12:00:00',
      end_time: '2026-05-03T13:00:00',
    },
  }))
  assert.equal(second.statusCode, 201)

  const conflict = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/schedules/${second.body.data.id}`,
    headers: bearer(adminToken),
    payload: {
      start_time: '2026-05-03T10:30:00',
      end_time: '2026-05-03T10:45:00',
    },
  }))
  assert.equal(conflict.statusCode, 409)
  assert.match(conflict.body.error, /衝突/)
})

test('consultation slots enforce capacity and report availability', async () => {
  const slot = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/consultations/slots',
    headers: bearer(adminToken),
    payload: { slot_date: '2026-05-04', slot_time: '09:00', max_capacity: 1 },
  }))
  assert.equal(slot.statusCode, 201)

  const first = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/consultations',
    headers: bearer(adminToken),
    payload: {
      voter_name: '法律諮詢一',
      voter_phone: '0982345678',
      appointment_date: '2026-05-04',
      time_slot: '09:00',
      issue_summary: '租賃契約',
    },
  }))
  assert.equal(first.statusCode, 201)

  const second = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/consultations',
    headers: bearer(adminToken),
    payload: {
      voter_name: '法律諮詢二',
      voter_phone: '0982345679',
      appointment_date: '2026-05-04',
      time_slot: '09:00',
      issue_summary: '勞資糾紛',
    },
  }))
  assert.equal(second.statusCode, 409)

  const availability = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/consultations/slots?date=2026-05-04',
    headers: bearer(adminToken),
  }))
  assert.equal(availability.statusCode, 200)
  assert.equal(availability.body.data[0].booked, 1)
  assert.equal(availability.body.data[0].available, 0)
})

test('restore rejects non-SQLite .db uploads before creating restore marker', async () => {
  rmSync(path.join(ctx.dataPath, 'voter-service.db.restore'), { force: true })
  const fakeDb = multipartPayload({
    filename: 'not-a-real-backup.db',
    contentType: 'application/octet-stream',
    content: 'not sqlite',
  })
  const response = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': fakeDb.contentType },
    payload: fakeDb.payload,
  }))
  assert.equal(response.statusCode, 400)
  assert.equal(response.body.success, false)
  assert.match(response.body.error, /完整性|驗證/)
  assert.equal(existsSync(path.join(ctx.dataPath, 'voter-service.db.restore')), false)
})

test('voter Excel import dry-run previews rows and commit creates voters with tags', async () => {
  const workbook = XLSX.utils.book_new()
  const rows = [
    ['姓名*', '性別(男/女/其他)', '出生日期(YYYY-MM-DD)', '身份證號', '手機', '電子郵件', '地址', '標籤(多個用逗號分隔)', '備註'],
    ['匯入測試一', '女', '1990-01-02', 'D123456789', '0962345678', 'import1@example.com', '臺北市信義區信義里信義路5段7號', '支持者,志工', 'dry run and import'],
    ['錯誤手機', '男', '1991-03-04', 'E123456789', '12345', 'bad@example.com', '臺北市信義區信義路8號', '', 'should fail'],
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '選民資料')
  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const dryRunFile = multipartPayload({
    filename: 'voters.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: excelBuffer,
  })
  const dryRun = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters/import?dryRun=true',
    headers: { ...bearer(adminToken), 'content-type': dryRunFile.contentType },
    payload: dryRunFile.payload,
  }))
  assert.equal(dryRun.statusCode, 200)
  assert.equal(dryRun.body.preview.valid_count, 1)
  assert.equal(dryRun.body.preview.error_count, 1)

  const before = (ctx.db.prepare("SELECT COUNT(*) AS count FROM voters WHERE mobile='0962345678'").get() as any).count
  assert.equal(before, 0)

  const importFile = multipartPayload({
    filename: 'voters.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: excelBuffer,
  })
  const imported = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters/import',
    headers: { ...bearer(adminToken), 'content-type': importFile.contentType },
    payload: importFile.payload,
  }))
  assert.equal(imported.statusCode, 200)
  assert.equal(imported.body.imported, 1)
  assert.match(imported.body.errors[0], /手機號碼格式不正確/)

  const voter = ctx.db.prepare("SELECT * FROM voters WHERE mobile='0962345678' AND is_active=1").get() as any
  assert.equal(voter.name, '匯入測試一')
  assert.equal(voter.household_city, '臺北市')
  const tags = (ctx.db.prepare('SELECT tag FROM voter_tags WHERE voter_id=? ORDER BY tag').all(voter.id) as any[]).map(row => row.tag)
  assert.deepEqual(tags, ['志工', '支持者'])
})

test('secret settings round-trip encrypted at rest without leaking raw values', async () => {
  const line = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
    payload: {
      line_channel_access_token: 'line-access-secret',
      line_channel_secret: 'line-signing-secret',
    },
  }))
  assert.equal(line.statusCode, 200)

  const settings = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
  }))
  assert.equal(settings.statusCode, 200)
  assert.equal(settings.body.data.line_channel_access_token_configured, true)
  assert.equal(settings.body.data.line_channel_secret_configured, true)
  assert.equal(settings.body.data.line_channel_secret, undefined)

  const lineSecretRaw = (ctx.db.prepare("SELECT value FROM settings WHERE key='line_channel_secret'").get() as any).value
  assert.equal(isEncryptedSecret(lineSecretRaw), true)
  assert.equal(decryptSecretValue(lineSecretRaw), 'line-signing-secret')

  const gcal = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/integrations/gcal/credentials',
    headers: bearer(adminToken),
    payload: { client_id: 'gcal-client-id', client_secret: 'gcal-client-secret' },
  }))
  assert.equal(gcal.statusCode, 200)
  const gcalStatus = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/integrations/gcal/status',
    headers: bearer(adminToken),
  }))
  assert.equal(gcalStatus.body.data.configured, true)
  assert.equal(gcalStatus.body.data.clientId, 'gcal-client-id')
  assert.equal(gcalStatus.body.data.clientSecret, undefined)
  const gcalSecretRaw = (ctx.db.prepare("SELECT value FROM settings WHERE key='gcal_client_secret'").get() as any).value
  assert.equal(isEncryptedSecret(gcalSecretRaw), true)
  assert.equal(decryptSecretValue(gcalSecretRaw), 'gcal-client-secret')

  const gcalPreserve = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/integrations/gcal/credentials',
    headers: bearer(adminToken),
    payload: { client_id: 'gcal-client-id-2', client_secret: '' },
  }))
  assert.equal(gcalPreserve.statusCode, 200)
  const preservedSecret = (ctx.db.prepare("SELECT value FROM settings WHERE key='gcal_client_secret'").get() as any).value
  assert.equal(decryptSecretValue(preservedSecret), 'gcal-client-secret')

  const ai = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/ai/config',
    headers: bearer(adminToken),
    payload: {
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test-secret',
      maxTokens: 512,
    },
  }))
  assert.equal(ai.statusCode, 200)
  const aiConfig = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/ai/config',
    headers: bearer(adminToken),
  }))
  assert.equal(aiConfig.body.data.apiKeySet, true)
  assert.notEqual(aiConfig.body.data.apiKey, 'sk-test-secret')
  const aiKeyRaw = (ctx.db.prepare("SELECT value FROM settings WHERE key='ai_api_key'").get() as any).value
  assert.equal(isEncryptedSecret(aiKeyRaw), true)
  assert.equal(decryptSecretValue(aiKeyRaw), 'sk-test-secret')
})

test('data retention preview and run archive old logs, purge client errors, and anonymize inactive voters', async () => {
  const oldDate = '2024-01-01 00:00:00'
  const recentDate = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const inactiveVoter = ctx.db.prepare(`
    INSERT INTO voters (
      name, gender, birth_date, id_number, mobile, phone, line_id, email,
      household_city, household_district, household_village, household_address,
      mailing_address, occupation, company, job_title, note, is_active, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
  `).run(
    '待去識別選民', '女', '1980-01-02', 'A123456789', '0999999999', '0222222222', 'line-secret',
    'pii@example.com', '臺北市', '中正區', '幸福里', '完整門牌', '通訊地址', '工程師',
    '敏感公司', '主任', '敏感備註', oldDate
  ).lastInsertRowid as number

  ctx.db.prepare(`
    INSERT INTO audit_logs(user_id, action, module, target_type, target_id, target_name, detail, ip_address, created_at)
    VALUES(1, 'export', '選民管理', 'voter', ?, 'old audit', 'old detail', '127.0.0.1', ?)
  `).run(inactiveVoter, oldDate)
  ctx.db.prepare(`
    INSERT INTO audit_logs(user_id, action, module, target_type, target_name, created_at)
    VALUES(1, 'export', '選民管理', 'voter', 'recent audit', ?)
  `).run(recentDate)
  ctx.db.prepare(`
    INSERT INTO client_errors(message, source, stack, user_agent, url, created_at)
    VALUES('old client error', 'settings', 'stack', 'agent', '/admin/settings', ?)
  `).run(oldDate)

  const settings = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
    payload: {
      data_retention_enabled: '1',
      retention_audit_archive_days: '30',
      retention_client_error_days: '30',
      retention_soft_deleted_voter_days: '30',
    },
  }))
  assert.equal(settings.statusCode, 200)

  const preview = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/data-retention/preview',
    headers: bearer(adminToken),
  }))
  assert.equal(preview.statusCode, 200)
  assert.equal(preview.body.data.enabled, true)
  assert.equal(preview.body.data.counts.audit_logs_to_archive, 1)
  assert.equal(preview.body.data.counts.client_errors_to_delete, 1)
  assert.equal(preview.body.data.counts.inactive_voters_to_anonymize, 1)

  const rejected = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/data-retention/run',
    headers: bearer(adminToken),
    payload: { confirm: 'WRONG' },
  }))
  assert.equal(rejected.statusCode, 400)

  const run = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/data-retention/run',
    headers: bearer(adminToken),
    payload: { confirm: 'RUN_RETENTION' },
  }))
  assert.equal(run.statusCode, 200)
  assert.equal(run.body.data.audit_logs_archived, 1)
  assert.equal(run.body.data.client_errors_deleted, 1)
  assert.equal(run.body.data.inactive_voters_anonymized, 1)

  const archived = (ctx.db.prepare("SELECT COUNT(*) AS count FROM archive_audit_logs WHERE target_name='old audit'").get() as any).count
  assert.equal(archived, 1)
  const oldAuditStillActive = (ctx.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE target_name='old audit'").get() as any).count
  assert.equal(oldAuditStillActive, 0)
  const recentAuditStillActive = (ctx.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE target_name='recent audit'").get() as any).count
  assert.equal(recentAuditStillActive, 1)
  const clientErrors = (ctx.db.prepare("SELECT COUNT(*) AS count FROM client_errors WHERE message='old client error'").get() as any).count
  assert.equal(clientErrors, 0)

  const voter = ctx.db.prepare('SELECT * FROM voters WHERE id=?').get(inactiveVoter) as any
  assert.equal(voter.is_active, 0)
  assert.equal(voter.mobile, null)
  assert.equal(voter.id_number, null)
  assert.equal(voter.email, null)
  assert.equal(voter.name, `已匿名選民 #${inactiveVoter}`)
})

test('events API enforces date and trimmed titles, then stores planned events by default', async () => {
  const blankTitle = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/events',
    headers: bearer(adminToken),
    payload: {
      title: '   ',
      event_date: '2026-04-30',
    },
  }))
  assert.equal(blankTitle.statusCode, 400)
  assert.equal(blankTitle.body.error, '活動標題為必填')

  const missingDate = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/events',
    headers: bearer(adminToken),
    payload: {
      title: '少日期的活動',
    },
  }))
  assert.equal(missingDate.statusCode, 400)
  assert.equal(missingDate.body.error, '活動日期為必填')

  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/events',
    headers: bearer(adminToken),
    payload: {
      title: 'API 測試活動',
      event_date: '2026-04-30',
      location: '服務處',
    },
  }))
  assert.equal(created.statusCode, 201)

  const detail = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/events/${created.body.data.id}`,
    headers: bearer(adminToken),
  }))
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.body.data.title, 'API 測試活動')
  assert.equal(detail.body.data.event_date, '2026-04-30')
  assert.equal(detail.body.data.status, 'planned')
})

test('surveys and notifications APIs reject whitespace-only drafts and notification sends only support all-target broadcasts', async () => {
  const blankSurvey = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/surveys',
    headers: bearer(adminToken),
    payload: {
      title: '   ',
      description: '空白名稱問卷',
    },
  }))
  assert.equal(blankSurvey.statusCode, 400)
  assert.equal(blankSurvey.body.error, '問卷標題為必填')

  const blankNotificationTitle = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: bearer(adminToken),
    payload: {
      title: '   ',
      content: '有內容但標題空白',
      target_type: 'all',
    },
  }))
  assert.equal(blankNotificationTitle.statusCode, 400)
  assert.equal(blankNotificationTitle.body.error, '通知標題為必填')

  const blankNotificationContent = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: bearer(adminToken),
    payload: {
      title: '空白內容通知',
      content: '   ',
      target_type: 'all',
    },
  }))
  assert.equal(blankNotificationContent.statusCode, 400)
  assert.equal(blankNotificationContent.body.error, '通知內容為必填')

  const unsupportedDraft = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: bearer(adminToken),
    payload: {
      title: '標籤通知草稿',
      content: '等待未來支援',
      target_type: 'tag',
    },
  }))
  assert.equal(unsupportedDraft.statusCode, 201)

  const unsupportedSend = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/notifications/${unsupportedDraft.body.data.id}/send`,
    headers: bearer(adminToken),
  }))
  assert.equal(unsupportedSend.statusCode, 400)
  assert.match(unsupportedSend.body.error, /不支援的目標類型/)

  const supportedDraft = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/notifications',
    headers: bearer(adminToken),
    payload: {
      title: '全體通知草稿',
      content: '全體通知內容',
      target_type: 'all',
    },
  }))
  assert.equal(supportedDraft.statusCode, 201)

  const supportedSend = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: `/api/notifications/${supportedDraft.body.data.id}/send`,
    headers: bearer(adminToken),
  }))
  assert.equal(supportedSend.statusCode, 200)
  assert.equal(supportedSend.body.success, true)
})

// ===================== Secrets round-trip (AI / Google / LINE) =====================

test('AI config PUT encrypts apiKey at rest, never returns plaintext, and is preserved when masked value re-submitted', async () => {
  const apiKey = 'sk-test-1234567890abcdef-secret'
  const put1 = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/ai/config',
    headers: bearer(adminToken),
    payload: { provider: 'openai', model: 'gpt-4o-mini', apiKey, baseUrl: 'https://api.openai.com', maxTokens: 1024 },
  }))
  assert.equal(put1.statusCode, 200)

  // 直接讀 settings：value 必須被加密儲存
  const stored = ctx.db.prepare("SELECT value FROM settings WHERE key='ai_api_key'").get() as any
  assert.ok(stored?.value, 'ai_api_key should be persisted')
  assert.notEqual(stored.value, apiKey, 'ai_api_key must not be stored as plaintext')
  assert.equal(isEncryptedSecret(stored.value), true, 'ai_api_key should be wrapped with enc:v1: marker')
  assert.equal(decryptSecretValue(stored.value), apiKey, 'decrypted value should round-trip to original')

  // GET /api/ai/config 不可洩漏明文
  const get1 = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/ai/config',
    headers: bearer(adminToken),
  }))
  assert.equal(get1.statusCode, 200)
  assert.equal(get1.body.data.apiKeySet, true)
  assert.notEqual(get1.body.data.apiKey, apiKey)
  assert.match(String(get1.body.data.apiKey), /^[*]+|^\*\*\*/)

  // 再次 PUT 帶 *** 遮罩值 → 後端應視為「保留原值」，不可覆寫成 ***
  const put2 = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/ai/config',
    headers: bearer(adminToken),
    payload: { apiKey: get1.body.data.apiKey },
  }))
  assert.equal(put2.statusCode, 200)
  const stored2 = ctx.db.prepare("SELECT value FROM settings WHERE key='ai_api_key'").get() as any
  assert.equal(decryptSecretValue(stored2.value), apiKey, 'submitting masked apiKey must preserve the existing secret')
})

test('Google Calendar credentials encrypt client_secret at rest and admin/settings GET never returns it', async () => {
  const clientId = 'voter-service-test.apps.googleusercontent.com'
  const clientSecret = 'GOCSPX-very-secret-token'
  const put = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/integrations/gcal/credentials',
    headers: bearer(adminToken),
    payload: { client_id: clientId, client_secret: clientSecret },
  }))
  assert.equal(put.statusCode, 200)

  const storedClientId = ctx.db.prepare("SELECT value FROM settings WHERE key='gcal_client_id'").get() as any
  const storedSecret = ctx.db.prepare("SELECT value FROM settings WHERE key='gcal_client_secret'").get() as any
  assert.equal(storedClientId.value, clientId, 'client_id is not sensitive — store as-is')
  assert.notEqual(storedSecret.value, clientSecret, 'client_secret must not be stored as plaintext')
  assert.equal(isEncryptedSecret(storedSecret.value), true)
  assert.equal(decryptSecretValue(storedSecret.value), clientSecret)

  // /api/admin/settings 不可回傳 secret 明文
  const settings = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
  }))
  assert.equal(settings.statusCode, 200)
  assert.equal(settings.body.data.gcal_client_secret, undefined, 'gcal_client_secret must never appear in /api/admin/settings response')
  assert.equal(settings.body.data.gcal_client_secret_configured, true, 'configured flag should be set')
})

test('LINE webhook secrets encrypt at rest and signature verification can read them back', async () => {
  const accessToken = 'line-channel-access-test-token-1234567890'
  const channelSecret = 'line-channel-secret-test-abcdef'

  const update = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
    payload: {
      line_channel_access_token: accessToken,
      line_channel_secret: channelSecret,
    },
  }))
  assert.equal(update.statusCode, 200)

  const storedToken = ctx.db.prepare("SELECT value FROM settings WHERE key='line_channel_access_token'").get() as any
  const storedSecret = ctx.db.prepare("SELECT value FROM settings WHERE key='line_channel_secret'").get() as any
  assert.equal(isEncryptedSecret(storedToken.value), true)
  assert.equal(isEncryptedSecret(storedSecret.value), true)
  assert.equal(decryptSecretValue(storedToken.value), accessToken)
  assert.equal(decryptSecretValue(storedSecret.value), channelSecret)

  // 設定頁不可回傳明文
  const settings = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/admin/settings',
    headers: bearer(adminToken),
  }))
  assert.equal(settings.statusCode, 200)
  assert.equal(settings.body.success, true)
  assert.equal(settings.body.data.line_channel_access_token, undefined)
  assert.equal(settings.body.data.line_channel_secret, undefined)
  assert.equal(settings.body.data.line_channel_access_token_configured, true)
  assert.equal(settings.body.data.line_channel_secret_configured, true)

  // line/status：路由 query 改用 voter_tags 子表 join 後，預期回 200，
  // 並回報 channel_secret_configured=true 與 webhook_active=true。
  const status = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/line/status',
    headers: bearer(adminToken),
  }))
  assert.equal(status.statusCode, 200, 'line/status 預期回 200')
  assert.equal(status.body.success, true)
  assert.equal(status.body.data.channel_secret_configured, true)
  assert.equal(status.body.data.webhook_active, true)
  assert.equal(typeof status.body.data.linked_voters, 'number')
})

// ===================== Groups import round-trip =====================

test('groups import accepts valid Excel rows, rejects duplicates and tracks audit', async () => {
  // 1. 取得範本，確認 headers / 範例存在
  const tpl = await ctx.app.inject({
    method: 'GET',
    url: '/api/groups/import/template',
    headers: bearer(adminToken),
  })
  assert.equal(tpl.statusCode, 200)
  assert.equal(
    String(tpl.headers['content-type']),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  const tplBuf = tpl.rawPayload as Buffer
  const tplWb = XLSX.read(tplBuf, { type: 'buffer' })
  const tplSheet = tplWb.Sheets[tplWb.SheetNames[0]]
  const tplRows = XLSX.utils.sheet_to_json<string[]>(tplSheet, { header: 1, defval: '' })
  assert.equal(tplRows[0][0], '團體名稱')
  assert.equal(tplRows[0][1], '類別')

  // 2. 用範本 headers 自製測試檔（一筆新、一筆故意重名、一筆空名）
  const headers = tplRows[0]
  const rows = [
    headers,
    ['測試團體_A', '社區', '02-12340001', '臺北市信義區', '20', 'roundtrip A'],
    ['測試團體_B', '宗教', '0922000222', '臺北市內湖區', '15', 'roundtrip B'],
    ['測試團體_A', '社區', '', '', '', '故意重複，應失敗'],
    ['', '社區', '', '', '', '故意空名，應失敗'],
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, '團體資料')
  const importBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  // 3. 上傳
  const upload = multipartPayload({
    fieldName: 'file',
    filename: 'group_import_test.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: importBuf,
  })
  const importResp = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/groups/import',
    headers: { ...bearer(adminToken), 'content-type': upload.contentType },
    payload: upload.payload,
  }))
  assert.equal(importResp.statusCode, 200)
  assert.equal(importResp.body.imported, 2, '應成功匯入 2 筆新團體')
  assert.equal(importResp.body.failed, 2, '應有 2 筆失敗（重名 + 空名）')
  assert.equal(importResp.body.errors.length, 2)
  assert.match(String(importResp.body.errors.join('|')), /已存在/)
  assert.match(String(importResp.body.errors.join('|')), /團體名稱不可空白/)

  // 4. 後端資料庫應有兩筆新團體
  const a = ctx.db.prepare("SELECT * FROM groups WHERE name='測試團體_A' AND is_active=1").get() as any
  const b = ctx.db.prepare("SELECT * FROM groups WHERE name='測試團體_B' AND is_active=1").get() as any
  assert.ok(a, 'A 應存在')
  assert.ok(b, 'B 應存在')
  assert.equal(a.category, '社區')
  assert.equal(b.category, '宗教')
  assert.equal(a.member_count, 20)
  assert.equal(b.phone, '0922000222')

  // 5. audit log 應寫入 import 紀錄
  const audit = ctx.db.prepare(
    "SELECT * FROM audit_logs WHERE module='團體管理' AND action='import' ORDER BY id DESC LIMIT 1",
  ).get() as any
  assert.ok(audit, 'audit log 應有 group import 紀錄')
  assert.match(String(audit.target_name), /匯入 2 筆團體/)
})

test('groups import rejects unauthorized roles', async () => {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['團體名稱', '類別', '聯絡電話', '地址', '預估成員數', '備註'],
    ['未授權團體', '社區', '', '', '', ''],
  ])
  XLSX.utils.book_append_sheet(wb, ws, '團體資料')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const upload = multipartPayload({
    fieldName: 'file',
    filename: 'unauthorized.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: buf,
  })
  const resp = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/groups/import',
    headers: { ...bearer(volunteerToken), 'content-type': upload.contentType },
    payload: upload.payload,
  }))
  assert.equal(resp.statusCode, 403, 'volunteer 不應能匯入團體')
})

// ===================== Global search =====================

test('global search returns matching voters by name and rejects empty queries with empty result set', async () => {
  // 建一筆容易識別的選民，避免與其它測試衝突
  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/voters',
    headers: bearer(adminToken),
    payload: {
      name: '搜尋測試專用選民',
      mobile: '0933000888',
      household_city: '臺北市',
      household_district: '大安區',
    },
  }))
  assert.equal(created.statusCode, 201)
  const voterId = created.body.data.id

  // 1. 有效關鍵字 → 應在 voters bucket 內找到
  const found = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/search?q=${encodeURIComponent('搜尋測試專用')}&types=voter`,
    headers: bearer(adminToken),
  }))
  assert.equal(found.statusCode, 200)
  assert.equal(found.body.success, true)
  assert.ok(Array.isArray(found.body.data.voters), 'voters bucket should be returned')
  const hit = found.body.data.voters.find((v: any) => v.id === voterId)
  assert.ok(hit, '建立的選民應出現在搜尋結果中')
  assert.equal(hit.name, '搜尋測試專用選民')
  assert.equal(hit.type, 'voter')
  assert.ok(found.body.total >= 1, 'total 應 ≥ 1')

  // 2. 空字串 q → 路由直接回傳空 data 物件，total 不存在或為 0
  const empty = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/search?q=',
    headers: bearer(adminToken),
  }))
  assert.equal(empty.statusCode, 200)
  assert.equal(empty.body.success, true)
  assert.deepEqual(empty.body.data, {}, '空查詢應回空 data 物件')

  // 3. 無權限角色不可用 → 必須阻擋（route 需 voters:view）
  // volunteer 有 voters:view 權限，因此 200；改用 anonymous 驗證 401
  const anon = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/search?q=測試',
  }))
  assert.equal(anon.statusCode, 401)
})

// ===================== Election areas =====================

test('election areas endpoints list and create with admin-only role enforcement', async () => {
  // 1. admin 可建立
  const created = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/election-areas',
    headers: bearer(adminToken),
    payload: {
      name: '第一選區-API測試',
      city: '臺北市',
      district: '中正區',
      area_code: 'TPE-01-T',
      note: 'integration test',
    },
  }))
  assert.equal(created.statusCode, 201)
  assert.equal(created.body.success, true)
  assert.ok(typeof created.body.data.id === 'number' || typeof created.body.data.id === 'bigint')

  // 2. admin 可列出，且新建的選區應出現
  const list = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/election-areas',
    headers: bearer(adminToken),
  }))
  assert.equal(list.statusCode, 200)
  assert.equal(list.body.success, true)
  assert.ok(Array.isArray(list.body.data))
  const found = list.body.data.find((a: any) => a.name === '第一選區-API測試')
  assert.ok(found, '新建選區應出現在 list')
  assert.equal(found.city, '臺北市')
  assert.equal(found.area_code, 'TPE-01-T')

  // 3. 缺 name 應 400
  const badCreate = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/election-areas',
    headers: bearer(adminToken),
    payload: { city: '臺北市' },
  }))
  assert.equal(badCreate.statusCode, 400)
  assert.match(String(badCreate.body.error), /名稱/)

  // 4. assistant / volunteer 沒有 admin 模組權限 → 403
  const assistantList = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/election-areas',
    headers: bearer(assistantToken),
  }))
  assert.equal(assistantList.statusCode, 403, 'assistant 不應能列選區')

  const assistantCreate = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/election-areas',
    headers: bearer(assistantToken),
    payload: { name: 'assistant 不應建立' },
  }))
  assert.equal(assistantCreate.statusCode, 403, 'assistant 不應能建立選區')

  const volunteerCreate = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/election-areas',
    headers: bearer(volunteerToken),
    payload: { name: 'volunteer 不應建立' },
  }))
  assert.equal(volunteerCreate.statusCode, 403, 'volunteer 不應能建立選區')
})

// ===================== Daily logs =====================

test('daily log upsert by admin persists fields and is retrievable by date', async () => {
  const date = '2026-04-26'

  // 1. admin upsert
  const upsert = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/daily-logs/${date}`,
    headers: bearer(adminToken),
    payload: {
      highlights: '完成 API 整合測試',
      new_cases_summary: '新增陳情 3 件',
      completed_summary: '結案 2 件',
      pending_handover: '無',
      director_note: 'integration test',
    },
  }))
  assert.equal(upsert.statusCode, 200)
  assert.equal(upsert.body.success, true)

  // 2. GET 同日 → 應回傳剛剛 upsert 的內容（非 auto-generate）
  const fetched = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/daily-logs/${date}`,
    headers: bearer(adminToken),
  }))
  assert.equal(fetched.statusCode, 200)
  assert.equal(fetched.body.success, true)
  assert.equal(fetched.body.data.log_date, date)
  assert.equal(fetched.body.data.highlights, '完成 API 整合測試')
  assert.equal(fetched.body.data.new_cases_summary, '新增陳情 3 件')
  assert.equal(fetched.body.data.completed_summary, '結案 2 件')
  assert.equal(fetched.body.data.director_note, 'integration test')

  // 3. list 應包含這筆
  const list = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: '/api/daily-logs',
    headers: bearer(adminToken),
  }))
  assert.equal(list.statusCode, 200)
  assert.equal(list.body.success, true)
  assert.ok(list.body.data.some((row: any) => row.log_date === date), 'list 應包含剛建立的日誌')

  // 4. 日期格式錯誤 → 400
  const badDate = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: '/api/daily-logs/2026-13-40',
    headers: bearer(adminToken),
    payload: { highlights: 'x' },
  }))
  assert.equal(badDate.statusCode, 400)
  assert.match(String(badDate.body.error), /日期格式/)
})

test('daily log writes are blocked for volunteer and assistant roles', async () => {
  const date = '2026-04-27'

  const volunteerWrite = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/daily-logs/${date}`,
    headers: bearer(volunteerToken),
    payload: { highlights: 'volunteer 不應寫入' },
  }))
  assert.equal(volunteerWrite.statusCode, 403, 'volunteer 不應能 upsert daily log')

  const volunteerRead = parseJsonResponse(await ctx.app.inject({
    method: 'GET',
    url: `/api/daily-logs/${date}`,
    headers: bearer(volunteerToken),
  }))
  assert.equal(volunteerRead.statusCode, 403, 'volunteer 在 admin 模組無 view 權限')

  const assistantWrite = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/daily-logs/${date}`,
    headers: bearer(assistantToken),
    payload: { highlights: 'assistant 不應寫入' },
  }))
  assert.equal(assistantWrite.statusCode, 403, 'assistant 在 admin 模組無 edit 權限')

  // 確認 admin 仍可寫入此日期（隔離測試之間的副作用）
  const adminWrite = parseJsonResponse(await ctx.app.inject({
    method: 'PUT',
    url: `/api/daily-logs/${date}`,
    headers: bearer(adminToken),
    payload: { highlights: 'admin 寫入', new_cases_summary: '0', completed_summary: '0' },
  }))
  assert.equal(adminWrite.statusCode, 200)
})
