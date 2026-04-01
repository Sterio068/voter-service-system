import React from 'react'

// F-4: Persisted filter state hook
export function usePersistedState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [state, setState] = React.useState<T>(() => {
    try {
      const stored = localStorage.getItem(`report_filter_${key}`)
      return stored ? JSON.parse(stored) : defaultValue
    } catch { return defaultValue }
  })
  const setAndPersist = (v: T) => {
    setState(v)
    try { localStorage.setItem(`report_filter_${key}`, JSON.stringify(v)) } catch {}
  }
  return [state, setAndPersist]
}

// C-1: PDF export helper
export function exportToPDF(title: string, content: string) {
  const printWin = window.open('', '_blank')
  if (!printWin) return
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Microsoft JhengHei', '微軟正黑體', sans-serif; padding: 20px; color: #333; }
        h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        h2 { font-size: 16px; margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: bold; }
        .stat-row { display: flex; gap: 20px; margin: 10px 0; }
        .stat-item { flex: 1; text-align: center; border: 1px solid #eee; padding: 10px; border-radius: 4px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1890ff; }
        .stat-label { font-size: 12px; color: #666; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>${content}</body>
    </html>
  `)
  printWin.document.close()
  setTimeout(() => { printWin.print() }, 500)
}

export const COLORS = ['#007AFF','#52c41a','#fa8c16','#f5222d','#722ed1','#13c2c2','#eb2f96','#faad14']
export const MONTH_NAMES = ['01月','02月','03月','04月','05月','06月','07月','08月','09月','10月','11月','12月']
