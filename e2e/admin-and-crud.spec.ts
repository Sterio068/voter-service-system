import { expect, test } from '@playwright/test'
import { authenticate } from './helpers/session'

/**
 * Critical e2e flows currently missing per audit:
 * - Daily log: no E2E coverage
 * - Handover: no E2E coverage (admin-only, render-only)
 * - Vendor CRUD: only modal viewport tested
 * - Proposal CRUD: only modal viewport tested
 */

test('admin can create and retrieve a daily log entry', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const highlightText = `E2E 日誌亮點 ${stamp}`

  await page.goto('/admin/daily-log', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Daily Brief', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '每日工作日誌' })).toBeVisible()

  // Fill the highlights field with a uniquely-stamped note and save.
  await page.getByLabel('重要事項/亮點').fill(highlightText)
  await page.getByRole('button', { name: /儲存日誌/ }).click()
  await expect(page.getByText('日誌已儲存')).toBeVisible()

  // Refresh the page; the saved highlight should still appear in the form
  // for today (the page loads today's log on mount).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '每日工作日誌' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('重要事項/亮點')).toHaveValue(highlightText)

  // The "最近日誌" sidebar should also list today's entry — assert via the
  // sidebar card (scoped) so we don't collide with the textarea content.
  const recentCard = page.locator('.ant-card', { hasText: '最近日誌' })
  await expect(recentCard).toBeVisible()
  await expect(recentCard.getByText(highlightText.slice(0, 30))).toBeVisible()
})

test('admin can render the staff handover page selectors', async ({ page, request }) => {
  await authenticate(page, request)

  await page.goto('/admin/handover', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Handover Control', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '員工交接' })).toBeVisible()

  // Page should not crash into an ErrorBoundary.
  await expect(page.locator('text=應用程式發生錯誤')).toHaveCount(0)

  // Source / target user selectors must render. Scope to the main content
  // (the sidebar nav also contains "員工交接" / "離職員工").
  const main = page.locator('main')
  await expect(main.getByText('離職員工', { exact: true })).toBeVisible()
  await expect(main.getByText('繼承員工', { exact: true })).toBeVisible()
  await expect(main.getByText('員工離職交接', { exact: true })).toBeVisible()

  // The destructive transfer trigger should render but be disabled until both selectors are filled.
  // (We deliberately do NOT execute a transfer — that mutation is destructive in shared test DB.)
  await expect(page.getByRole('button', { name: '執行交接' })).toBeDisabled()
})

test('admin can create and edit a vendor', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const initialName = `E2E 廠商 ${stamp}`
  const editedName = `${initialName} 編輯`

  await page.goto('/vendors', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Vendor Network', { exact: true })).toBeVisible({ timeout: 15_000 })

  // Create a new vendor via the page header action.
  await page.getByRole('button', { name: '新增廠商' }).click()
  const createDialog = page.getByRole('dialog', { name: '新增廠商' })
  await expect(createDialog).toBeVisible()
  await createDialog.getByLabel('廠商名稱').fill(initialName)
  // antd injects a space between two CJK chars on buttons ("儲 存"); match either form.
  await createDialog.locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(page.getByText('廠商已新增')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(initialName) })).toBeVisible()

  // Edit the vendor we just created via its row's 編輯 button.
  const row = page.locator('tr', { hasText: initialName }).first()
  await row.getByRole('button', { name: /編\s*輯/ }).click()
  const editDialog = page.getByRole('dialog', { name: '編輯廠商' })
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel('廠商名稱').fill(editedName)
  await editDialog.locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(page.getByText('已更新', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(editedName) })).toBeVisible()
})

test('admin can create a proposal', async ({ page, request }) => {
  await authenticate(page, request)

  const stamp = Date.now()
  const title = `E2E 提案主旨 ${stamp}`
  const proposalDate = '2026-04-30'

  await page.goto('/proposals', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Proposal Tracker', { exact: true })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: '新增提案' }).click()
  const dialog = page.getByRole('dialog', { name: '新增提案' })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('提案主旨').fill(title)
  // antd DatePicker accepts typed input; press Enter to commit.
  await dialog.getByLabel('提案日期').fill(proposalDate)
  await dialog.getByLabel('提案日期').press('Enter')

  // antd injects a space between two CJK chars on buttons ("儲 存"); use the primary footer button.
  await dialog.locator('.ant-modal-footer .ant-btn-primary').click()
  await expect(page.getByText('提案已新增')).toBeVisible()
  await expect(page.getByRole('button', { name: title })).toBeVisible()
})
