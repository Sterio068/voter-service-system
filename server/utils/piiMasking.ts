function normalizeNullable(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function maskMiddle(value: unknown, prefixLength: number, suffixLength: number): string {
  const text = normalizeNullable(value)
  if (!text) return ''
  if (text.length <= prefixLength + suffixLength) {
    if (text.length <= 2) return '*'.repeat(text.length)
    return `${text.slice(0, 1)}${'*'.repeat(Math.max(1, text.length - 4))}${text.slice(-3)}`
  }
  const suffix = suffixLength > 0 ? text.slice(-suffixLength) : ''
  return `${text.slice(0, prefixLength)}${'*'.repeat(text.length - prefixLength - suffixLength)}${suffix}`
}

export function maskIdNumber(value: unknown): string {
  return maskMiddle(value, 1, 3)
}

export function maskMobile(value: unknown): string {
  const text = normalizeNullable(value)
  if (!text) return ''
  return text.startsWith('+') ? maskMiddle(text, 5, 3) : maskMiddle(text, 4, 3)
}

export function maskPhone(value: unknown): string {
  return maskMiddle(value, 3, 3)
}

export function maskLineId(value: unknown): string {
  return maskMiddle(value, 1, 0)
}

export function maskEmail(value: unknown): string {
  const text = normalizeNullable(value)
  if (!text) return ''
  const at = text.indexOf('@')
  if (at <= 0) return maskMiddle(text, 1, 0)
  const local = text.slice(0, at)
  const domain = text.slice(at)
  if (local.length <= 1) return `*${domain}`
  return `${local.slice(0, 1)}${'*'.repeat(local.length - 1)}${domain}`
}

export function maskBirthDate(value: unknown): string {
  const text = normalizeNullable(value)
  const match = text.match(/^(\d{4})-\d{2}-\d{2}$/)
  return match ? `${match[1]}-**-**` : text ? '***' : ''
}

export function maskAddress(value: unknown): string {
  return normalizeNullable(value) ? '***' : ''
}

export function maskVoterExportRecord<T extends Record<string, any>>(voter: T): T {
  return {
    ...voter,
    birth_date: maskBirthDate(voter.birth_date),
    id_number: maskIdNumber(voter.id_number),
    mobile: maskMobile(voter.mobile),
    phone: maskPhone(voter.phone),
    line_id: maskLineId(voter.line_id),
    email: maskEmail(voter.email),
    household_address: maskAddress(voter.household_address),
    mailing_address: maskAddress(voter.mailing_address),
  }
}
