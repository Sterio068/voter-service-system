import { expect, test } from '@playwright/test'
import { authenticate, disableFirstRunWizard, getAdminSession } from './helpers/session'

test('admin can log in and open data retention controls', async ({ page, request }) => {
  const session = await getAdminSession(request)
  await disableFirstRunWizard(request, session.token)
  await page.goto('/login')
  await page.getByPlaceholder('帳號').fill('admin')
  await page.getByPlaceholder('密碼').fill(session.password)
  await page.getByRole('button', { name: /登\s*入/ }).click()
  await expect(page.getByRole('button', { name: '新增陳情' })).toBeVisible()

  await page.goto('/admin/settings')
  await expect(page.getByText('資料保留政策', { exact: true })).toBeVisible()
  await expect(page.getByText('資料保留預覽', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '執行資料保留清理' })).toBeDisabled()
})

test('dashboard command center links to today task focus', async ({ page, request }) => {
  await authenticate(page, request)

  await expect(page.getByText('Today Command Center')).toBeVisible()
  await page.getByRole('button', { name: '前往今日待辦' }).click()
  await expect(page).toHaveURL(/\/tasks\?focus=today/)
  await expect(page.getByRole('button', { name: /今日焦點/ })).toBeVisible()
})

test('primary modules share the compact product page shell', async ({ page, request }) => {
  await authenticate(page, request)

  const modules = [
    { path: '/voters', eyebrow: 'Voter CRM', toolbar: '名冊篩選' },
    { path: '/petitions', eyebrow: 'Case Service', toolbar: '案件篩選' },
    { path: '/tasks', eyebrow: 'Task Queue' },
    { path: '/documents', eyebrow: 'Document Desk', toolbar: '收文篩選' },
    { path: '/reports', eyebrow: 'Decision Analytics' },
    { path: '/admin/settings', eyebrow: 'System Governance' },
  ]

  for (const mod of modules) {
    await page.goto(mod.path)
    await expect(page.getByText(mod.eyebrow, { exact: true })).toBeVisible()
    if (mod.toolbar) await expect(page.getByText(mod.toolbar, { exact: true })).toBeVisible()
  }
})

test('voter create smoke flow works from the UI', async ({ page, request }) => {
  await authenticate(page, request)
  const stamp = Date.now()
  const voterName = `E2E 測試選民 ${stamp}`
  const voterMobile = `09${String(stamp).slice(-8)}`

  await page.goto('/voters')
  await page.getByRole('button', { name: '新增選民' }).click()
  await expect(page.getByText('基本資料', { exact: true })).toBeVisible()
  await expect(page.getByText('戶籍資料', { exact: true })).toBeVisible()
  await page.getByLabel('姓名').fill(voterName)
  await page.getByLabel('手機').fill(voterMobile)
  // Antd 在兩字 CJK 按鈕中間插入 space（'儲 存'），所以用 regex 容許可選
  // 空白；anchor `^...$` 同時排除「儲存目前篩選」與「儲存並繼續新增」。
  await page.getByRole('button', { name: /^儲\s*存$/ }).click()
  await expect(page.getByText('選民資料已建立')).toBeVisible()
  await expect(page.getByText(voterName, { exact: true }).first()).toBeVisible()
})

test('petition create smoke flow works from the UI', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const content = `E2E 陳情內容 ${stamp}`
  const contactName = `E2E 陳情人 ${stamp}`
  const contactPhone = `09${String(stamp + 1).slice(-8)}`
  await page.goto('/petitions')
  await page.getByRole('button', { name: '新增陳情' }).click()
  await expect(page.getByText('陳情人與案件內容', { exact: true })).toBeVisible()
  await expect(page.getByText('處理區域', { exact: true })).toBeVisible()
  await page.getByLabel('陳情人姓名').fill(contactName)
  await page.getByLabel('聯絡電話').fill(contactPhone)
  await page.getByLabel('陳情內容').fill(content)
  await page.getByRole('button', { name: /送\s*出/ }).click()
  await expect(page.getByText('陳情案件已建立')).toBeVisible()
  await expect(page.getByText(content)).toBeVisible()
})

test('event create flow validates date in the UI and can save a dated activity', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const title = `E2E 活動 ${stamp}`
  const eventDate = '2026-04-30'

  await page.goto('/events')
  await page.getByRole('button', { name: '新增活動' }).click()
  await page.getByLabel('活動名稱').fill(title)
  await page.getByRole('button', { name: /儲\s*存/ }).click()
  await expect(page.getByText('請選擇活動日期')).toBeVisible()

  await page.getByPlaceholder('開始日期').fill(eventDate)
  await page.getByPlaceholder('結束日期').fill(eventDate)
  await page.getByRole('button', { name: /儲\s*存/ }).click()
  await expect(page.getByText('活動已建立')).toBeVisible()
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
})

test('ceremony create flow works directly from the ceremony page', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const recipientName = `E2E 禮儀 ${stamp}`

  await page.goto('/ceremonies')
  await page.getByRole('button', { name: '新增禮儀記錄' }).click()
  const dialog = page.getByRole('dialog', { name: '新增禮儀記錄' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('受贈人').fill(recipientName)
  await page.getByRole('button', { name: /儲\s*存/ }).click()
  await expect(page.getByText('已新增', { exact: true })).toBeVisible()
  await expect(page.getByText(recipientName, { exact: true }).first()).toBeVisible()
})

test('vendor modal keeps the primary action in viewport', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/vendors')
  await page.getByRole('button', { name: '新增廠商' }).click()

  const dialog = page.getByRole('dialog', { name: '新增廠商' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.ant-modal-footer .ant-btn-primary')).toBeInViewport()
})

test('proposal modal keeps the primary action in viewport', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/proposals')
  await page.getByRole('button', { name: '新增提案' }).click()

  const dialog = page.getByRole('dialog', { name: '新增提案' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.ant-modal-footer .ant-btn-primary')).toBeInViewport()
})

test('backup smoke flow creates a signed backup from settings', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/admin/settings')
  await page.getByRole('button', { name: '備份到本機' }).click()
  await expect(page.getByText('備份完成', { exact: true })).toBeVisible()
  await expect(page.getByText('已簽章').first()).toBeVisible()
})

test('full voter export requires a reason and produces a download', async ({ page, request }) => {
  const session = await authenticate(page, request)
  await request.post('http://127.0.0.1:8080/api/voters', {
    headers: { authorization: `Bearer ${session.token}` },
    data: { name: 'E2E 匯出選民', mobile: '0966666666' },
  })

  await page.goto('/voters')
  await page.getByRole('button', { name: '完整匯出' }).click()
  await expect(page.getByText('完整個資匯出')).toBeVisible()
  await page.getByRole('button', { name: '確認完整匯出' }).click()
  await expect(page.getByText('請填寫完整匯出理由')).toBeVisible()
  await page.getByLabel('完整匯出理由').fill('E2E 測試完整匯出流程')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '確認完整匯出' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/voters_\d{8}\.xlsx/)
})

test('schedule print modal can export a Word itinerary', async ({ page, request }) => {
  const session = await authenticate(page, request)
  const today = new Date().toISOString().slice(0, 10)

  await request.post('http://127.0.0.1:8080/api/schedules', {
    headers: { authorization: `Bearer ${session.token}` },
    data: {
      title: `E2E 行程匯出 ${Date.now()}`,
      start_time: `${today} 09:00:00`,
      end_time: `${today} 10:00:00`,
      schedule_type: 'meeting',
      location: '第一會議室',
      status: 'scheduled',
    },
  })

  await page.goto('/schedules')
  await page.getByRole('button', { name: '列印行程' }).click()
  await expect(page.getByText('列印行程表', { exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 Word' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
})

test('reports export opens a printable monthly report popup', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/reports')
  await page.getByRole('button', { name: '匯出月報' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('月報匯出設定', { exact: true })).toBeVisible()
  await dialog.getByPlaceholder(/例如：本月陳情量/).fill('E2E 月報匯出測試')

  const popupPromise = page.waitForEvent('popup')
  await dialog.getByRole('button', { name: '確認匯出月報' }).click()
  const popup = await popupPromise

  await expect(popup.getByText(/年度選民服務工作報告/)).toBeVisible()
})

test('voter merge page can preview duplicate candidates before merge', async ({ page, request }) => {
  const session = await authenticate(page, request)
  const stamp = Date.now()
  const duplicateName = `E2E 合併候選 ${stamp}`

  for (const mobileSuffix of ['11', '22']) {
    await request.post('http://127.0.0.1:8080/api/voters', {
      headers: { authorization: `Bearer ${session.token}` },
      data: {
        name: duplicateName,
        mobile: `09${String(stamp).slice(-6)}${mobileSuffix}`,
        household_district: '大安區',
      },
    })
  }

  await page.goto('/voters/merge')
  const row = page.locator('tr', { hasText: duplicateName }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '合併' }).click()

  await expect(page.getByRole('button', { name: '確認合併' })).toBeVisible()
  await expect(page.getByText('將轉移陳情')).toBeVisible()
  await expect(page.getByText('將整併參與度')).toBeVisible()
  await expect(page.getByText('將轉移活躍歷程')).toBeVisible()
  await expect(page.getByText('將轉移團體成員')).toBeVisible()
})
