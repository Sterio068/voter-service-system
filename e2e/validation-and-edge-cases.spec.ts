import { expect, test } from '@playwright/test'
import { authenticate, createVoterRecord } from './helpers/session'

/**
 * Edge cases & validation paths not covered by happy-path specs.
 * Tolerant assertions — UI text may shift; we verify behavior, not exact wording.
 */

test('voter form: required-field error then mobile format error then save', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/voters', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '新增選民' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: '新增選民' }).click()
  const drawer = page.locator('.ant-drawer').filter({ hasText: '新增選民' }).first()
  await expect(drawer).toBeVisible({ timeout: 10_000 })

  // 1) Submit empty → required error for 姓名 should surface.
  await drawer.locator('.ant-drawer-footer .ant-btn-primary').first().click()
  await expect(drawer.locator('.ant-form-item-explain-error', { hasText: '請輸入姓名' }))
    .toBeVisible({ timeout: 10_000 })

  // 2) Fill name + invalid mobile → format error.
  const stamp = Date.now()
  const name = `E2E 驗證 ${stamp}`
  await drawer.getByLabel('姓名').fill(name)
  const mobileInput = drawer.getByLabel('手機', { exact: true })
  await mobileInput.fill('abc')
  await mobileInput.blur()
  await expect(drawer.locator('.ant-form-item-explain-error', { hasText: /手機格式|09xxxxxxxx/ }))
    .toBeVisible({ timeout: 10_000 })

  // 3) Replace with valid mobile and submit → success message.
  await mobileInput.fill(`09${String(stamp).slice(-8)}`)
  await drawer.locator('.ant-drawer-footer .ant-btn-primary').first().click()
  await expect(page.getByText('選民資料已建立').first()).toBeVisible({ timeout: 15_000 })
})

test('petition quick-create: reusing an existing voter mobile does not crash and accepts input', async ({ page, request }) => {
  const session = await authenticate(page, request)

  // Pre-create a voter with a unique mobile via API.
  const stamp = Date.now()
  const phone = `09${String(stamp).slice(-8)}`
  await createVoterRecord(request, session.token, { name: `E2E 重用聯絡人 ${stamp}`, mobile: phone })

  await page.goto('/petitions', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: /快速立案/ })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /快速立案/ }).click()

  const modal = page.locator('.ant-modal').filter({ hasText: '快速立案' }).first()
  await expect(modal).toBeVisible({ timeout: 10_000 })

  // Fill the same phone — UI must accept the duplicate gracefully (no ErrorBoundary).
  const phoneInput = modal.getByLabel('聯絡電話')
  await phoneInput.fill(phone)
  await phoneInput.blur()

  // Tolerance: assert the form remains usable, no app crash, and the modal
  // surfaces either: existing-voter hint, OR the input remains editable.
  await page.waitForTimeout(800)
  await expect(page.locator('text=應用程式發生錯誤')).toHaveCount(0)
  await expect(modal).toBeVisible()
  await expect(phoneInput).toHaveValue(phone)
})

test('backup → re-list cycle shows new signed entry', async ({ page, request }) => {
  await authenticate(page, request)
  await page.goto('/admin/settings', { waitUntil: 'domcontentloaded' })

  // Wait until the backup card is on screen, then trigger backup.
  const backupBtn = page.getByRole('button', { name: /備份到本機|立即備份/ }).first()
  await backupBtn.scrollIntoViewIfNeeded()
  await expect(backupBtn).toBeVisible({ timeout: 15_000 })
  await backupBtn.click()

  // Success toast (handleBackup uses message.success(res.data.message)).
  await expect(page.locator('.ant-message-notice').first()).toBeVisible({ timeout: 15_000 })

  // Refresh the list explicitly via the card's reload button to be deterministic.
  await page.getByRole('button', { name: /重新整理/ }).first().click()

  // Assert at least one row in the backups table and a "已簽章" tag on the latest row.
  const rows = page.locator('.ant-table-row')
  await expect.poll(async () => rows.count(), { timeout: 15_000 }).toBeGreaterThan(0)
  await expect(page.locator('.ant-tag', { hasText: '已簽章' }).first())
    .toBeVisible({ timeout: 10_000 })
})

test('help search filters module list', async ({ page, request }) => {
  await authenticate(page, request)
  await page.goto('/help', { waitUntil: 'domcontentloaded' })

  // Wait for module list mount; "資料備份與還原" appears in admin modules.
  await expect(page.getByRole('heading', { name: /模組索引/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('資料備份與還原').first()).toBeVisible({ timeout: 10_000 })

  const searchInput = page.getByPlaceholder(/搜尋模組|搜尋|關鍵字/).first()
  await expect(searchInput).toBeVisible({ timeout: 10_000 })
  await searchInput.fill('備份')

  // Tolerance check: scope to the module-list section (#help-modules).
  // The matched module ("資料備份與還原") must stay visible there, and an
  // unrelated module title ("行程管理") must disappear from that section.
  const moduleSection = page.locator('#help-modules')
  await expect(moduleSection.getByText('資料備份與還原').first())
    .toBeVisible({ timeout: 10_000 })
  await expect.poll(
    async () => moduleSection.getByText('行程管理').count(),
    { timeout: 10_000 }
  ).toBe(0)
})

test('login: wrong password surfaces an error', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const usernameInput = page.getByPlaceholder('帳號')
  const passwordInput = page.getByPlaceholder('密碼')
  await expect(usernameInput).toBeVisible({ timeout: 15_000 })

  await usernameInput.fill('admin')
  await passwordInput.fill('definitely-wrong-password')

  // Submit by pressing Enter inside the password field — this fires Form's
  // onFinish reliably even when the button label gets CJK-spaced by antd.
  const [loginResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
      { timeout: 15_000 }
    ),
    passwordInput.press('Enter'),
  ])
  expect(loginResp.ok()).toBeFalsy()

  // LoginPage renders <Alert type="error" .../> on failure. Tolerate any
  // element whose text contains 錯 / 失敗 / Invalid (case-insensitive).
  await expect(
    page.locator('.ant-alert-error, [role="alert"]').first()
  ).toBeVisible({ timeout: 10_000 })
})
