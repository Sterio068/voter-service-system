import { BASIC_MODULES } from './modules/basics'
import { ADVANCED_MODULES } from './modules/advanced'
import { INTEGRATION_MODULES } from './modules/integrations'
import { ADMIN_MODULES } from './modules/admin'
import type { HelpModule } from './modules/types'

export type { HelpModule } from './modules/types'

export const HELP_MODULES: HelpModule[] = [
  ...BASIC_MODULES,
  ...ADVANCED_MODULES,
  ...INTEGRATION_MODULES,
  ...ADMIN_MODULES,
]

export const HELP_MODULES_BY_ID: Record<string, HelpModule> = HELP_MODULES.reduce(
  (acc, m) => { acc[m.id] = m; return acc },
  {} as Record<string, HelpModule>,
)
