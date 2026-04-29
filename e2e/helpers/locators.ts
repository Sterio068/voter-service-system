/**
 * Defensive locator helpers for Playwright + Antd + CJK UI.
 *
 * Why this file exists
 * ====================
 * We've already burned through 3 CI retries on selector collisions:
 *
 * 1. v1.0.19: `getByLabel('姓名')` matched both the form field and the
 *    voter list `<Input.Search>` because the search input's aria-label
 *    contained the substring '姓名'. Fixed by shortening search labels.
 *
 * 2. v1.0.23: `getByRole('button', { name: '儲存' })` matched both the
 *    form's `儲存` button AND the new SavedFiltersBar's `儲存目前篩選`
 *    button. `exact: true` didn't help because Antd inserts a space
 *    between two-CJK-char labels — the form button's accessible name
 *    is actually `儲 存`, not `儲存`. Fixed via /^儲\s*存$/.
 *
 * 3. (latent) Any future page that adds a search field whose
 *    aria-label includes a form-field name (e.g. '搜尋活動名稱') will
 *    immediately break the smoke test for that form.
 *
 * Use these helpers instead of bare getByRole / getByLabel for CJK
 * button labels and form fields, and the collisions go away.
 */
import type { Locator, Page } from '@playwright/test'

/**
 * Build a regex that matches a 2-character CJK button label, allowing
 * for the optional space Antd injects between the chars.
 *
 *   formButtonName('儲存') → /^儲\s*存$/
 *   formButtonName('送出') → /^送\s*出$/
 *
 * Anchored with `^...$` so it does NOT match longer labels like
 * '儲存目前篩選' or '送出回覆'. For 3+ char labels, we don't need the
 * regex — exact: true works because Antd only inserts the space for
 * exactly 2-char labels.
 */
export function formButtonName(label: string): RegExp | { name: string; exact: true } {
  if (label.length === 2 && /^[一-鿿]+$/.test(label)) {
    return new RegExp(`^${label[0]}\\s*${label[1]}$`)
  }
  return { name: label, exact: true } as never
}

/**
 * Click a form button by visible label, robust to:
 *  - Antd's CJK-2-char space insertion
 *  - long-label collisions (e.g. '儲存' vs '儲存目前篩選')
 *  - multiple buttons with similar prefixes
 *
 * Pass a `scope` (typically a Drawer / Modal / form Locator) to scope
 * to a specific dialog when the page has buttons of the same name in
 * multiple places.
 *
 *   await clickFormButton(page, '儲存')
 *   await clickFormButton(page, '送出')
 *   await clickFormButton(page, '送出', dialog)
 */
export async function clickFormButton(
  scope: Page | Locator,
  label: string,
): Promise<void> {
  const matcher = formButtonName(label)
  if (matcher instanceof RegExp) {
    await scope.getByRole('button', { name: matcher }).click()
    return
  }
  await scope.getByRole('button', { name: matcher.name, exact: matcher.exact }).click()
}

/**
 * Fill a form field by label, scoped to a dialog/drawer when given.
 * Falls back to the page itself for fields not inside a dialog.
 *
 * NEVER use page.getByLabel directly for CJK form labels — search
 * inputs whose aria-label or placeholder include the same CJK fragment
 * will collide.
 */
export async function fillFormField(
  scope: Page | Locator,
  label: string,
  value: string,
): Promise<void> {
  await scope.getByLabel(label, { exact: true }).fill(value)
}

/**
 * Convention notes for new e2e specs
 * ===================================
 * - For a 2-char CJK button label, prefer `clickFormButton(page, '送出')`
 *   over `page.getByRole('button', ...)`.
 * - For a form field with a CJK label, prefer
 *   `fillFormField(dialog, '姓名', value)` over
 *   `page.getByLabel('姓名').fill(value)`.
 * - When a page has both a search input and a form with the same word
 *   (e.g. voters page has `aria-label="搜尋選民"` AND a form `姓名`),
 *   ALWAYS scope the form fill to the Drawer / Modal locator.
 * - When you add a NEW aria-label on an `<Input.Search>`, keep it to
 *   `搜尋<noun>` only. Do NOT include the form-field words —
 *   placeholder is for that.
 */
