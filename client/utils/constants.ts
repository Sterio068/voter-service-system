// Shared constants used across multiple pages

export const PETITION_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: '#007AFF',
  closed: 'green',
  cancelled: 'default',
}

export const PETITION_STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  closed: '已結案',
  cancelled: '已取消',
}

export const URGENCY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
}

export const URGENCY_LABELS: Record<string, string> = {
  low: '低',
  normal: '一般',
  high: '高',
  urgent: '緊急',
}

export const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  in_progress: 'blue',
  done: 'green',
  cancelled: 'default',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: '待辦',
  in_progress: '進行中',
  done: '已完成',
  cancelled: '已取消',
}

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
}

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  normal: '一般',
  high: '高',
  urgent: '緊急',
}

export const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  completed: 'green',
  cancelled: 'default',
}

export const DOC_STATUS_LABELS: Record<string, string> = {
  pending: '待辦',
  processing: '處理中',
  completed: '已完成',
  cancelled: '已取消',
}

export const SCHEDULE_TYPE_COLORS: Record<string, string> = {
  meeting: '#007AFF', visit: '#52c41a', inspection: '#fa8c16',
  event: '#722ed1', dinner: '#13c2c2', ceremony: '#eb2f96',
  hearing: '#faad14', consultation: '#fa541c', other: '#8c8c8c',
}

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  meeting: '會議', visit: '拜訪', inspection: '會勘',
  event: '活動', dinner: '餐敘', ceremony: '典禮',
  hearing: '公聽會', consultation: '法律諮詢', other: '其他',
}

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理員', supervisor: '主管', assistant: '助理', volunteer: '志工',
}

export const ROLE_COLORS: Record<string, string> = {
  admin: 'red', supervisor: 'orange', assistant: 'blue', volunteer: 'green',
}

export const CHART_COLORS = [
  '#007AFF', '#52c41a', '#fa8c16', '#722ed1', '#13c2c2',
  '#eb2f96', '#faad14', '#fa541c', '#8c8c8c', '#1890ff',
]
