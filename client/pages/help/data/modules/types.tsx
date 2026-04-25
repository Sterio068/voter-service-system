import React from 'react'
import type { HelpCategory } from '../../components/primitives'

export type HelpModule = {
  id: string
  title: string
  icon: React.ReactNode
  color: string
  category: HelpCategory
  /** Free-text keywords for search */
  keywords: string
  summary: string
  content: () => React.ReactNode
}
