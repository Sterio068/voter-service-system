import test from 'node:test'
import assert from 'node:assert/strict'
import { safeCell, safeRow } from '../../server/utils/excelSafe'

test('safeCell normalises null/undefined/empty to empty string', () => {
  assert.equal(safeCell(null), '')
  assert.equal(safeCell(undefined), '')
  assert.equal(safeCell(''), '')
})

test('safeCell preserves numbers and booleans', () => {
  assert.equal(safeCell(0), 0)
  assert.equal(safeCell(123), 123)
  assert.equal(safeCell(true), true)
  assert.equal(safeCell(false), false)
})

test('safeCell prefixes formula triggers with single quote', () => {
  assert.equal(safeCell('=cmd|"/c calc"'), `'=cmd|"/c calc"`)
  assert.equal(safeCell('=1+1'), `'=1+1`)
  assert.equal(safeCell('+44 7700 900000'), `'+44 7700 900000`)
  assert.equal(safeCell('-2,000'), `'-2,000`)
  assert.equal(safeCell('@SUM(A1:A2)'), `'@SUM(A1:A2)`)
  assert.equal(safeCell('\tinjected'), `'\tinjected`)
  assert.equal(safeCell('\rinjected'), `'\rinjected`)
})

test('safeCell leaves normal strings unchanged', () => {
  assert.equal(safeCell('王小明'), '王小明')
  assert.equal(safeCell('test@example.com'), 'test@example.com')
  assert.equal(safeCell('100年'), '100年')
})

test('safeRow processes all cells of a row', () => {
  const row = ['正常字串', '=cmd', null, 42, true]
  assert.deepEqual(safeRow(row), ['正常字串', `'=cmd`, '', 42, true])
})

test('safeCell stringifies objects then re-checks for formula trigger', () => {
  assert.equal(safeCell({ a: 1 }), '{"a":1}')
  assert.equal(safeCell([1, 2, 3]), '[1,2,3]')
})
