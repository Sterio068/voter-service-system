// Excel formula injection 防護：CSV/XLSX 儲存格首字若為 =+−@\t\r 之一，
// Excel/Numbers/LibreOffice 開啟時會解釋為公式。所有來自使用者輸入或拼接內容
// 在送進 sheet 前都應該過 safeCell()。
//
// 參考：OWASP Formula Injection / CWE-1236

const FORMULA_TRIGGER = /^[=+\-@\t\r]/

/**
 * 將任意值轉成可安全寫入 Excel 儲存格的字串。
 * - null / undefined → 空字串
 * - 數字 / 布林 → 原樣回傳（不會被解釋成公式）
 * - 字串首字若為 = + - @ Tab CR，前綴單引號避免被當公式
 * - 物件 → JSON.stringify 後同樣套上前綴規則
 */
export function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  if (str.length === 0) return ''
  if (FORMULA_TRIGGER.test(str)) return `'${str}`
  return str
}

/** 對整列套用 safeCell。常用於 aoa_to_sheet 的 row。 */
export function safeRow(row: unknown[]): Array<string | number | boolean | null> {
  return row.map(safeCell)
}
