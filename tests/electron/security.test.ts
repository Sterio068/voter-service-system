import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMachineFingerprint,
  isVendorLockEnabled,
  resolveVendorPassword,
  verifyVendorPassword,
} from '../../electron/security'

test('resolveVendorPassword prefers the explicit service env var', () => {
  assert.equal(
    resolveVendorPassword({
      VOTER_SERVICE_VENDOR_PASSWORD: ' primary-secret ',
      VENDOR_PASSWORD: 'legacy-secret',
    }),
    'primary-secret',
  )
})

test('resolveVendorPassword falls back to the legacy env var', () => {
  assert.equal(
    resolveVendorPassword({
      VENDOR_PASSWORD: 'legacy-secret',
    }),
    'legacy-secret',
  )
})

test('resolveVendorPassword ignores blank env values', () => {
  assert.equal(
    resolveVendorPassword({
      VOTER_SERVICE_VENDOR_PASSWORD: '   ',
      VENDOR_PASSWORD: '',
    }),
    null,
  )
})

test('isVendorLockEnabled is optional and only turns on when a secret exists', () => {
  assert.equal(isVendorLockEnabled({}), false)
  assert.equal(isVendorLockEnabled({ VOTER_SERVICE_VENDOR_PASSWORD: 'enabled-secret' }), true)
})

test('verifyVendorPassword accepts only the exact configured secret', () => {
  assert.equal(verifyVendorPassword('correct horse battery staple', 'correct horse battery staple'), true)
  assert.equal(verifyVendorPassword('correct horse battery staple ', 'correct horse battery staple'), false)
  assert.equal(verifyVendorPassword('wrong', 'correct horse battery staple'), false)
  assert.equal(verifyVendorPassword('anything', null), false)
})

test('buildMachineFingerprint is stable and secret-dependent', () => {
  const identity = { macAddress: 'aa:bb:cc:dd:ee:ff', hostname: 'front-desk' }
  const first = buildMachineFingerprint('secret-a', identity)
  const second = buildMachineFingerprint('secret-a', identity)
  const differentSecret = buildMachineFingerprint('secret-b', identity)

  assert.equal(first, second)
  assert.notEqual(first, differentSecret)
  assert.match(first, /^[a-f0-9]{32}$/)
})
