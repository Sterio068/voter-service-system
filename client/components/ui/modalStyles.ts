import type { CSSProperties } from 'react'

export const SCROLLABLE_FORM_MODAL_STYLE: CSSProperties = {
  top: 24,
}

export const SCROLLABLE_FORM_MODAL_STYLES = {
  body: {
    maxHeight: 'calc(100vh - 240px)',
    overflowY: 'auto' as const,
    paddingRight: 8,
  },
}
