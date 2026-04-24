import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createHash } from 'crypto'
import {
  buildBackupMetadata,
  isPathInsideAllowedRoots,
  readBackupMetadata,
  verifyBackupMetadata,
  writeBackupMetadata,
} from '../../server/utils/backupMetadata'

const testKey = createHash('sha256').update('backup-metadata-test-key').digest()

test('buildBackupMetadata signs file hash and verification detects tampering', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vss-backup-meta-'))
  try {
    const backupPath = path.join(dir, 'voter-service-test.db')
    writeFileSync(backupPath, 'backup-content-v1')

    const metadata = await buildBackupMetadata(backupPath, { schemaVersion: '202604240001' }, testKey)

    assert.equal(metadata.app, 'voter-service-system')
    assert.equal(metadata.db_file, 'voter-service-test.db')
    assert.equal(metadata.signature_algorithm, 'hmac-sha256')
    assert.equal(metadata.size, Buffer.byteLength('backup-content-v1'))
    assert.equal(metadata.schema_version, '202604240001')
    assert.equal((await verifyBackupMetadata(backupPath, metadata, testKey)).ok, true)

    writeFileSync(backupPath, 'backup-content-v2')

    const tampered = await verifyBackupMetadata(backupPath, metadata, testKey)
    assert.equal(tampered.ok, false)
    assert.equal(tampered.reason, 'sha256_mismatch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writeBackupMetadata stores a sidecar file that can be read back', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vss-backup-sidecar-'))
  try {
    const backupPath = path.join(dir, 'voter-service-sidecar.db')
    writeFileSync(backupPath, 'sidecar-content')

    const metadata = await buildBackupMetadata(backupPath, { schemaVersion: null }, testKey)
    const sidecarPath = writeBackupMetadata(backupPath, metadata)
    const fromDisk = readBackupMetadata(backupPath)

    assert.equal(sidecarPath, `${backupPath}.meta.json`)
    assert.deepEqual(fromDisk, metadata)
    assert.equal((await verifyBackupMetadata(backupPath, fromDisk, testKey)).ok, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('isPathInsideAllowedRoots enforces resolved backup root boundaries', () => {
  const root = path.resolve('/tmp/vss-allowed-root')

  assert.equal(isPathInsideAllowedRoots('/tmp/vss-allowed-root/daily', [root]), true)
  assert.equal(isPathInsideAllowedRoots('/tmp/vss-allowed-root-evil', [root]), false)
  assert.equal(isPathInsideAllowedRoots('/tmp/vss-allowed-root/../outside', [root]), false)
})
