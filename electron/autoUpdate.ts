/**
 * Cross-platform in-app updater.
 *
 * - Win NSIS: uses `electron-updater` for full one-click flow
 *   (verifyUpdateCodeSignature: false because we don't ship a signed cert).
 * - macOS: bypasses `electron-updater` (Squirrel.Mac requires a signed app
 *   we don't have). Instead we manually fetch the latest release JSON,
 *   download the DMG, then `shell.openPath` it so the user drags the icon
 *   into Applications themselves.
 *
 * Both paths share the same renderer-facing IPC channels so the UI is
 * uniform regardless of OS.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import {
  buildUpdateProxyUrl,
  compareVersion,
  getUpdateProxyBaseUrl,
  getUpdateProxyHeaders,
} from '../server/utils/updateProxy'

type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; notes?: string; assetUrl?: string; assetSize?: number }
  | { phase: 'not-available'; version: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { phase: 'downloaded'; version: string; filePath?: string }
  | { phase: 'error'; message: string }

type UpdateReleaseInfo = {
  version: string
  notes?: string
  assetUrl?: string
  assetSize?: number
}

// We avoid /releases/latest because GitHub's CDN-cached "latest" pointer
// occasionally goes stale on this repo and serves 404 even when a valid
// non-draft non-prerelease release exists. Listing /releases?per_page=10
// + filtering client-side is more reliable.
const RELEASE_API = 'https://api.github.com/repos/Sterio068/voter-service-system/releases?per_page=10'
const USER_AGENT = 'voter-service-system'

let lastStatus: UpdateStatus = { phase: 'idle' }
let downloadedDmgPath: string | null = null
let mainWindowRef: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef
  const all = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
  return all[0] || null
}

function emitStatus(s: UpdateStatus): void {
  lastStatus = s
  const win = getMainWindow()
  if (win) win.webContents.send('update:status', s)
}

function getCurrentUpdateProxyBaseUrl(): string | null {
  return getUpdateProxyBaseUrl(process.env)
}

function getCurrentUpdateProxyHeaders(): Record<string, string> {
  return getUpdateProxyHeaders(process.env)
}

// ── Win flow: electron-updater ──────────────────────────────────
let winUpdaterReady = false
let winUpdaterInstance: any | null = null

function getWinUpdater() {
  if (winUpdaterInstance) return winUpdaterInstance

  const updateProxyBaseUrl = getCurrentUpdateProxyBaseUrl()
  if (updateProxyBaseUrl) {
    const { NsisUpdater } = require('electron-updater')
    winUpdaterInstance = new NsisUpdater({
      provider: 'generic',
      url: buildUpdateProxyUrl(updateProxyBaseUrl, '/api/updates/generic/win'),
      requestHeaders: getCurrentUpdateProxyHeaders(),
      useMultipleRangeRequest: false,
    })
    return winUpdaterInstance
  }

  winUpdaterInstance = require('electron-updater').autoUpdater
  return winUpdaterInstance
}

function setupWinUpdater(): void {
  if (winUpdaterReady) return
  let updater: any
  try {
    updater = getWinUpdater()
  } catch (err) {
    console.warn('[AutoUpdate] electron-updater not available:', err)
    return
  }
  // Don't auto-download or auto-install — we want explicit user action.
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  // No code-signing cert; skip signature verification on Windows.
  // (Mac would still error here, but we never call updater on Mac.)
  // SECURITY NOTE: verifyUpdateCodeSignature is disabled because this build has
  // no code-signing certificate. The download URL comes from the GitHub Releases
  // API over HTTPS, which provides transport-layer authenticity. A proper
  // certificate should be added in a future release to enable binary signing.
  ;(updater as any).disableWebInstaller = true
  ;(updater as any).verifyUpdateCodeSignature = false

  updater.on('checking-for-update', () => emitStatus({ phase: 'checking' }))
  updater.on('update-available', (info: any) => {
    emitStatus({
      phase: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  })
  updater.on('update-not-available', (info: any) => {
    emitStatus({ phase: 'not-available', version: info.version })
  })
  updater.on('download-progress', (p: any) => {
    emitStatus({
      phase: 'downloading',
      percent: Math.round(p.percent),
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    })
  })
  updater.on('update-downloaded', (info: any) => {
    emitStatus({ phase: 'downloaded', version: info.version })
  })
  updater.on('error', (err: any) => {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  })

  winUpdaterReady = true
}

async function winCheck(): Promise<void> {
  setupWinUpdater()
  try {
    const updater = getWinUpdater()
    await updater.checkForUpdates()
  } catch (err: any) {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  }
}

async function winDownload(): Promise<void> {
  setupWinUpdater()
  try {
    const updater = getWinUpdater()
    await updater.downloadUpdate()
  } catch (err: any) {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  }
}

function winInstall(): void {
  try {
    const updater = getWinUpdater()
    setImmediate(() => updater.quitAndInstall(false, true))
  } catch (err: any) {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  }
}

// ── Mac flow: manual fetch + open DMG ──────────────────────────
type GhAsset = { name: string; browser_download_url: string; size: number }
type GhRelease = {
  tag_name?: string
  html_url?: string
  body?: string
  published_at?: string
  assets?: GhAsset[]
  draft?: boolean
  prerelease?: boolean
}

let cachedRelease: { fetchedAt: number; data: UpdateReleaseInfo } | null = null
const RELEASE_TTL = 60 * 60 * 1000 // 1h

async function fetchLatestRelease(): Promise<UpdateReleaseInfo | null> {
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < RELEASE_TTL) {
    return cachedRelease.data
  }

  const updateProxyBaseUrl = getCurrentUpdateProxyBaseUrl()
  if (updateProxyBaseUrl) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(buildUpdateProxyUrl(updateProxyBaseUrl, '/api/updates/latest', {
        platform: 'darwin',
        arch: process.arch,
        current: app.getVersion(),
      }), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...getCurrentUpdateProxyHeaders(),
        },
        signal: ctrl.signal,
      })
      clearTimeout(t)
      if (!res.ok) return null
      const json = await res.json() as {
        success?: boolean
        data?: {
          latest?: string
          latest_notes?: string
          platform_asset?: { url?: string; size?: number }
        }
      }
      const latest = String(json.data?.latest || '')
      if (!latest) return null
      const data: UpdateReleaseInfo = {
        version: latest,
        notes: json.data?.latest_notes,
        assetUrl: json.data?.platform_asset?.url,
        assetSize: json.data?.platform_asset?.size,
      }
      cachedRelease = { fetchedAt: Date.now(), data }
      return data
    } catch {
      return null
    }
  }

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(RELEASE_API, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const list = (await res.json()) as GhRelease[]
    if (!Array.isArray(list)) return null
    // GitHub returns releases sorted by created_at DESC. We need the first
    // non-draft, non-prerelease entry. Compare semver tags as a tiebreaker
    // to be robust against out-of-order republishes.
    const eligible = list
      .filter(r => !r.draft && !r.prerelease && typeof r.tag_name === 'string')
      .sort((a, b) => compareVersion(
        (b.tag_name || '').replace(/^v/, ''),
        (a.tag_name || '').replace(/^v/, ''),
      ))
    const release = eligible[0] || null
    if (!release?.tag_name) return null
    const asset = pickMacAsset(release)
    const data: UpdateReleaseInfo = {
      version: release.tag_name.replace(/^v/, ''),
      notes: typeof release.body === 'string' ? release.body : undefined,
      assetUrl: asset?.browser_download_url,
      assetSize: asset?.size,
    }
    cachedRelease = { fetchedAt: Date.now(), data }
    return data
  } catch {
    return null
  }
}

function pickMacAsset(release: GhRelease): GhAsset | null {
  const assets = release.assets || []
  // Prefer arm64 on Apple Silicon, x64 on Intel.
  const isArm = process.arch === 'arm64'
  const dmg = assets.filter(a => /\.dmg$/i.test(a.name))
  if (!dmg.length) return null
  const arm64 = dmg.find(a => /arm64/i.test(a.name))
  const intel = dmg.find(a => !/arm64/i.test(a.name))
  if (isArm) return arm64 || intel || dmg[0]
  return intel || arm64 || dmg[0]
}

async function macCheck(): Promise<void> {
  emitStatus({ phase: 'checking' })
  const release = await fetchLatestRelease()
  const updateProxyBaseUrl = getCurrentUpdateProxyBaseUrl()
  if (!release?.version) {
    emitStatus({ phase: 'error', message: updateProxyBaseUrl
      ? '無法取得更新資訊。請確認 update proxy URL、proxy token 與 GitHub token 設定。'
      : '無法取得 GitHub Release 資訊。請確認 repo 已公開、GitHub 可連線，且未超過 API 配額。' })
    return
  }
  const latest = release.version
  const current = app.getVersion()
  if (compareVersion(latest, current) <= 0) {
    emitStatus({ phase: 'not-available', version: current })
    return
  }
  if (!release.assetUrl) {
    emitStatus({ phase: 'error', message: '此 Release 找不到對應的 macOS DMG 檔。' })
    return
  }
  emitStatus({
    phase: 'available',
    version: latest,
    notes: release.notes,
    assetUrl: release.assetUrl,
    assetSize: release.assetSize,
  })
}

async function macDownload(): Promise<void> {
  if (lastStatus.phase !== 'available') {
    await macCheck()
  }
  // Re-read lastStatus after potential macCheck mutation; widen narrowing.
  const snapshot = lastStatus
  if (snapshot.phase !== 'available') return
  const { assetUrl, version } = snapshot
  if (!assetUrl) {
    emitStatus({ phase: 'error', message: '下載連結不存在。' })
    return
  }
  try {
    const updatesDir = path.join(app.getPath('userData'), 'updates')
    fs.mkdirSync(updatesDir, { recursive: true })
    // Strip query / hash from URL path to derive a safe filename.
    const safeName = `voter-service-system-${version}-${process.arch}.dmg`
    const targetPath = path.join(updatesDir, safeName)

    emitStatus({ phase: 'downloading', percent: 0 })

    const res = await fetch(assetUrl, {
      headers: { 'User-Agent': USER_AGENT, ...getCurrentUpdateProxyHeaders() },
    })
    if (!res.ok || !res.body) {
      emitStatus({ phase: 'error', message: `下載失敗（HTTP ${res.status}）` })
      return
    }
    const total = Number(res.headers.get('content-length')) || snapshot.assetSize || 0

    const fileStream = fs.createWriteStream(targetPath)
    let transferred = 0
    let lastEmit = Date.now()
    const startedAt = Date.now()

    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        fileStream.write(Buffer.from(value))
        transferred += value.length
        const now = Date.now()
        if (now - lastEmit > 200) {
          const elapsedSec = (now - startedAt) / 1000
          const bytesPerSecond = elapsedSec > 0 ? transferred / elapsedSec : 0
          emitStatus({
            phase: 'downloading',
            percent: total > 0 ? Math.round((transferred / total) * 100) : 0,
            transferred,
            total,
            bytesPerSecond,
          })
          lastEmit = now
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
    })

    downloadedDmgPath = targetPath
    emitStatus({ phase: 'downloaded', version, filePath: targetPath })
  } catch (err: any) {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  }
}

async function macInstall(): Promise<void> {
  if (!downloadedDmgPath || !fs.existsSync(downloadedDmgPath)) {
    emitStatus({ phase: 'error', message: '找不到已下載的更新檔，請重新下載。' })
    return
  }
  try {
    await shell.openPath(downloadedDmgPath)
    // Note: don't quit here — Mac user must drag icon into Applications first.
    // We leave the app running and let them decide when to relaunch.
  } catch (err: any) {
    emitStatus({ phase: 'error', message: err?.message || String(err) })
  }
}

// ── Public init ────────────────────────────────────────────────
export function initAutoUpdate(window: BrowserWindow): void {
  mainWindowRef = window

  // Replay last status when renderer (re)mounts and asks.
  ipcMain.handle('update:get-status', () => lastStatus)

  ipcMain.handle('update:check', async () => {
    if (process.platform === 'win32') return winCheck()
    if (process.platform === 'darwin') return macCheck()
    emitStatus({ phase: 'error', message: '此平台不支援自動更新' })
  })

  ipcMain.handle('update:download', async () => {
    if (process.platform === 'win32') return winDownload()
    if (process.platform === 'darwin') return macDownload()
    emitStatus({ phase: 'error', message: '此平台不支援自動更新' })
  })

  ipcMain.handle('update:install', () => {
    if (process.platform === 'win32') return winInstall()
    if (process.platform === 'darwin') return macInstall()
    emitStatus({ phase: 'error', message: '此平台不支援自動更新' })
  })

  ipcMain.handle('update:supported', () => process.platform === 'win32' || process.platform === 'darwin')
}
