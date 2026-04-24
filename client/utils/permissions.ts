import type { UserRole } from '../../shared/types'
import {
  hasPermission as hasSharedPermission,
  type PermissionAction,
  type PermissionModule,
} from '../../shared/permissions'

export type AppFeature =
  | 'callBank'
  | 'voterMerge'
  | 'expenses'
  | 'surveys'
  | 'notifications'
  | 'reports'
  | 'petitionStats'
  | 'printVoters'
  | 'printLabels'
  | 'adminUsers'
  | 'auditLogs'
  | 'categories'
  | 'settings'
  | 'handover'
  | 'dailyLogs'

export type AppAction =
  | 'createPetition'
  | 'createVoter'
  | 'createTask'

const FEATURE_ACCESS: Record<AppFeature, readonly UserRole[]> = {
  callBank: ['admin', 'supervisor', 'assistant', 'volunteer'],
  voterMerge: ['admin', 'supervisor'],
  expenses: ['admin', 'supervisor', 'assistant'],
  surveys: ['admin', 'supervisor', 'assistant'],
  notifications: ['admin', 'supervisor', 'assistant'],
  reports: ['admin', 'supervisor', 'assistant'],
  petitionStats: ['admin', 'supervisor'],
  printVoters: ['admin', 'supervisor'],
  printLabels: ['admin', 'supervisor'],
  adminUsers: ['admin'],
  auditLogs: ['admin', 'supervisor'],
  categories: ['admin', 'supervisor', 'assistant'],
  settings: ['admin', 'supervisor'],
  handover: ['admin'],
  dailyLogs: ['admin'],
}

const ACTION_ACCESS: Record<AppAction, { module: PermissionModule; action: PermissionAction }> = {
  createPetition: { module: 'petitions', action: 'create' },
  createVoter: { module: 'voters', action: 'create' },
  createTask: { module: 'tasks', action: 'create' },
}

export function canAccessFeature(role: UserRole | null | undefined, feature: AppFeature): boolean {
  return !!role && FEATURE_ACCESS[feature].includes(role)
}

export function canPerformAction(role: UserRole | null | undefined, action: AppAction): boolean {
  const requirement = ACTION_ACCESS[action]
  return hasSharedPermission(role, requirement.module, requirement.action)
}

export function hasModulePermission(
  role: UserRole | null | undefined,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  return hasSharedPermission(role, module, action)
}

export function hasAnyFeatureAccess(
  role: UserRole | null | undefined,
  features: readonly AppFeature[]
): boolean {
  return features.some((feature) => canAccessFeature(role, feature))
}
