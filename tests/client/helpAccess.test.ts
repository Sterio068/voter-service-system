import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildHelpRoleData,
  getHelpAccessLabel,
  HELP_ACCESS_SPECS,
  summarizeAccessActions,
} from '../../client/utils/helpAccess'

function getSpec(label: string) {
  const spec = HELP_ACCESS_SPECS.find((item) => item.label === label)
  assert.ok(spec, `missing help access spec for ${label}`)
  return spec
}

test('help access labels summarize common permission patterns', () => {
  assert.equal(summarizeAccessActions(['view']), '👁 僅檢視')
  assert.equal(summarizeAccessActions(['view', 'create', 'edit']), '✍️ 新增/編輯')
  assert.equal(summarizeAccessActions(['view', 'create', 'edit', 'delete']), '✅ 完整')
  assert.equal(summarizeAccessActions(['view', 'export']), '👁 檢視/匯出')
})

test('help role matrix respects both feature gates and module permissions', () => {
  assert.equal(getHelpAccessLabel('assistant', getSpec('系統設定')), '❌')
  assert.equal(getHelpAccessLabel('assistant', getSpec('類別管理')), '👁 僅檢視')
  assert.equal(getHelpAccessLabel('assistant', getSpec('進階報表')), '👁 僅檢視')
  assert.equal(getHelpAccessLabel('assistant', getSpec('禮儀記錄')), '👁 僅檢視')
  assert.equal(getHelpAccessLabel('volunteer', getSpec('公文管理')), '👁 僅檢視')
  assert.equal(getHelpAccessLabel('volunteer', getSpec('類別管理')), '❌')
  assert.equal(getHelpAccessLabel('supervisor', getSpec('收支統計')), '✍️ 新增/編輯')
})

test('help role matrix includes the expanded user-facing modules', () => {
  const rows = buildHelpRoleData()
  const rowLabels = rows.map((row) => row.module)

  assert.equal(rowLabels.includes('團體管理'), true)
  assert.equal(rowLabels.includes('活動管理'), true)
  assert.equal(rowLabels.includes('問卷調查'), true)
  assert.equal(rowLabels.includes('通知中心'), true)
  assert.equal(rowLabels.includes('操作紀錄'), true)
  assert.equal(rowLabels.includes('員工交接'), true)
  assert.equal(rowLabels.includes('每日日誌'), true)
})
