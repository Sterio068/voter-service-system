import test from 'node:test'
import assert from 'node:assert/strict'
import { getCallBankResultState } from '../../client/pages/voters/callBankState'

test('call bank uses an explicit empty-pool state before any call session starts', () => {
  assert.deepEqual(
    getCallBankResultState({ sessionCount: 0, sessionAnswered: 0 }),
    {
      kind: 'empty-pool',
      title: '目前沒有符合 30 天未聯絡條件的待撥名單',
      subTitle: '可稍後重新整理，或先到進階報表查看未聯絡名單再安排電訪。',
      actionLabel: '重新整理名單',
    },
  )
})

test('call bank keeps the completed-session summary after calls are recorded', () => {
  assert.deepEqual(
    getCallBankResultState({ sessionCount: 4, sessionAnswered: 3, inactivityDays: 45 }),
    {
      kind: 'session-complete',
      title: '本批次完成！',
      subTitle: '共撥打 4 通，接通 3 通',
      actionLabel: '載入下一批',
    },
  )
})
