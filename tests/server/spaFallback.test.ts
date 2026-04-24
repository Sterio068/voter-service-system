import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { sendSpaFallback } from '../../server/utils/spaFallback'

test('sendSpaFallback returns index html bytes with html content type', () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'vss-spa-fallback-'))
  const indexHtmlPath = path.join(rootDir, 'index.html')
  const html = '<!doctype html><html><body>fallback</body></html>'
  writeFileSync(indexHtmlPath, html, 'utf8')

  let contentType = ''
  let payload: Buffer | undefined
  const reply = {
    type(value: string) {
      contentType = value
      return this
    },
    send(value: Buffer) {
      payload = value
      return value
    },
  }

  try {
    sendSpaFallback(reply, indexHtmlPath)
    assert.equal(contentType, 'text/html; charset=utf-8')
    assert.ok(payload)
    assert.equal(payload.toString('utf8'), html)
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
})
