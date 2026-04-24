import test from 'node:test'
import assert from 'node:assert/strict'
import {
  maskBirthDate,
  maskEmail,
  maskIdNumber,
  maskMobile,
  maskVoterExportRecord,
} from '../../server/utils/piiMasking'

test('maskIdNumber keeps only low-risk fragments', () => {
  assert.equal(maskIdNumber('A123456789'), 'A******789')
  assert.equal(maskIdNumber('12345'), '1*345')
  assert.equal(maskIdNumber(''), '')
})

test('maskMobile keeps prefix and suffix for recognition', () => {
  assert.equal(maskMobile('0912345678'), '0912***678')
  assert.equal(maskMobile('+886912345678'), '+8869*****678')
  assert.equal(maskMobile(null), '')
})

test('maskEmail protects local-part while preserving domain', () => {
  assert.equal(maskEmail('person@example.com'), 'p*****@example.com')
  assert.equal(maskEmail('x@example.com'), '*@example.com')
  assert.equal(maskEmail('not-an-email'), 'n***********')
})

test('maskBirthDate keeps year only', () => {
  assert.equal(maskBirthDate('1980-05-15'), '1980-**-**')
  assert.equal(maskBirthDate('bad'), '***')
})

test('maskVoterExportRecord masks sensitive voter export fields', () => {
  const masked = maskVoterExportRecord({
    name: '王小明',
    birth_date: '1980-05-15',
    id_number: 'A123456789',
    mobile: '0912345678',
    phone: '02-23456789',
    line_id: 'line-user',
    email: 'person@example.com',
    household_address: '信義路5段1號',
    mailing_address: '台北市信義區信義路5段1號',
  })

  assert.equal(masked.name, '王小明')
  assert.equal(masked.birth_date, '1980-**-**')
  assert.equal(masked.id_number, 'A******789')
  assert.equal(masked.mobile, '0912***678')
  assert.equal(masked.phone, '02-*****789')
  assert.equal(masked.line_id, 'l********')
  assert.equal(masked.email, 'p*****@example.com')
  assert.equal(masked.household_address, '***')
  assert.equal(masked.mailing_address, '***')
})
