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

async function proxyAssetByName(request: FastifyRequest, reply: FastifyReply, assetName: string) {
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
  reply.header('cache-control', 'private, max-age=300')
  return reply.send(Readable.fromWeb(upstream.body as any))
}

export async function buildUpdateProxyServer() {
  const fastify = Fastify({ logger: true, trustProxy: true })

  fastify.addHook('onRequest', requireProxyToken)

  fastify.get('/health', async () => ({ status: 'ok' }))

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
