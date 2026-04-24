import { expect, test } from '@playwright/test'
import { authenticate } from './helpers/session'

const routeChecks = [
  { path: '/', marker: 'Today Command Center' },
  { path: '/petitions', marker: 'Case Service' },
  { path: '/petitions/stats', marker: 'Print Report' },
  { path: '/voters', marker: 'Voter CRM' },
  { path: '/call-bank', marker: 'Call Desk' },
  { path: '/voters/call-bank', marker: 'Call Desk' },
  { path: '/merge', marker: 'Data Hygiene' },
  { path: '/voters/merge', marker: 'Data Hygiene' },
  { path: '/groups', marker: 'Community Graph' },
  { path: '/documents', marker: 'Document Desk' },
  { path: '/schedules', marker: 'Calendar Ops' },
  { path: '/ceremonies', marker: 'Ceremony Ledger' },
  { path: '/vendors', marker: 'Vendor Network' },
  { path: '/expenses', marker: 'Expense Intelligence' },
  { path: '/proposals', marker: 'Proposal Tracker' },
  { path: '/tasks', marker: 'Task Queue' },
  { path: '/events', marker: 'Field Events' },
  { path: '/surveys', marker: 'Survey Lab' },
  { path: '/notifications', marker: 'Broadcast Center' },
  { path: '/reports', marker: 'Decision Analytics' },
  { path: '/print/voters', marker: 'Print Studio' },
  { path: '/print/labels', marker: 'Label Studio' },
  { path: '/admin/users', marker: 'Access Control' },
  { path: '/admin/audit-logs', marker: 'Audit Trail' },
  { path: '/admin/categories', marker: 'Taxonomy Studio' },
  { path: '/admin/settings', marker: 'System Governance' },
  { path: '/admin/handover', marker: 'Handover Control' },
  { path: '/admin/daily-log', marker: 'Daily Brief' },
  { path: '/help', marker: 'Guide Center' },
]

test('admin can open every primary route without an app shell crash', async ({ page, request }) => {
  await authenticate(page, request)

  for (const route of routeChecks) {
    await test.step(`open ${route.path}`, async () => {
      await page.goto(route.path)
      await expect(page.getByText(route.marker, { exact: true }).first()).toBeVisible()
      await expect(page.getByText('應用程式發生錯誤')).toHaveCount(0)
    })
  }
})
