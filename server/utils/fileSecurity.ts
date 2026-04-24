import path from 'path'

export const ATTACHMENT_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
}

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set(Object.keys(ATTACHMENT_MIME_EXTENSIONS))

export function extensionForAttachmentMime(mimeType: string): string {
  return ATTACHMENT_MIME_EXTENSIONS[mimeType] || '.bin'
}

export function sanitizeDisplayFileName(fileName: string | null | undefined): string {
  const normalized = String(fileName || 'attachment').replace(/\\/g, '/')
  const base = path.basename(normalized).replace(/[\r\n"]/g, '_').trim()
  return (base || 'attachment').slice(0, 180)
}

export function buildInlineContentDisposition(fileName: string): string {
  const safeName = sanitizeDisplayFileName(fileName)
  const asciiFallback = safeName.replace(/[^\x20-\x7E]/g, '_')
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false
  return signature.every((byte, index) => buffer[index] === byte)
}

export function isAllowedAttachmentContent(mimeType: string, buffer: Buffer): boolean {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) return false
  if (buffer.length === 0) return false

  if (mimeType === 'application/pdf') return startsWith(buffer, [0x25, 0x50, 0x44, 0x46])
  if (mimeType === 'image/jpeg') return startsWith(buffer, [0xff, 0xd8, 0xff])
  if (mimeType === 'image/png') return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mimeType === 'image/gif') return buffer.subarray(0, 6).toString('ascii') === 'GIF87a'
    || buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    const brand = buffer.subarray(4, 32).toString('ascii')
    return brand.includes('ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'].some(item => brand.includes(item))
  }

  return false
}
