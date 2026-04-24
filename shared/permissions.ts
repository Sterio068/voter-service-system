import type { UserRole } from './types'

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'print' | 'use'

export type PermissionModule =
  | 'system'
  | 'admin'
  | 'users'
  | 'audit_logs'
  | 'petitions'
  | 'voters'
  | 'groups'
  | 'documents'
  | 'schedules'
  | 'tasks'
  | 'categories'
  | 'settings'
  | 'notifications'
  | 'reports'
  | 'events'
  | 'surveys'
  | 'contact_records'
  | 'proposals'
  | 'vendors'
  | 'ceremonies'
  | 'expenses'
  | 'ai'

export const rolePermissions: Record<UserRole, Record<PermissionModule, readonly PermissionAction[]>> = {
  admin: {
    system: ['view', 'create', 'edit', 'delete', 'export'],
    admin: ['view', 'create', 'edit', 'delete', 'export'],
    users: ['view', 'create', 'edit', 'delete'],
    audit_logs: ['view', 'export'],
    petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    documents: ['view', 'create', 'edit', 'delete', 'export'],
    schedules: ['view', 'create', 'edit', 'delete', 'export'],
    tasks: ['view', 'create', 'edit', 'delete', 'export'],
    categories: ['view', 'create', 'edit', 'delete'],
    settings: ['view', 'edit'],
    notifications: ['view', 'create', 'edit', 'delete', 'export'],
    reports: ['view', 'export'],
    events: ['view', 'create', 'edit', 'delete'],
    surveys: ['view', 'create', 'edit', 'delete'],
    contact_records: ['view', 'create', 'edit', 'delete'],
    proposals: ['view', 'create', 'edit', 'delete', 'export'],
    vendors: ['view', 'create', 'edit', 'delete'],
    ceremonies: ['view', 'create', 'edit', 'delete'],
    expenses: ['view', 'create', 'edit', 'delete'],
    ai: ['use', 'view'],
  },
  supervisor: {
    system: ['view'],
    admin: [],
    users: [],
    audit_logs: ['view'],
    petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    documents: ['view', 'create', 'edit', 'delete', 'export'],
    schedules: ['view', 'create', 'edit', 'delete', 'export'],
    tasks: ['view', 'create', 'edit', 'delete'],
    categories: ['view'],
    settings: ['view'],
    notifications: ['view', 'create', 'edit'],
    reports: ['view', 'export'],
    events: ['view', 'create', 'edit', 'delete'],
    surveys: ['view', 'create', 'edit'],
    contact_records: ['view', 'create', 'edit'],
    proposals: ['view', 'create', 'edit', 'delete', 'export'],
    vendors: ['view', 'create', 'edit'],
    ceremonies: ['view', 'create', 'edit'],
    expenses: ['view', 'create', 'edit'],
    ai: ['use', 'view'],
  },
  assistant: {
    system: [],
    admin: [],
    users: [],
    audit_logs: [],
    petitions: ['view', 'create', 'edit'],
    voters: ['view', 'create', 'edit'],
    groups: ['view', 'create', 'edit'],
    documents: ['view', 'create', 'edit'],
    schedules: ['view', 'create', 'edit'],
    tasks: ['view', 'create', 'edit'],
    categories: ['view'],
    settings: ['view'],
    notifications: ['view'],
    reports: ['view'],
    events: ['view', 'create', 'edit'],
    surveys: ['view'],
    contact_records: ['view', 'create', 'edit'],
    proposals: ['view', 'create', 'edit'],
    vendors: ['view'],
    ceremonies: ['view'],
    expenses: ['view'],
    ai: ['use'],
  },
  volunteer: {
    system: [],
    admin: [],
    users: [],
    audit_logs: [],
    petitions: ['view'],
    voters: ['view'],
    groups: ['view'],
    documents: ['view'],
    schedules: ['view'],
    tasks: ['view'],
    categories: ['view'],
    settings: [],
    notifications: [],
    reports: [],
    events: ['view'],
    surveys: [],
    contact_records: ['view'],
    proposals: ['view'],
    vendors: ['view'],
    ceremonies: ['view'],
    expenses: [],
    ai: [],
  },
}

export function hasPermission(
  role: UserRole | null | undefined,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  return !!role && rolePermissions[role][module].includes(action)
}
