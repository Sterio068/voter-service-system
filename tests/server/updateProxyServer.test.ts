import test from 'node:test'
import assert from 'node:assert/strict'

const sampleRelease = {
  tag_name: 'v1.0.28',
  body: 'Proxy release notes',
  published_at: '2026-04-29T12:00:00.000Z',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'latest.yml', size: 123, url: 'https://api.github.test/assets/latest.yml', content_type: 'text/yaml' },
    { name: 'latest-mac.yml', size: 234, url: 'https://api.github.test/assets/latest-mac.yml', content_type: 'text/yaml' },
    { name: 'voter-service-system-1.0.28-arm64.dmg', size: 111, url: 'https://api.github.test/assets/mac-arm64', content_type: 'application/x-apple-diskimage' },
  ],
}

test('update proxy server enforces auth and emits forwarded-host asset URLs', async () => {
  const originalEnv = {
    VOTER_SERVICE_UPDATE_PROXY_TOKEN: process.env.VOTER_SERVICE_UPDATE_PROXY_TOKEN,
    VOTER_SERVICE_UPDATE_PROXY_URL: process.env.VOTER_SERVICE_UPDATE_PROXY_URL,
  }
  const originalFetch = global.fetch

  process.env.VOTER_SERVICE_UPDATE_PROXY_TOKEN = 'proxy-secret'
  delete process.env.VOTER_SERVICE_UPDATE_PROXY_URL

  global.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/releases?per_page=10')) {
      return new Response(JSON.stringify([sampleRelease]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (url === 'https://api.github.test/assets/latest-mac.yml') {
      return new Response('version: 1.0.28\npath: voter-service-system-1.0.28-arm64.dmg\n', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    }

    if (url === 'https://api.github.test/assets/mac-arm64') {
      return new Response('DMGDATA', {
        status: 200,
        headers: {
          'content-type': 'application/x-apple-diskimage',
          'content-length': '7',
        },
      })
    }

    return new Response('not found', { status: 404 })
  }) as typeof fetch

  const { buildUpdateProxyServer } = await import('../../server/updateProxyServer')
  const server = await buildUpdateProxyServer()

  try {
    const unauthorized = await server.inject({
      method: 'GET',
      url: '/api/updates/latest?current=1.0.26&platform=darwin&arch=arm64',
    })
    assert.equal(unauthorized.statusCode, 401)

    const latest = await server.inject({
      method: 'GET',
      url: '/api/updates/latest?current=1.0.26&platform=darwin&arch=arm64',
      headers: {
        authorization: 'Bearer proxy-secret',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'updates.example.com',
      },
    })
    assert.equal(latest.statusCode, 200)
    const latestJson = latest.json() as {
      success: boolean
      data: {
        latest: string
        has_update: boolean
        platform_asset: { url: string } | null
      }
    }
    assert.equal(latestJson.success, true)
    assert.equal(latestJson.data.latest, '1.0.28')
    assert.equal(latestJson.data.has_update, true)
    assert.equal(
      latestJson.data.platform_asset?.url,
      'https://updates.example.com/api/updates/assets/voter-service-system-1.0.28-arm64.dmg',
    )

    const latestMacYml = await server.inject({
      method: 'GET',
      url: '/api/updates/generic/mac/latest-mac.yml',
      headers: {
        authorization: 'Bearer proxy-secret',
      },
    })
    assert.equal(latestMacYml.statusCode, 200)
    assert.match(latestMacYml.body, /version: 1\.0\.28/)

    const downloadPage = await server.inject({
      method: 'GET',
      url: '/download',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'updates.example.com',
      },
    })
    assert.equal(downloadPage.statusCode, 200)
    assert.match(downloadPage.headers['content-type'] as string, /text\/html/)
    assert.match(downloadPage.body, /選民服務系統 v1\.0\.28/)
    assert.match(downloadPage.body, /https:\/\/updates\.example\.com\/download\/mac-arm64/)

    const directDownload = await server.inject({
      method: 'GET',
      url: '/download/mac-arm64',
    })
    assert.equal(directDownload.statusCode, 200)
    assert.equal(directDownload.body, 'DMGDATA')
    assert.equal(directDownload.headers['content-type'], 'application/x-apple-diskimage')
    assert.match(
      String(directDownload.headers['content-disposition']),
      /attachment; filename="voter-service-system-1\.0\.28-arm64\.dmg"/,
    )
  } finally {
    await server.close()
    global.fetch = originalFetch

    if (originalEnv.VOTER_SERVICE_UPDATE_PROXY_TOKEN === undefined) delete process.env.VOTER_SERVICE_UPDATE_PROXY_TOKEN
    else process.env.VOTER_SERVICE_UPDATE_PROXY_TOKEN = originalEnv.VOTER_SERVICE_UPDATE_PROXY_TOKEN

    if (originalEnv.VOTER_SERVICE_UPDATE_PROXY_URL === undefined) delete process.env.VOTER_SERVICE_UPDATE_PROXY_URL
    else process.env.VOTER_SERVICE_UPDATE_PROXY_URL = originalEnv.VOTER_SERVICE_UPDATE_PROXY_URL
  }
})
