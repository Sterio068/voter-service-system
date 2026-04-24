import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { hostname, networkInterfaces } from 'os'

export const VENDOR_PASSWORD_ENV_KEYS = [
  'VOTER_SERVICE_VENDOR_PASSWORD',
  'VENDOR_PASSWORD',
] as const

export interface MachineIdentity {
  macAddress: string
  hostname: string
}

export function isVendorLockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveVendorPassword(env) !== null
}

export function resolveVendorPassword(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const key of VENDOR_PASSWORD_ENV_KEYS) {
    const value = env[key]?.trim()
    if (value) return value
  }
  return null
}

export function getVendorPasswordConfigMessage(): string {
  return `如需啟用機器綁定，請設定 ${VENDOR_PASSWORD_ENV_KEYS.join(' 或 ')} 環境變數。`
}

export function verifyVendorPassword(candidate: string, expected: string | null | undefined): boolean {
  if (!expected) return false

  const candidateDigest = createHash('sha256').update(candidate).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(candidateDigest, expectedDigest)
}

export function getMachineIdentity(): MachineIdentity {
  const ifaces = networkInterfaces()
  let macAddress = ''

  for (const list of Object.values(ifaces)) {
    if (!list) continue
    for (const iface of list) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macAddress = iface.mac
        break
      }
    }
    if (macAddress) break
  }

  return { macAddress, hostname: hostname() }
}

export function buildMachineFingerprint(
  secret: string,
  identity: MachineIdentity = getMachineIdentity(),
): string {
  return createHmac('sha256', secret)
    .update(`${identity.macAddress}|${identity.hostname}`)
    .digest('hex')
    .slice(0, 32)
}
