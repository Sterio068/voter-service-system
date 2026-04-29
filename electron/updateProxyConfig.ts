import fs from 'fs'
import path from 'path'
import { normalizeBaseUrl } from '../server/utils/updateProxy'

export interface AppUpdateProxyConfig {
  updateProxyUrl?: string
  updateProxyToken?: string
  updateProxyManagedByInstaller?: boolean
}

export interface BundledUpdateProxyConfig {
  url?: string
  token?: string
}

function normalizeToken(value?: string | null): string | null {
  if (!value || !value.trim()) return null
  return value.trim()
}

export function sanitizeBundledUpdateProxyConfig(input: unknown): BundledUpdateProxyConfig | null {
  if (!input || typeof input !== 'object') return null
  const data = input as Record<string, unknown>
  const url = normalizeBaseUrl(typeof data.url === 'string' ? data.url : undefined)
  const token = normalizeToken(typeof data.token === 'string' ? data.token : undefined)
  if (!url) return null
  return token ? { url, token } : { url }
}

export function loadBundledUpdateProxyConfig(candidatePaths: string[]): BundledUpdateProxyConfig | null {
  for (const filePath of candidatePaths) {
    try {
      if (!fs.existsSync(filePath)) continue
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = sanitizeBundledUpdateProxyConfig(JSON.parse(raw))
      if (parsed?.url) return parsed
    } catch {
      continue
    }
  }
  return null
}

export function getBundledUpdateProxyConfigPaths(options: {
  resourcesPath: string
  appPath: string
}): string[] {
  return [
    path.join(options.resourcesPath, 'update-proxy.json'),
    path.join(options.appPath, 'generated-resources', 'update-proxy.json'),
    path.join(options.appPath, 'resources', 'update-proxy.json'),
  ]
}

export function resolveInstalledUpdateProxyConfig<T extends AppUpdateProxyConfig>(
  existingConfig: T,
  bundledConfig: BundledUpdateProxyConfig | null,
): {
  nextConfig: T & AppUpdateProxyConfig
  changed: boolean
  appliedUrl: string | null
  appliedToken: string | null
} {
  const existingUrl = normalizeBaseUrl(existingConfig.updateProxyUrl)
  const existingToken = normalizeToken(existingConfig.updateProxyToken)
  let nextConfig: T & AppUpdateProxyConfig = { ...existingConfig }
  let changed = false

  if (bundledConfig?.url && (existingConfig.updateProxyManagedByInstaller || !existingUrl)) {
    const bundledToken = normalizeToken(bundledConfig.token)
    const needsUpdate = (
      existingUrl !== bundledConfig.url
      || existingToken !== bundledToken
      || existingConfig.updateProxyManagedByInstaller !== true
    )

    if (needsUpdate) {
      nextConfig = {
        ...existingConfig,
        updateProxyUrl: bundledConfig.url,
        updateProxyToken: bundledToken || undefined,
        updateProxyManagedByInstaller: true,
      }
      changed = true
    }
  }

  const appliedUrl = normalizeBaseUrl(nextConfig.updateProxyUrl)
  const appliedToken = normalizeToken(nextConfig.updateProxyToken)

  return {
    nextConfig,
    changed,
    appliedUrl,
    appliedToken,
  }
}

export function applyInstalledUpdateProxyEnv(
  env: NodeJS.ProcessEnv,
  config: {
    appliedUrl: string | null
    appliedToken: string | null
  },
): void {
  if (config.appliedUrl) env.VOTER_SERVICE_UPDATE_PROXY_URL = config.appliedUrl
  else delete env.VOTER_SERVICE_UPDATE_PROXY_URL

  if (config.appliedToken) env.VOTER_SERVICE_UPDATE_PROXY_TOKEN = config.appliedToken
  else delete env.VOTER_SERVICE_UPDATE_PROXY_TOKEN
}
