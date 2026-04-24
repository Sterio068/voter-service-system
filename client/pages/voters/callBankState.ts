export type CallBankResultState = {
  actionLabel: string
  kind: 'empty-pool' | 'session-complete'
  subTitle: string
  title: string
}

type CallBankResultStateInput = {
  inactivityDays?: number
  sessionAnswered: number
  sessionCount: number
}

export function getCallBankResultState({
  inactivityDays = 30,
  sessionAnswered,
  sessionCount,
}: CallBankResultStateInput): CallBankResultState {
  if (sessionCount === 0) {
    return {
      kind: 'empty-pool',
      title: `目前沒有符合 ${inactivityDays} 天未聯絡條件的待撥名單`,
      subTitle: '可稍後重新整理，或先到進階報表查看未聯絡名單再安排電訪。',
      actionLabel: '重新整理名單',
    }
  }

  return {
    kind: 'session-complete',
    title: '本批次完成！',
    subTitle: `共撥打 ${sessionCount} 通，接通 ${sessionAnswered} 通`,
    actionLabel: '載入下一批',
  }
}
