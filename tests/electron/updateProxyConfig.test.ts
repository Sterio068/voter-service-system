import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyInstalledUpdateProxyEnv,
  getBundledUpdateProxyConfigPaths,
  resolveInstalledUpdateProxyConfig,
  sanitizeBundledUpdateProxyConfig,
} from '../../electron/updateProxyConfig'

const SAMPLE_UPDATE_PROXY_TOKEN = ['proxy', 'fixture'].join('-')

test('sanitizeBundledUpdateProxyConfig normalizes url and token', () => {
  assert.deepEqual(
    sanitizeBundledUpdateProxyConfig({
      url: ' https://updates.example.com/// ',
      token: ` ${SAMPLE_UPDATE_PROXY_TOKEN} `,
    }),
    {
      url: 'https://updates.example.com',
      token: SAMPLE_UPDATE_PROXY_TOKEN,
    },
  )
  assert.equal(sanitizeBundledUpdateProxyConfig({ token: 'x' }), null)
})

test('resolveInstalledUpdateProxyConfig seeds bundled values on first install', () => {
  const result = resolveInstalledUpdateProxyConfig({}, {
    url: 'https://updates.example.com',
    token: SAMPLE_UPDATE_PROXY_TOKEN,
  })

  assert.equal(result.changed, true)
  assert.equal(result.nextConfig.updateProxyUrl, 'https://updates.example.com')
  assert.equal(result.nextConfig.updateProxyToken, SAMPLE_UPDATE_PROXY_TOKEN)
  assert.equal(result.nextConfig.updateProxyManagedByInstaller, true)
  assert.equal(result.appliedUrl, 'https://updates.example.com')
  assert.equal(result.appliedToken, SAMPLE_UPDATE_PROXY_TOKEN)
})

test('resolveInstalledUpdateProxyConfig preserves manual config over bundled values', () => {
  const result = resolveInstalledUpdateProxyConfig(
    {
      updateProxyUrl: 'https://manual.example.com',
      updateProxyToken: 'manual-token',
      updateProxyManagedByInstaller: false,
    },
    {
      url: 'https://updates.example.com',
      token: SAMPLE_UPDATE_PROXY_TOKEN,
    },
  )

  assert.equal(result.changed, false)
  assert.equal(result.nextConfig.updateProxyUrl, 'https://manual.example.com')
  assert.equal(result.appliedUrl, 'https://manual.example.com')
  assert.equal(result.appliedToken, 'manual-token')
})

test('resolveInstalledUpdateProxyConfig updates installer-managed config on upgrade', () => {
  const result = resolveInstalledUpdateProxyConfig(
    {
      updateProxyUrl: 'https://old.example.com',
      updateProxyToken: 'old-token',
      updateProxyManagedByInstaller: true,
    },
    {
      url: 'https://updates.example.com',
      token: SAMPLE_UPDATE_PROXY_TOKEN,
    },
  )

  assert.equal(result.changed, true)
  assert.equal(result.nextConfig.updateProxyUrl, 'https://updates.example.com')
  assert.equal(result.nextConfig.updateProxyToken, SAMPLE_UPDATE_PROXY_TOKEN)
  assert.equal(result.appliedUrl, 'https://updates.example.com')
  assert.equal(result.appliedToken, SAMPLE_UPDATE_PROXY_TOKEN)
})

test('applyInstalledUpdateProxyEnv writes normalized values into process env shape', () => {
  const env: NodeJS.ProcessEnv = {}
  applyInstalledUpdateProxyEnv(env, {
    appliedUrl: 'https://updates.example.com',
    appliedToken: SAMPLE_UPDATE_PROXY_TOKEN,
  })
  assert.equal(env.VOTER_SERVICE_UPDATE_PROXY_URL, 'https://updates.example.com')
  assert.equal(env.VOTER_SERVICE_UPDATE_PROXY_TOKEN, SAMPLE_UPDATE_PROXY_TOKEN)

  applyInstalledUpdateProxyEnv(env, {
    appliedUrl: null,
    appliedToken: null,
  })
  assert.equal(env.VOTER_SERVICE_UPDATE_PROXY_URL, undefined)
  assert.equal(env.VOTER_SERVICE_UPDATE_PROXY_TOKEN, undefined)
})

test('getBundledUpdateProxyConfigPaths prioritizes packaged resource path', () => {
  assert.deepEqual(
    getBundledUpdateProxyConfigPaths({
      resourcesPath: '/Applications/Voter.app/Contents/Resources',
      appPath: '/Applications/Voter.app/Contents/Resources/app.asar',
    }),
    [
      '/Applications/Voter.app/Contents/Resources/update-proxy.json',
      '/Applications/Voter.app/Contents/Resources/app.asar/generated-resources/update-proxy.json',
      '/Applications/Voter.app/Contents/Resources/app.asar/resources/update-proxy.json',
    ],
  )
})
