import Fastify, { FastifyReply, FastifyRequest } from 'fastify'
import { Readable } from 'stream'
import {
  DEFAULT_UPDATE_PROXY_TTL_MS,
  GitHubRelease,
  buildGitHubAssetHeaders,
  buildUpdateProxyLatestResponse,
  classifyReleaseAssets,
  fetchLatestGitHubRelease,
  getUpdateProxyBaseUrl,
  getUpdateProxyToken,
} from './utils/updateProxy'

const port = Number(process.env.VOTER_SERVICE_UPDATE_PROXY_PORT || process.env.PORT || 8787)
const host = process.env.VOTER_SERVICE_UPDATE_PROXY_HOST || '0.0.0.0'
const cachedBaseUrl = getUpdateProxyBaseUrl(process.env)

let releaseCache: { fetchedAt: number; release: GitHubRelease } | null = null

function getRequestPathname(request: FastifyRequest): string {
  try {
    return new URL(request.url, 'http://update-proxy.local').pathname
  } catch {
    return request.url.split('?')[0] || '/'
  }
}

function isPublicDownloadRoute(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const pathname = getRequestPathname(request)
  return pathname === '/download' || pathname.startsWith('/download/')
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatBytes(bytes?: number): string {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function contentDispositionFileName(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download'
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

function resolveDownloadAssetName(target: string, release: GitHubRelease): string | null {
  const classified = classifyReleaseAssets(release.assets || [])
  const normalized = target.trim().toLowerCase()

  if (normalized === 'mac' || normalized === 'mac-arm64' || normalized === 'darwin-arm64') {
    return (classified.macArm64Dmg || classified.macX64Dmg)?.name || null
  }
  if (normalized === 'mac-x64' || normalized === 'mac-intel' || normalized === 'darwin-x64') {
    return (classified.macX64Dmg || classified.macArm64Dmg)?.name || null
  }
  if (normalized === 'windows' || normalized === 'win' || normalized === 'win32' || normalized === 'setup') {
    return (classified.winInstaller || classified.winPortable)?.name || null
  }
  if (normalized === 'windows-portable' || normalized === 'win-portable' || normalized === 'portable') {
    return (classified.winPortable || classified.winInstaller)?.name || null
  }

  return classified.byName.has(target) ? target : null
}

function buildDownloadPage(release: GitHubRelease, baseUrl: string): string {
  const version = String(release.tag_name || '').replace(/^v/, '')
  const classified = classifyReleaseAssets(release.assets || [])
  const rows = [
    {
      label: 'Windows 安裝版',
      description: '一般使用者請下載這個版本',
      asset: classified.winInstaller,
      href: `${baseUrl}/download/windows`,
    },
    {
      label: 'Windows 免安裝版',
      description: '不安裝到系統，直接執行',
      asset: classified.winPortable,
      href: `${baseUrl}/download/windows-portable`,
    },
    {
      label: 'macOS Apple Silicon',
      description: 'M1 / M2 / M3 / M4 Mac',
      asset: classified.macArm64Dmg,
      href: `${baseUrl}/download/mac-arm64`,
    },
    {
      label: 'macOS Intel',
      description: 'Intel Mac',
      asset: classified.macX64Dmg,
      href: `${baseUrl}/download/mac-x64`,
    },
  ].filter(row => row.asset?.name)

  const published = release.published_at
    ? new Date(release.published_at).toLocaleString('zh-TW', { hour12: false })
    : ''

  const rowsHtml = rows.map(row => `
    <a class="download-card" href="${escapeHtml(row.href)}">
      <span>
        <strong>${escapeHtml(row.label)}</strong>
        <small>${escapeHtml(row.description)}</small>
        <code>${escapeHtml(row.asset?.name)}</code>
      </span>
      <em>${escapeHtml(formatBytes(row.asset?.size))}</em>
    </a>
  `).join('')

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>選民服務系統 v${escapeHtml(version)} 下載</title>
  <style>
    :root { color-scheme: light; font-family: "PingFang TC", "Noto Sans TC", system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #f6efe3, #dfeee9 48%, #e7eef7); color: #20302b; }
    main { width: min(900px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0; }
    .hero { padding: 36px; border: 1px solid rgba(38, 64, 55, .16); border-radius: 28px; background: rgba(255,255,255,.72); box-shadow: 0 22px 80px rgba(35, 52, 45, .13); backdrop-filter: blur(18px); }
    h1 { margin: 0 0 10px; font-size: clamp(32px, 6vw, 56px); letter-spacing: -.05em; }
    p { margin: 0; line-height: 1.8; color: #58645f; }
    .version { display: inline-flex; gap: 8px; align-items: center; margin-bottom: 18px; padding: 8px 12px; border-radius: 999px; background: #20302b; color: #fff; font-size: 14px; }
    .grid { display: grid; gap: 14px; margin-top: 28px; }
    .download-card { display: flex; justify-content: space-between; gap: 20px; padding: 20px; border-radius: 20px; background: #fff; color: inherit; text-decoration: none; border: 1px solid rgba(38,64,55,.12); transition: transform .16s ease, box-shadow .16s ease; }
    .download-card:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(35,52,45,.14); }
    strong, small, code { display: block; }
    strong { font-size: 18px; }
    small { margin-top: 5px; color: #66736d; }
    code { margin-top: 9px; color: #7b6250; word-break: break-all; }
    em { white-space: nowrap; align-self: center; font-style: normal; color: #52615b; }
    .note { margin-top: 18px; font-size: 14px; }
    @media (max-width: 640px) {
      main { width: min(100% - 24px, 900px); padding: 24px 0; }
      .hero { padding: 24px; border-radius: 22px; }
      .download-card { display: block; }
      em { display: block; margin-top: 12px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="version">選民服務系統 v${escapeHtml(version)}</div>
      <h1>安裝檔下載</h1>
      <p>此頁由內部 update proxy 提供，GitHub repository 可維持 private，不需要 GitHub 帳號也能下載正式安裝檔。</p>
      ${published ? `<p class="note">發布時間：${escapeHtml(published)}</p>` : ''}
      <div class="grid">${rowsHtml || '<p class="note">目前 release 沒有可下載的安裝檔。</p>'}</div>
      <p class="note">macOS 未簽章時，下載 DMG 後請拖曳到 Applications；Windows 請優先使用「安裝版」。</p>
    </section>
  </main>
</body>
</html>`
}

function inferBaseUrl(request: FastifyRequest): string {
  if (cachedBaseUrl) return cachedBaseUrl
  const proto = String(request.headers['x-forwarded-proto'] || request.protocol || 'http')
  const hostHeader = String(request.headers['x-forwarded-host'] || request.headers.host || `127.0.0.1:${port}`)
  return `${proto}://${hostHeader}`.replace(/\/+$/, '')
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  if (releaseCache && Date.now() - releaseCache.fetchedAt < DEFAULT_UPDATE_PROXY_TTL_MS) {
    return releaseCache.release
  }
  const release = await fetchLatestGitHubRelease(process.env)
  if (release) {
    releaseCache = { fetchedAt: Date.now(), release }
  }
  return release
}

async function requireProxyToken(request: FastifyRequest, reply: FastifyReply) {
  if (isPublicDownloadRoute(request)) return

  const expectedToken = getUpdateProxyToken(process.env)
  if (!expectedToken) return

  const raw = request.headers.authorization
  const actualToken = typeof raw === 'string' && raw.startsWith('Bearer ')
    ? raw.slice('Bearer '.length).trim()
    : ''

  if (!actualToken || actualToken !== expectedToken) {
    return reply.code(401).send({ success: false, error: 'update_proxy_unauthorized' })
  }
}

async function proxyAssetByName(
  request: FastifyRequest,
  reply: FastifyReply,
  assetName: string,
  options: { attachment?: boolean } = {},
) {
  const release = await getLatestRelease()
  const classified = classifyReleaseAssets(release?.assets || [])
  const asset = classified.byName.get(assetName)
  if (!release || !asset?.url) {
    return reply.code(404).send({ success: false, error: 'update_asset_not_found' })
  }

  const upstream = await fetch(asset.url, {
    headers: buildGitHubAssetHeaders(process.env),
  }).catch(() => null)

  if (!upstream || !upstream.ok || !upstream.body) {
    return reply.code(502).send({ success: false, error: 'update_asset_fetch_failed' })
  }

  const contentType = upstream.headers.get('content-type') || asset.content_type || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  reply.header('content-type', contentType)
  if (contentLength) reply.header('content-length', contentLength)
  if (options.attachment) reply.header('content-disposition', contentDispositionFileName(asset.name))
  reply.header('cache-control', 'private, max-age=300')
  return reply.send(Readable.fromWeb(upstream.body as any))
}

export async function buildUpdateProxyServer() {
  const fastify = Fastify({ logger: true, trustProxy: true })

  fastify.addHook('onRequest', requireProxyToken)

  fastify.get('/health', async () => ({ status: 'ok' }))

  fastify.get('/download', async (request, reply) => {
    const release = await getLatestRelease()
    if (!release?.tag_name) {
      return reply.code(502).type('text/plain; charset=utf-8').send('目前無法取得最新版安裝檔，請稍後再試。')
    }
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, max-age=120')
      .send(buildDownloadPage(release, inferBaseUrl(request)))
  })

  fastify.get('/download/assets/*', async (request, reply) => {
    const params = request.params as { '*': string }
    const assetName = decodeURIComponent(params['*'] || '')
    return proxyAssetByName(request, reply, assetName, { attachment: true })
  })

  fastify.get('/download/:target', async (request, reply) => {
    const release = await getLatestRelease()
    if (!release?.tag_name) {
      return reply.code(502).send({ success: false, error: 'update_release_unavailable' })
    }

    const params = request.params as { target: string }
    const assetName = resolveDownloadAssetName(decodeURIComponent(params.target || ''), release)
    if (!assetName) {
      return reply.code(404).send({ success: false, error: 'download_asset_not_found' })
    }

    return proxyAssetByName(request, reply, assetName, { attachment: true })
  })

  fastify.get('/api/updates/latest', async (request, reply) => {
    const release = await getLatestRelease()
    if (!release?.tag_name) {
      return reply.code(502).send({ success: false, error: 'update_release_unavailable' })
    }

    const query = request.query as {
      current?: string
      platform?: string
      arch?: string
    }

    const data = buildUpdateProxyLatestResponse(release, {
      baseUrl: inferBaseUrl(request),
      currentVersion: query.current || '',
      platform: query.platform || '',
      arch: query.arch || '',
    })

    return reply.send({ success: true, data })
  })

  fastify.get('/api/updates/assets/*', async (request, reply) => {
    const params = request.params as { '*': string }
    const assetName = decodeURIComponent(params['*'] || '')
    return proxyAssetByName(request, reply, assetName)
  })

  fastify.get('/api/updates/generic/win/latest.yml', async (_request, reply) => {
    const release = await getLatestRelease()
    const classified = classifyReleaseAssets(release?.assets || [])
    if (!classified.latestYml?.name) {
      return reply.code(404).send({ success: false, error: 'latest_yml_not_found' })
    }
    return proxyAssetByName(_request, reply, classified.latestYml.name)
  })

  fastify.get('/api/updates/generic/mac/latest-mac.yml', async (_request, reply) => {
    const release = await getLatestRelease()
    const classified = classifyReleaseAssets(release?.assets || [])
    if (!classified.latestMacYml?.name) {
      return reply.code(404).send({ success: false, error: 'latest_mac_yml_not_found' })
    }
    return proxyAssetByName(_request, reply, classified.latestMacYml.name)
  })

  fastify.get('/api/updates/generic/win/*', async (request, reply) => {
    const params = request.params as { '*': string }
    const assetName = decodeURIComponent(params['*'] || '')
    return proxyAssetByName(request, reply, assetName)
  })

  fastify.get('/api/updates/generic/mac/*', async (request, reply) => {
    const params = request.params as { '*': string }
    const assetName = decodeURIComponent(params['*'] || '')
    return proxyAssetByName(request, reply, assetName)
  })

  return fastify
}

if (require.main === module) {
  buildUpdateProxyServer()
    .then(server => server.listen({ port, host }))
    .then(address => {
      // eslint-disable-next-line no-console
      console.log(`[update-proxy] listening on ${address}`)
    })
    .catch(error => {
      // eslint-disable-next-line no-console
      console.error('[update-proxy] failed to start', error)
      process.exit(1)
    })
}
