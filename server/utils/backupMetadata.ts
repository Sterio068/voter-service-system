import { createHash, createHmac } from 'crypto'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { getSecretEncryptionKey } from './secrets'

export const BACKUP_METADATA_SUFFIX = '.meta.json'

export type BackupMetadata = {
  version: 1
  app: 'voter-service-system'
  db_file: string
  created_at: string
  size: number
  sha256: string
  schema_version: string | null
  node_version: string
  signature_algorithm: 'hmac-sha256'
  signature: string
}

type BackupMetadataPayload = Omit<BackupMetadata, 'signature'>

type BackupMetadataOptions = {
  schemaVersion?: string | null
  createdAt?: string | Date
  nodeVersion?: string
}

export type BackupMetadataVerification =
  | { ok: true; metadata: BackupMetadata }
  | {
      ok: false
      reason:
        | 'missing_metadata'
        | 'invalid_metadata'
        | 'sha256_mismatch'
        | 'size_mismatch'
        | 'signature_mismatch'
      metadata?: BackupMetadata
    }

export function getBackupSigningKey(): Buffer {
  const explicit = process.env.VOTER_SERVICE_BACKUP_SIGNING_KEY || process.env.BACKUP_SIGNING_KEY
  if (explicit && explicit.trim()) {
    return createHash('sha256').update(explicit).digest()
  }
  return getSecretEncryptionKey()
}

export function getBackupMetadataPath(backupPath: string): string {
  return `${backupPath}${BACKUP_METADATA_SUFFIX}`
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function signPayload(payload: BackupMetadataPayload, key: Buffer): string {
  return createHmac('sha256', key).update(stableStringify(payload)).digest('base64url')
}

export async function buildBackupMetadata(
  backupPath: string,
  options: BackupMetadataOptions = {},
  key = getBackupSigningKey()
): Promise<BackupMetadata> {
  const stat = statSync(backupPath)
  const payload: BackupMetadataPayload = {
    version: 1,
    app: 'voter-service-system',
    db_file: path.basename(backupPath),
    created_at: (options.createdAt instanceof Date
      ? options.createdAt
      : options.createdAt
        ? new Date(options.createdAt)
        : new Date()).toISOString(),
    size: stat.size,
    sha256: await sha256File(backupPath),
    schema_version: options.schemaVersion ?? null,
    node_version: options.nodeVersion ?? process.version,
    signature_algorithm: 'hmac-sha256',
  }
  return { ...payload, signature: signPayload(payload, key) }
}

export function writeBackupMetadata(backupPath: string, metadata: BackupMetadata): string {
  const metadataPath = getBackupMetadataPath(backupPath)
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 })
  return metadataPath
}

function isBackupMetadata(value: unknown): value is BackupMetadata {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<BackupMetadata>
  return item.version === 1
    && item.app === 'voter-service-system'
    && typeof item.db_file === 'string'
    && typeof item.created_at === 'string'
    && typeof item.size === 'number'
    && typeof item.sha256 === 'string'
    && (typeof item.schema_version === 'string' || item.schema_version === null)
    && typeof item.node_version === 'string'
    && item.signature_algorithm === 'hmac-sha256'
    && typeof item.signature === 'string'
}

export function readBackupMetadata(backupPath: string): BackupMetadata | null {
  const metadataPath = getBackupMetadataPath(backupPath)
  if (!existsSync(metadataPath)) return null
  try {
    const parsed = JSON.parse(readFileSync(metadataPath, 'utf8'))
    return isBackupMetadata(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function verifyBackupMetadata(
  backupPath: string,
  metadata = readBackupMetadata(backupPath),
  key = getBackupSigningKey()
): Promise<BackupMetadataVerification> {
  if (!metadata) return { ok: false, reason: 'missing_metadata' }
  if (!isBackupMetadata(metadata)) return { ok: false, reason: 'invalid_metadata' }

  const stat = statSync(backupPath)
  if (metadata.size !== stat.size) return { ok: false, reason: 'size_mismatch', metadata }

  const sha256 = await sha256File(backupPath)
  if (metadata.sha256 !== sha256) return { ok: false, reason: 'sha256_mismatch', metadata }

  const { signature, ...payload } = metadata
  const expected = signPayload(payload, key)
  if (signature !== expected) return { ok: false, reason: 'signature_mismatch', metadata }

  return { ok: true, metadata }
}

export function isPathInsideAllowedRoots(candidatePath: string, allowedRoots: string[]): boolean {
  const resolvedCandidate = path.resolve(candidatePath)
  return allowedRoots.some(root => {
    const resolvedRoot = path.resolve(root)
    return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
  })
}
