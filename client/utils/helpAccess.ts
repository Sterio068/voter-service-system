import type { UserRole } from '../../shared/types'
import {
  rolePermissions,
  type PermissionAction,
  type PermissionModule,
} from '../../shared/permissions'
import { canAccessFeature, type AppFeature } from './permissions'

type HelpAccessSpec = {
  label: string
  module?: PermissionModule
  feature?: AppFeature
}

export const HELP_ACCESS_SPECS: readonly HelpAccessSpec[] = [
  { label: '選民資料', module: 'voters' },
  { label: '團體管理', module: 'groups' },
  { label: '陳情案件', module: 'petitions' },
  { label: '公文管理', module: 'documents' },
  { label: '行程管理', module: 'schedules' },
  { label: '禮儀記錄', module: 'ceremonies' },
  { label: '廠商管理', module: 'vendors' },
  { label: '收支統計', module: 'expenses', feature: 'expenses' },
  { label: '待辦事項', module: 'tasks' },
  { label: '活動管理', module: 'events' },
  { label: '問卷調查', module: 'surveys', feature: 'surveys' },
  { label: '通知中心', module: 'notifications', feature: 'notifications' },
  { label: '進階報表', module: 'reports', feature: 'reports' },
  { label: '提案追蹤', module: 'proposals' },
  { label: '帳號維護', module: 'users', feature: 'adminUsers' },
  { label: '操作紀錄', module: 'audit_logs', feature: 'auditLogs' },
  { label: '類別管理', module: 'categories', feature: 'categories' },
  { label: '系統設定', module: 'settings', feature: 'settings' },
  { label: '員工交接', feature: 'handover' },
  { label: '每日日誌', feature: 'dailyLogs' },
  { label: 'AI 助理', module: 'ai' },
] as const

const ROLE_ORDER: readonly UserRole[] = ['admin', 'supervisor', 'assistant', 'volunteer']

export function summarizeAccessActions(actions: readonly PermissionAction[]): string {
  const actionSet = new Set(actions)

  if (actionSet.size === 0) return '❌'
  if (actionSet.has('use')) return '🤖 可使用'
  if (actionSet.size === 1 && actionSet.has('view')) return '👁 僅檢視'

  if (actionSet.has('create') && actionSet.has('edit') && actionSet.has('delete')) {
    return '✅ 完整'
  }

  if (actionSet.has('create') && actionSet.has('edit')) {
    return '✍️ 新增/編輯'
  }

  if (actionSet.has('edit')) {
    return '✏️ 檢視/編修'
  }

  if (actionSet.has('view') && actionSet.has('export')) {
    return '👁 檢視/匯出'
  }

  if (actionSet.has('view')) {
    return '👁 僅檢視'
  }

  return '✅ 可使用'
}

export function getHelpAccessLabel(role: UserRole, spec: HelpAccessSpec): string {
  if (spec.feature && !canAccessFeature(role, spec.feature)) {
    return '❌'
  }

  if (!spec.module) {
    return '✅ 可使用'
  }

  return summarizeAccessActions(rolePermissions[role][spec.module])
}

export function buildHelpRoleData() {
  return HELP_ACCESS_SPECS.map((spec) => ({
    module: spec.label,
    admin: getHelpAccessLabel('admin', spec),
    supervisor: getHelpAccessLabel('supervisor', spec),
    assistant: getHelpAccessLabel('assistant', spec),
    volunteer: getHelpAccessLabel('volunteer', spec),
  }))
}

export function getRoleOrder() {
  return [...ROLE_ORDER]
}
