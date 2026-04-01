import { useEffect } from 'react'

interface ShortcutAction {
  key: string
  ctrl?: boolean
  shift?: boolean
  description: string
  action: () => void
}

export function useKeyboardShortcuts(shortcuts: ShortcutAction[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true
        // shift: true → 需要按 Shift; shift: false → 不能按 Shift; undefined → 忽略 Shift 狀態
        const shiftMatch = shortcut.shift === undefined ? true : (shortcut.shift ? e.shiftKey : !e.shiftKey)
        if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch) {
          e.preventDefault()
          shortcut.action()
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}

export type { ShortcutAction }
