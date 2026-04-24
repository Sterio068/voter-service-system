import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildInlineContentDisposition,
  extensionForAttachmentMime,
  isAllowedAttachmentContent,
  sanitizeDisplayFileName,
} from '../../server/utils/fileSecurity'

test('sanitizeDisplayFileName strips path fragments and unsafe header characters', () => {
  assert.equal(sanitizeDisplayFileName('../evil\r\n.pdf'), 'evil__.pdf')
  assert.equal(sanitizeDisplayFileName('C:\\temp\\photo.jpg'), 'photo.jpg')
})

test('extensionForAttachmentMime does not trust uploaded file extensions', () => {
  assert.equal(extensionForAttachmentMime('application/pdf'), '.pdf')
  assert.equal(extensionForAttachmentMime('image/png'), '.png')
  assert.equal(extensionForAttachmentMime('text/html'), '.bin')
})

test('isAllowedAttachmentContent checks basic file signatures', () => {
  assert.equal(isAllowedAttachmentContent('application/pdf', Buffer.from('%PDF-1.7')), true)
  assert.equal(isAllowedAttachmentContent('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true)
  assert.equal(isAllowedAttachmentContent('application/pdf', Buffer.from('<html></html>')), false)
  assert.equal(isAllowedAttachmentContent('text/html', Buffer.from('<html></html>')), false)
})

test('buildInlineContentDisposition emits a safe UTF-8 filename parameter', () => {
  const header = buildInlineContentDisposition('測試報告.pdf')

  assert.match(header, /^inline; filename="/)
  assert.match(header, /filename\*=UTF-8''/)
  assert.doesNotMatch(header, /\r|\n/)
})
