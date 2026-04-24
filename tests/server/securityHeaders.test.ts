import test from 'node:test'
import assert from 'node:assert/strict'
import { applySecurityHeaders, CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from '../../server/utils/securityHeaders'

test('applySecurityHeaders sets the expected security header baseline', () => {
  const headers = new Map<string, string>()
  applySecurityHeaders({
    header(name: string, value: string) {
      headers.set(name, value)
      return this as any
    },
  })

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(headers.get(name), value)
  }
})

test('content security policy blocks object embedding and framing', () => {
  const directives = Object.fromEntries(
    CONTENT_SECURITY_POLICY.split('; ').map(part => {
      const [name, ...values] = part.split(' ')
      return [name, values.join(' ')]
    })
  )

  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/)
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/)
  assert.equal(directives['script-src'], "'self'")
})
