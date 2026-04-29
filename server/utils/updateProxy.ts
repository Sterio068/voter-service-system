export const DEFAULT_UPDATE_GITHUB_OWNER = 'Sterio068'
export const DEFAULT_UPDATE_GITHUB_REPO = 'voter-service-system'
export const DEFAULT_UPDATE_PROXY_TTL_MS = 5 * 60 * 1000
export const UPDATE_PROXY_USER_AGENT = 'voter-service-system-update-proxy'

export type GitHubReleaseAsset = {
  id?: number
  name: string
  size?: number
  url?: string
  browser_download_url?: string
  content_type?: string
}

export type GitHubRelease = {
  tag_name?: string
  html_url?: string
  body?: string
  published_at?: string
  draft?: boolean
  prerelease?: boolean
  assets?: GitHubReleaseAsset[]
}

export type UpdateAssetDescriptor = {
  name: string
  size: number
  url: string
}

export type UpdateFeeds = {
  win: string
  mac: string
}

export type UpdateProxyLatestResponse = {
  current: string
  latest: string
  has_update: boolean
  latest_published?: string
  latest_notes?: string
  latest_url: string | null
  feeds: UpdateFeeds
  platform_asset: UpdateAssetDescriptor | null
  assets: Partial<{
    mac_arm64_dmg: UpdateAssetDescriptor
    mac_x64_dmg: UpdateAssetDescriptor
    win_installer: UpdateAssetDescriptor
    win_portable: UpdateAssetDescriptor
    latest_yml: UpdateAssetDescriptor
    latest_mac_yml: UpdateAssetDescriptor
  }>
}

export type ClassifiedReleaseAssets = {
  byName: Map<string, GitHubReleaseAsset>
  macArm64Dmg: GitHubReleaseAsset | null
  macX64Dmg: GitHubReleaseAsset | null
  winInstaller: GitHubReleaseAsset | null
  winPortable: GitHubReleaseAsset | null
  latestYml: GitHubReleaseAsset | null
  latestMacYml: GitHubReleaseAsset | null
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function normalizeBaseUrl(value?: string | null): string | null {
  if (!value || !value.trim()) return null
  return value.trim().replace(/\/+$/, '')
}

export function getUpdateProxyBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return normalizeBaseUrl(firstNonEmpty(
    env.VOTER_SERVICE_UPDATE_PROXY_URL,
    env.UPDATE_PROXY_URL,
  ))
}

export function getUpdateProxyToken(env: NodeJS.ProcessEnv = process.env): string | null {
  return firstNonEmpty(
    env.VOTER_SERVICE_UPDATE_PROXY_TOKEN,
    env.UPDATE_PROXY_TOKEN,
  )
}

export function getUpdateProxyHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const token = getUpdateProxyToken(env)
  if (!token) return {}
  return { authorization: `Bearer ${token}` }
}

export function isUpdateProxyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!getUpdateProxyBaseUrl(env)
}

export function getUpdateGitHubOwner(env: NodeJS.ProcessEnv = process.env): string {
  return firstNonEmpty(
    env.VOTER_SERVICE_UPDATE_GITHUB_OWNER,
    env.UPDATE_GITHUB_OWNER,
  ) || DEFAULT_UPDATE_GITHUB_OWNER
}

export function getUpdateGitHubRepo(env: NodeJS.ProcessEnv = process.env): string {
  return firstNonEmpty(
    env.VOTER_SERVICE_UPDATE_GITHUB_REPO,
    env.UPDATE_GITHUB_REPO,
  ) || DEFAULT_UPDATE_GITHUB_REPO
}

export function getUpdateGitHubToken(env: NodeJS.ProcessEnv = process.env): string | null {
  return firstNonEmpty(
    env.VOTER_SERVICE_UPDATE_GITHUB_TOKEN,
    env.UPDATE_GITHUB_TOKEN,
    env.GH_TOKEN,
    env.GITHUB_TOKEN,
  )
}

export function buildUpdateProxyUrl(
  baseUrl: string,
  pathname: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const url = new URL(pathname, `${normalizeBaseUrl(baseUrl) || baseUrl}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export function compareVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.\-+]/).map(x => parseInt(x, 10) || 0)
  const pb = b.replace(/^v/, '').split(/[.\-+]/).map(x => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export function normalizeReleaseVersion(tagName?: string | null): string {
  return String(tagName || '').replace(/^v/, '')
}

export function latestMetadataNameForPlatform(platform: 'darwin' | 'win32'): string {
  return platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
}

export function classifyReleaseAssets(assets: GitHubReleaseAsset[] = []): ClassifiedReleaseAssets {
  const byName = new Map<string, GitHubReleaseAsset>()
  let macArm64Dmg: GitHubReleaseAsset | null = null
  let macX64Dmg: GitHubReleaseAsset | null = null
  let winInstaller: GitHubReleaseAsset | null = null
  let winPortable: GitHubReleaseAsset | null = null
  let latestYml: GitHubReleaseAsset | null = null
  let latestMacYml: GitHubReleaseAsset | null = null

  for (const asset of assets) {
    byName.set(asset.name, asset)
    const lower = asset.name.toLowerCase()

    if (lower === 'latest.yml') {
      latestYml = asset
      continue
    }
    if (lower === 'latest-mac.yml') {
      latestMacYml = asset
      continue
    }
    if (lower.endsWith('.dmg')) {
      if (lower.includes('arm64')) macArm64Dmg = asset
      else if (lower.includes('x64') || lower.includes('intel')) macX64Dmg = asset
      else if (!macX64Dmg) macX64Dmg = asset
      continue
    }
    if (lower.endsWith('.exe')) {
      if (lower.includes('setup')) {
        if (!winInstaller) winInstaller = asset
      } else if (!winPortable) {
        winPortable = asset
      }
    }
  }

  return {
    byName,
    macArm64Dmg,
    macX64Dmg,
    winInstaller,
    winPortable,
    latestYml,
    latestMacYml,
  }
}

export function pickPlatformAsset(
  classified: ClassifiedReleaseAssets,
  platform?: string | null,
  arch?: string | null,
): GitHubReleaseAsset | null {
  if (platform === 'darwin') {
    if (arch === 'arm64') return classified.macArm64Dmg || classified.macX64Dmg
    return classified.macX64Dmg || classified.macArm64Dmg
  }
  if (platform === 'win32') {
    return classified.winInstaller || classified.winPortable
  }
  return null
}

export function buildGitHubReleaseListApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `https://api.github.com/repos/${getUpdateGitHubOwner(env)}/${getUpdateGitHubRepo(env)}/releases?per_page=10`
}

export function buildGitHubApiHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': UPDATE_PROXY_USER_AGENT,
    Accept: 'application/vnd.github+json',
  }
  const token = getUpdateGitHubToken(env)
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

export function buildGitHubAssetHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers = buildGitHubApiHeaders(env)
  headers.Accept = 'application/octet-stream'
  return headers
}

export async function fetchLatestGitHubRelease(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRelease | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const response = await fetchImpl(buildGitHubReleaseListApiUrl(env), {
      headers: buildGitHubApiHeaders(env),
      signal: ctrl.signal,
    })
    if (!response.ok) return null
    const list = (await response.json()) as GitHubRelease[]
    if (!Array.isArray(list)) return null
    const eligible = list
      .filter(release => !release.draft && !release.prerelease && typeof release.tag_name === 'string')
      .sort((a, b) => compareVersion(normalizeReleaseVersion(b.tag_name), normalizeReleaseVersion(a.tag_name)))
    return eligible[0] || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function toProxyAssetDescriptor(baseUrl: string, asset: GitHubReleaseAsset | null): UpdateAssetDescriptor | undefined {
  if (!asset) return undefined
  return {
    name: asset.name,
    size: Number(asset.size || 0),
    url: buildUpdateProxyUrl(baseUrl, `/api/updates/assets/${encodeURIComponent(asset.name)}`),
  }
}

export function buildUpdateProxyLatestResponse(
  release: GitHubRelease,
  options: {
    baseUrl: string
    currentVersion?: string | null
    platform?: string | null
    arch?: string | null
  },
): UpdateProxyLatestResponse {
  const latest = normalizeReleaseVersion(release.tag_name)
  const current = String(options.currentVersion || '')
  const classified = classifyReleaseAssets(release.assets || [])
  const platformAsset = toProxyAssetDescriptor(
    options.baseUrl,
    pickPlatformAsset(classified, options.platform, options.arch),
  ) || null

  return {
    current,
    latest,
    has_update: !!current && compareVersion(latest, current) > 0,
    latest_published: release.published_at,
    latest_notes: typeof release.body === 'string' ? release.body : undefined,
    latest_url: null,
    feeds: {
      win: buildUpdateProxyUrl(options.baseUrl, '/api/updates/generic/win'),
      mac: buildUpdateProxyUrl(options.baseUrl, '/api/updates/generic/mac'),
    },
    platform_asset: platformAsset,
    assets: {
      mac_arm64_dmg: toProxyAssetDescriptor(options.baseUrl, classified.macArm64Dmg),
      mac_x64_dmg: toProxyAssetDescriptor(options.baseUrl, classified.macX64Dmg),
      win_installer: toProxyAssetDescriptor(options.baseUrl, classified.winInstaller),
      win_portable: toProxyAssetDescriptor(options.baseUrl, classified.winPortable),
      latest_yml: toProxyAssetDescriptor(options.baseUrl, classified.latestYml),
      latest_mac_yml: toProxyAssetDescriptor(options.baseUrl, classified.latestMacYml),
    },
  }
}
