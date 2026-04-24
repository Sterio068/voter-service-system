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
  parseJsonResponse,
  type ApiTestContext,
} from '../helpers/apiTestServer'

let ctx: ApiTestContext
let adminToken = ''
let assistantToken = ''
let volunteerToken = ''

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

test('restore accepts a valid system backup and writes a pending restore marker', async () => {
  const backup = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/backup',
    headers: bearer(adminToken),
  }))
  assert.equal(backup.statusCode, 200)

  const backupName = backup.body.data.name
  const backupPath = path.join(ctx.backupsPath, backupName)
  const upload = multipartPayload({
    filename: backupName,
    contentType: 'application/octet-stream',
    content: readFileSync(backupPath),
  })

  const restore = parseJsonResponse(await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/restore',
    headers: { ...bearer(adminToken), 'content-type': upload.contentType },
    payload: upload.payload,
  }))
  assert.equal(restore.statusCode, 200)
  assert.equal(restore.body.success, true)
  assert.equal(restore.body.data.restoreFile, 'voter-service.db.restore')
  assert.equal(existsSync(path.join(ctx.dataPath, 'voter-service.db.restore')), true)
  assert.match(restore.body.data.currentBackup, /^pre-restore-voter-service-/)
  assert.equal(existsSync(path.join(ctx.backupsPath, `${restore.body.data.currentBackup}.meta.json`)), true)
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
