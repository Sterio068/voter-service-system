import { expect, test } from '@playwright/test'
import {
  authenticateAs,
  createCeremonyRecord,
  createDocumentRecord,
  createPetitionRecord,
  createScheduleRecord,
  createTaskRecord,
  createUser,
  createVoterRecord,
  disableFirstRunWizard,
  getAdminSession,
} from './helpers/session'

function uniqueAccount(prefix: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
  return {
    username: `${prefix}_${stamp}`,
    password: `${prefix}12345`,
    name: `E2E ${prefix} ${stamp}`,
  }
}

test('assistant keeps operational access, can view reports and categories, but stays blocked from privileged admin routes', async ({ page, request }) => {
  const admin = await getAdminSession(request)
  await disableFirstRunWizard(request, admin.token)
  const account = uniqueAccount('assistant')
  await createUser(request, admin.token, { ...account, role: 'assistant' })
  const stamp = Date.now()
  const voter = await createVoterRecord(request, admin.token, {
    name: `Assistant RBAC ${stamp}`,
    mobile: `09${String(stamp).slice(-8)}`,
  })
  await createPetitionRecord(request, admin.token, {
    content: `Assistant RBAC Petition ${stamp}`,
    petition_date: new Date().toISOString().slice(0, 10),
    voter_id: voter.id,
  })
  const today = new Date().toISOString().slice(0, 10)
  await createDocumentRecord(request, admin.token, {
    subject: `Assistant RBAC Document ${stamp}`,
  })
  await createScheduleRecord(request, admin.token, {
    title: `Assistant RBAC Consultation ${stamp}`,
    schedule_type: 'consultation',
    start_time: `${today} 10:00:00`,
    end_time: `${today} 11:00:00`,
    location: '會客室 A',
  })
  await createCeremonyRecord(request, admin.token, {
    recipient_name: `Assistant RBAC Ceremony ${stamp}`,
    event_date: new Date().toISOString().slice(0, 10),
  })

  await authenticateAs(page, request, account.username, account.password)

  await expect(page.getByRole('button', { name: '新增陳情' })).toBeVisible()
  await expect(page.getByText('通知管理', { exact: true })).toBeVisible()
  await expect(page.getByText('問卷管理', { exact: true })).toBeVisible()
  await expect(page.getByText('電話拜訪', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('進階報表', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('類別管理', { exact: true })).toBeVisible()
  await expect(page.getByText('系統設定', { exact: true })).toHaveCount(0)
  await expect(page.getByText('帳號維護', { exact: true })).toHaveCount(0)

  await page.goto('/voters')
  await expect(page.getByRole('button', { name: '新增選民' })).toBeVisible()
  await expect(page.getByLabel('編輯選民').first()).toBeVisible()
  await expect(page.getByLabel('停用選民')).toHaveCount(0)

  await page.goto('/petitions')
  await expect(page.getByRole('button', { name: '快速立案' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增陳情' })).toBeVisible()
  await expect(page.getByLabel('刪除陳情')).toHaveCount(0)

  await page.goto('/documents')
  await expect(page.getByRole('button', { name: '新增收文' })).toBeVisible()
  await page.getByText(`Assistant RBAC Document ${stamp}`, { exact: true }).click()
  await expect(page.getByRole('button', { name: '列印' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '匯出 Word' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '刪除' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '儲存移轉資訊' })).toBeVisible()
  await expect(page.getByRole('button', { name: '上傳 PDF / 照片' })).toBeVisible()

  await page.goto('/schedules')
  await expect(page.getByRole('button', { name: '新增行程' })).toBeVisible()
  await expect(page.getByRole('button', { name: '列印行程' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '諮詢時段' })).toHaveCount(0)
  await page.getByRole('button', { name: '今日諮詢' }).click()
  await expect(page.getByRole('button', { name: '立案' })).toBeVisible()
  await page.goto('/schedules')
  await page.getByText(`Assistant RBAC Consultation ${stamp}`, { exact: true }).first().click()
  await expect(page.getByRole('button', { name: '編輯行程' })).toBeVisible()
  await expect(page.getByRole('button', { name: '刪除行程' })).toHaveCount(0)
  await page.getByRole('tab', { name: /禮儀記錄/ }).click()
  await expect(page.getByRole('button', { name: '新增禮儀記錄' })).toHaveCount(0)

  await page.goto('/reports')
  await expect(page.getByText('Decision Analytics', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '匯出月報' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '匯出 PDF' })).toHaveCount(0)

  await page.goto('/ceremonies')
  await expect(page.getByRole('heading', { name: '禮儀記錄' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增禮儀記錄' })).toHaveCount(0)
  await expect(page.getByLabel('編輯禮儀記錄')).toHaveCount(0)
  await expect(page.getByLabel('刪除禮儀記錄')).toHaveCount(0)

  await page.goto('/expenses')
  await expect(page.getByRole('heading', { name: '收支統計' })).toBeVisible()
  await page.getByRole('tab', { name: '預算管理' }).click()
  await expect(page.getByRole('button', { name: '設定預算' })).toHaveCount(0)

  await page.goto('/petitions/stats')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()

  await page.goto('/print/voters')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()

  await page.goto('/admin/categories')
  await expect(page.getByText('Taxonomy Studio', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增類型' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新增' })).toHaveCount(0)

  await page.goto('/admin/settings')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()
})

test('volunteer does not see create shortcuts and is blocked from restricted workflow pages', async ({ page, request }) => {
  const admin = await getAdminSession(request)
  await disableFirstRunWizard(request, admin.token)
  const account = uniqueAccount('volunteer')
  await createUser(request, admin.token, { ...account, role: 'volunteer' })
  const stamp = Date.now()
  const voter = await createVoterRecord(request, admin.token, {
    name: `Volunteer RBAC ${stamp}`,
    mobile: `09${String(stamp).slice(-8)}`,
  })
  await createPetitionRecord(request, admin.token, {
    content: `Volunteer RBAC Petition ${stamp}`,
    petition_date: new Date().toISOString().slice(0, 10),
    voter_id: voter.id,
  })
  await createTaskRecord(request, admin.token, {
    title: `Volunteer RBAC Task ${stamp}`,
    related_voter_id: voter.id,
  })
  await createDocumentRecord(request, admin.token, {
    subject: `Volunteer RBAC Document ${stamp}`,
  })
  await createScheduleRecord(request, admin.token, {
    title: `Volunteer RBAC Consultation ${stamp}`,
    schedule_type: 'consultation',
    start_time: `${new Date().toISOString().slice(0, 10)} 14:00:00`,
    end_time: `${new Date().toISOString().slice(0, 10)} 15:00:00`,
    location: '會客室 B',
  })
  await createCeremonyRecord(request, admin.token, {
    recipient_name: `Volunteer RBAC Ceremony ${stamp}`,
    event_date: new Date().toISOString().slice(0, 10),
  })

  await authenticateAs(page, request, account.username, account.password)

  await expect(page.getByRole('button', { name: '新增陳情' })).toHaveCount(0)
  await expect(page.getByText('電話拜訪', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('通知管理', { exact: true })).toHaveCount(0)
  await expect(page.getByText('問卷管理', { exact: true })).toHaveCount(0)
  await expect(page.getByText('收支統計', { exact: true })).toHaveCount(0)

  await page.goto('/voters')
  await expect(page.getByRole('button', { name: '新增選民' })).toHaveCount(0)
  await expect(page.getByLabel('編輯選民')).toHaveCount(0)
  await expect(page.getByLabel('停用選民')).toHaveCount(0)

  await page.goto('/documents')
  await expect(page.getByRole('button', { name: '新增收文' })).toHaveCount(0)
  await page.getByText(`Volunteer RBAC Document ${stamp}`, { exact: true }).click()
  await expect(page.getByRole('button', { name: '列印' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '匯出 Word' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '刪除' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '儲存移轉資訊' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '上傳 PDF / 照片' })).toHaveCount(0)

  await page.goto('/petitions')
  await expect(page.getByRole('button', { name: '快速立案' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新增陳情' })).toHaveCount(0)
  await expect(page.getByLabel('刪除陳情')).toHaveCount(0)

  await page.goto('/schedules')
  await expect(page.getByRole('button', { name: '新增行程' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '列印行程' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '諮詢時段' })).toHaveCount(0)
  await page.getByRole('button', { name: '今日諮詢' }).click()
  await expect(page.getByRole('button', { name: '立案' })).toHaveCount(0)
  await page.goto('/schedules')
  await page.getByText(`Volunteer RBAC Consultation ${stamp}`, { exact: true }).first().click()
  await expect(page.getByRole('button', { name: '編輯行程' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '刪除行程' })).toHaveCount(0)
  await page.getByRole('tab', { name: /禮儀記錄/ }).click()
  await expect(page.getByRole('button', { name: '新增禮儀記錄' })).toHaveCount(0)

  await page.goto('/tasks')
  await expect(page.getByRole('button', { name: '新增待辦' })).toHaveCount(0)
  await expect(page.getByLabel('完成待辦')).toHaveCount(0)
  await expect(page.getByLabel('刪除待辦')).toHaveCount(0)

  await page.goto('/voters/call-bank')
  await expect(page.getByRole('heading', { name: '電話拜訪' })).toBeVisible()

  await page.goto('/ceremonies')
  await expect(page.getByRole('heading', { name: '禮儀記錄' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增禮儀記錄' })).toHaveCount(0)
  await expect(page.getByLabel('編輯禮儀記錄')).toHaveCount(0)
  await expect(page.getByLabel('刪除禮儀記錄')).toHaveCount(0)
  await expect(page.getByText(/年總支出/)).toHaveCount(0)

  await page.goto('/notifications')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()

  await page.goto('/expenses')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()

  await page.goto('/print/labels')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()
})

test('supervisor keeps reporting and audit access, sees categories read-only, but is blocked from account transfer and daily log routes', async ({ page, request }) => {
  const admin = await getAdminSession(request)
  await disableFirstRunWizard(request, admin.token)
  const account = uniqueAccount('supervisor')
  await createUser(request, admin.token, { ...account, role: 'supervisor' })
  const stamp = Date.now()
  await createVoterRecord(request, admin.token, {
    name: `Supervisor RBAC ${stamp}`,
    mobile: `09${String(stamp).slice(-8)}`,
  })

  await authenticateAs(page, request, account.username, account.password)

  await expect(page.getByText('進階報表', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('統計報表', { exact: true })).toBeVisible()
  await expect(page.getByText('操作紀錄', { exact: true })).toBeVisible()
  await expect(page.getByText('類別管理', { exact: true })).toBeVisible()
  await expect(page.getByText('系統設定', { exact: true })).toBeVisible()
  await expect(page.getByText('帳號維護', { exact: true })).toHaveCount(0)
  await expect(page.getByText('員工交接', { exact: true })).toHaveCount(0)
  await expect(page.getByText('每日日誌', { exact: true })).toHaveCount(0)

  await page.goto('/reports')
  await expect(page.getByText('Decision Analytics', { exact: true })).toBeVisible()

  await page.goto('/expenses')
  await expect(page.getByRole('heading', { name: '收支統計' })).toBeVisible()
  await page.getByRole('tab', { name: '預算管理' }).click()
  await expect(page.getByRole('button', { name: '設定預算' })).toBeVisible()

  await page.goto('/admin/audit-logs')
  await expect(page.getByText('Audit Trail', { exact: true })).toBeVisible()

  await page.goto('/admin/categories')
  await expect(page.getByText('Taxonomy Studio', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增類型' })).toHaveCount(0)

  await page.goto('/petitions/stats')
  await expect(page.getByText('陳情統計報表', { exact: true })).toBeVisible()

  await page.goto('/print/voters')
  await expect(page.getByText('選民名冊列印', { exact: true })).toBeVisible()

  await page.goto('/admin/handover')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()

  await page.goto('/admin/daily-log')
  await expect(page.getByText('權限不足', { exact: true })).toBeVisible()
})
