import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUpdateProxyLatestResponse,
  buildUpdateProxyUrl,
  classifyReleaseAssets,
  compareVersion,
  getUpdateProxyHeaders,
  normalizeBaseUrl,
  pickPlatformAsset,
  type GitHubRelease,
} from '../../server/utils/updateProxy'

const sampleRelease: GitHubRelease = {
  tag_name: 'v1.0.28',
  body: 'Release notes',
  published_at: '2026-04-29T12:00:00.000Z',
  assets: [
    { name: 'latest.yml', size: 123, url: 'https://api.github.test/latest.yml' },
    { name: 'latest-mac.yml', size: 234, url: 'https://api.github.test/latest-mac.yml' },
    { name: 'voter-service-system-1.0.28-arm64.dmg', size: 111, url: 'https://api.github.test/mac-arm64' },
    { name: 'voter-service-system-1.0.28-x64.dmg', size: 222, url: 'https://api.github.test/mac-x64' },
    { name: '選民服務系統 Setup 1.0.28.exe', size: 333, url: 'https://api.github.test/win-setup' },
    { name: '選民服務系統 1.0.28.exe', size: 444, url: 'https://api.github.test/win-portable' },
  ],
}

test('normalizeBaseUrl trims whitespace and strips trailing slashes', () => {
  assert.equal(normalizeBaseUrl(' https://updates.example.com/// '), 'https://updates.example.com')
  assert.equal(normalizeBaseUrl(''), null)
})

test('getUpdateProxyHeaders emits bearer auth only when token exists', () => {
  assert.deepEqual(getUpdateProxyHeaders({ VOTER_SERVICE_UPDATE_PROXY_TOKEN: 'abc123' } as NodeJS.ProcessEnv), {
    authorization: 'Bearer abc123',
  })
  assert.deepEqual(getUpdateProxyHeaders({} as NodeJS.ProcessEnv), {})
})

test('classifyReleaseAssets and pickPlatformAsset choose expected artifacts', () => {
  const classified = classifyReleaseAssets(sampleRelease.assets || [])
  assert.equal(classified.latestYml?.name, 'latest.yml')
  assert.equal(classified.latestMacYml?.name, 'latest-mac.yml')
  assert.equal(classified.macArm64Dmg?.name, 'voter-service-system-1.0.28-arm64.dmg')
  assert.equal(classified.macX64Dmg?.name, 'voter-service-system-1.0.28-x64.dmg')
  assert.equal(classified.winInstaller?.name, '選民服務系統 Setup 1.0.28.exe')
  assert.equal(classified.winPortable?.name, '選民服務系統 1.0.28.exe')
  assert.equal(pickPlatformAsset(classified, 'darwin', 'arm64')?.name, 'voter-service-system-1.0.28-arm64.dmg')
  assert.equal(pickPlatformAsset(classified, 'darwin', 'x64')?.name, 'voter-service-system-1.0.28-x64.dmg')
  assert.equal(pickPlatformAsset(classified, 'win32', 'x64')?.name, '選民服務系統 Setup 1.0.28.exe')
})

test('buildUpdateProxyLatestResponse returns proxy-hosted asset URLs and update status', () => {
  const data = buildUpdateProxyLatestResponse(sampleRelease, {
    baseUrl: 'https://updates.example.com',
    currentVersion: '1.0.27',
    platform: 'darwin',
    arch: 'arm64',
  })

  assert.equal(data.latest, '1.0.28')
  assert.equal(data.has_update, true)
  assert.equal(data.feeds.win, 'https://updates.example.com/api/updates/generic/win')
  assert.equal(data.feeds.mac, 'https://updates.example.com/api/updates/generic/mac')
  assert.equal(data.platform_asset?.url, 'https://updates.example.com/api/updates/assets/voter-service-system-1.0.28-arm64.dmg')
  assert.equal(data.assets.win_installer?.url, 'https://updates.example.com/api/updates/assets/%E9%81%B8%E6%B0%91%E6%9C%8D%E5%8B%99%E7%B3%BB%E7%B5%B1%20Setup%201.0.28.exe')
})

test('buildUpdateProxyUrl and compareVersion handle normalized paths and semver ordering', () => {
  assert.equal(
    buildUpdateProxyUrl('https://updates.example.com/', '/api/updates/latest', { current: '1.0.27', platform: 'darwin' }),
    'https://updates.example.com/api/updates/latest?current=1.0.27&platform=darwin',
  )
  assert.ok(compareVersion('1.0.28', '1.0.27') > 0)
  assert.ok(compareVersion('v1.0.27', '1.0.27') === 0)
})
