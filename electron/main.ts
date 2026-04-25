import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, ipcMain } from 'electron'
import type { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs'
import { deflateSync } from 'zlib'
import {
  buildMachineFingerprint,
  resolveVendorPassword,
  verifyVendorPassword,
} from './security'

// ── 解鎖視窗：指紋不符時要求輸入密碼 ─────────────────────────────
function showUnlockWindow(vendorPassword: string): Promise<boolean> {
  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 380, height: 230, resizable: false, title: '軟體授權',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload-unlock.js'),
      },
    })
    win.setMenu(null)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui}
body{background:#f0f2f5;display:flex;align-items:center;justify-content:center;height:100vh}
.c{background:#fff;border-radius:8px;padding:28px;width:320px;box-shadow:0 2px 12px rgba(0,0,0,.12)}
h3{font-size:16px;margin-bottom:6px;color:#333}p{font-size:12px;color:#888;margin-bottom:16px}
input{width:100%;border:1px solid #d9d9d9;border-radius:4px;padding:8px 10px;font-size:14px;outline:none}
input:focus{border-color:#1677ff}button{width:100%;background:#1677ff;color:#fff;border:none;
border-radius:4px;padding:9px;font-size:14px;cursor:pointer;margin-top:12px}
.err{color:#d32f2f;font-size:12px;margin-top:8px;display:none}</style></head><body>
<div class="c"><h3>🔐 需要授權</h3>
<p>此軟體尚未在本機啟動，請聯絡供應商取得授權密碼。</p>
<input id="p" type="password" placeholder="請輸入授權密碼" onkeydown="if(event.key==='Enter')go()">
<div class="err" id="e">密碼錯誤，請重試</div>
<button onclick="go()">確認</button></div>
<script>
function go(){document.getElementById('e').style.display='none';window.unlockAPI.submit(document.getElementById('p').value)}
window.unlockAPI.onFailed(()=>{document.getElementById('e').style.display='block';document.getElementById('p').value='';document.getElementById('p').focus()})
</script></body></html>`
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    let resolved = false
    const handler = (_: any, pwd: string) => {
      if (verifyVendorPassword(pwd, vendorPassword)) {
        resolved = true
        ipcMain.removeListener('unlock-attempt', handler)
        win.close()
        resolve(true)
      } else {
        win.webContents.send('unlock-failed')
      }
    }
    ipcMain.on('unlock-attempt', handler)
    win.on('closed', () => { ipcMain.removeListener('unlock-attempt', handler); if (!resolved) resolve(false) })
  })
}

// ── 指紋驗證主流程 ────────────────────────────────────────────────
async function checkAndRegisterMachine(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true
  try {
    const vendorPassword = resolveVendorPassword()
    if (!vendorPassword) {
      console.warn('[VendorAuth] No vendor password configured. Machine lock is disabled for this production build.')
      return true
    }

    const { db } = require('../server/db/index') as typeof import('../server/db/index')
    const stored = db.prepare("SELECT value FROM settings WHERE key='machine_fingerprint'").get() as any
    const current = buildMachineFingerprint(vendorPassword)
    if (stored?.value === current) return true
    // 指紋不符或尚未登記 → 要求解鎖
    const ok = await showUnlockWindow(vendorPassword)
    if (ok) {
      db.prepare("INSERT INTO settings(key,value) VALUES('machine_fingerprint',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(current)
    }
    return ok
  } catch {
    return false // DB 異常視為未授權，fail closed
  }
}

const PORT = 8080
const SERVER_HEALTHCHECK_URL = `http://127.0.0.1:${PORT}/api/health`
const SERVER_HEALTHCHECK_INTERVAL_MS = 15000
const SERVER_HEALTHCHECK_FAILURE_THRESHOLD = 3
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverStarted = false
let restoreAppliedOnStartup = false
let startupRestoreFailureMessage: string | null = null
let startupRestoreFailedPath: string | null = null
let localServer: FastifyInstance | null = null
let serverHealthTimer: NodeJS.Timeout | null = null
let healthCheckFailures = 0
let healthCheckInFlight = false
let serverRestartInFlight: Promise<boolean> | null = null

// ── 設定檔管理（取代 electron-store） ────────────────────────────
interface AppConfig {
  dataPath?: string
}

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'app-config.json')
}

function loadConfig(): AppConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return {}
}

function saveConfig(cfg: AppConfig): void {
  try {
    const p = getConfigPath()
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (e) {
    console.error('saveConfig failed:', e)
  }
}

// ── 資料路徑設定精靈 ─────────────────────────────────────────────
async function initDataPath(): Promise<string> {
  const cfg = loadConfig()

  // 若已設定且路徑存在，直接使用
  if (cfg.dataPath && fs.existsSync(cfg.dataPath)) {
    return cfg.dataPath
  }

  // 首次設定或路徑失效
  const isReconfig = !!cfg.dataPath
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '選民服務系統' + (isReconfig ? ' — 資料路徑重新設定' : ' — 首次設定'),
    message: isReconfig
      ? `上次設定的資料路徑已無法存取：\n${cfg.dataPath}\n\n請重新選擇資料儲存位置。`
      : '歡迎使用選民服務系統！\n\n請選擇資料儲存位置：',
    detail: [
      '• 本機預設位置：儲存在此電腦的應用程式資料夾',
      '• 自訂位置：可選擇本機其他資料夾或外接磁碟',
      '',
      '⚠️ 請避免直接使用 NAS / 網路共享資料夾作為正式資料目錄，',
      '   以免造成 SQLite 鎖定、資料分流或還原困難。',
    ].join('\n'),
    buttons: ['使用本機預設位置', '選擇自訂位置...'],
    defaultId: 0,
    cancelId: 0,
  })

  let dataPath: string
  const defaultPath = app.getPath('userData')

  if (response === 1) {
    const result = await dialog.showOpenDialog({
      title: '選擇資料儲存資料夾',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
      message: '請選擇本機資料夾或外接磁碟資料夾',
      buttonLabel: '選擇此位置',
    })

    if (result.canceled || !result.filePaths[0]) {
      dataPath = defaultPath
    } else {
      dataPath = result.filePaths[0]
      // 測試寫入權限
      const testFile = path.join(dataPath, '.voter-service-write-test')
      try {
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
      } catch {
        await dialog.showErrorBox(
          '無法寫入',
          `無法寫入所選資料夾：\n${dataPath}\n\n已自動改用本機預設位置。`
        )
        dataPath = defaultPath
      }
    }
  } else {
    dataPath = defaultPath
  }

  // 建立必要子目錄
  fs.mkdirSync(dataPath, { recursive: true })
  fs.mkdirSync(path.join(dataPath, 'uploads'), { recursive: true })
  fs.mkdirSync(path.join(dataPath, 'backups'), { recursive: true })

  saveConfig({ dataPath })

  if (!isReconfig) {
    await dialog.showMessageBox({
      type: 'info',
      title: '設定完成',
      message: '資料儲存位置已設定',
      detail: `路徑：${dataPath}\n\n如需搬移資料，請改用「備份 → 還原」流程，避免直接切換到另一個空白資料目錄。`,
      buttons: ['開始使用'],
    })
  }

  return dataPath
}

// ── Tray icon ──────────────────────────────────────────────────
function buildTrayIcon(): Electron.NativeImage {
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) crc = (crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const t = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, crcBuf])
  }

  const W = 16, H = 16
  const raw = Buffer.alloc((1 + W * 3) * H)
  const checkmark = new Set([
    '3,10','4,11','5,12','6,11','7,10','8,9','9,8','10,7','11,6','12,5'
  ])
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 3)
    raw[off] = 0
    for (let x = 0; x < W; x++) {
      const p = off + 1 + x * 3
      const isEdge = x < 1 || x > W - 2 || y < 1 || y > H - 2
      const isMark = checkmark.has(`${x},${y}`)
      if (isEdge)      { raw[p] = 0; raw[p+1] = 87; raw[p+2] = 200 }
      else if (isMark) { raw[p] = 255; raw[p+1] = 255; raw[p+2] = 255 }
      else             { raw[p] = 0; raw[p+1] = 122; raw[p+2] = 255 }
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 2

  const compressed = deflateSync(raw)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))])
  const img = nativeImage.createFromBuffer(png)
  img.setTemplateImage(process.platform === 'darwin')
  return img
}

// ── Server ────────────────────────────────────────────────────
function stopServerWatchdog() {
  if (serverHealthTimer) {
    clearInterval(serverHealthTimer)
    serverHealthTimer = null
  }
  healthCheckFailures = 0
}

async function pingLocalServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(SERVER_HEALTHCHECK_URL, {
      signal: AbortSignal.timeout(4000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function stopServer(): Promise<void> {
  stopServerWatchdog()
  const runningServer = localServer
  localServer = null
  serverStarted = false
  if (!runningServer) return
  try {
    await runningServer.close()
  } catch (error) {
    console.error('[Server] 關閉失敗:', error)
  }
}

function startServerWatchdog() {
  if (serverHealthTimer) return
  serverHealthTimer = setInterval(async () => {
    if (!serverStarted || !localServer || serverRestartInFlight || healthCheckInFlight) return
    healthCheckInFlight = true
    try {
      const healthy = await pingLocalServerHealth()
      if (healthy) {
        healthCheckFailures = 0
        return
      }

      healthCheckFailures += 1
      console.warn(`[Server] 健康檢查失敗 (${healthCheckFailures}/${SERVER_HEALTHCHECK_FAILURE_THRESHOLD})`)
      if (healthCheckFailures < SERVER_HEALTHCHECK_FAILURE_THRESHOLD) return

      healthCheckFailures = 0
      serverRestartInFlight = restartServer('本機伺服器健康檢查連續失敗')
      await serverRestartInFlight
    } finally {
      healthCheckInFlight = false
      serverRestartInFlight = null
    }
  }, SERVER_HEALTHCHECK_INTERVAL_MS)
}

async function startServer(options: { showFailureDialog?: boolean } = {}): Promise<boolean> {
  if (serverStarted && localServer) return true
  const { showFailureDialog = true } = options
  try {
    // 動態載入 server，確保在 DATA_PATH / UPLOADS_PATH 設定後才初始化 DB
    const serverModule = require('../server/index') as typeof import('../server/index')
    const fastify = await serverModule.buildServer()
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
    localServer = fastify
    serverStarted = true
    healthCheckFailures = 0
    console.log(`✅ 伺服器啟動於 http://localhost:${PORT}`)
    serverModule.startSchedules()
    startServerWatchdog()
    return true
  } catch (err) {
    localServer = null
    serverStarted = false
    console.error('伺服器啟動失敗:', err)
    if (showFailureDialog) {
      await dialog.showMessageBox({
        type: 'error',
        title: '啟動失敗',
        message: '伺服器無法啟動，請聯絡系統管理員。',
        detail: String(err),
        buttons: ['離開'],
      })
    }
    return false
  }
}

async function restartServer(reason: string): Promise<boolean> {
  console.warn(`[Server] 準備重啟：${reason}`)
  await stopServer()
  const restarted = await startServer({ showFailureDialog: false })
  if (!restarted) {
    await dialog.showMessageBox({
      type: 'error',
      title: '服務異常',
      message: '本機伺服器無法自動恢復，請重新啟動應用程式。',
      detail: reason,
      buttons: ['知道了'],
    })
    return false
  }

  console.log('[Server] 自動重啟完成')
  return true
}

// ── Tray ──────────────────────────────────────────────────────
function createTray() {
  const icon = buildTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('選民服務系統')

  const updateTrayMenu = () => {
    const isVisible = mainWindow?.isVisible() ?? false
    tray!.setContextMenu(Menu.buildFromTemplate([
      {
        label: isVisible ? '隱藏視窗' : '顯示視窗',
        click: () => {
          if (mainWindow?.isVisible()) { mainWindow.hide() }
          else { mainWindow?.show(); mainWindow?.focus() }
          updateTrayMenu()
        },
      },
      { type: 'separator' },
      { label: `選民服務系統 v${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: '離開', click: () => { tray?.destroy(); app.quit() } },
    ]))
  }
  updateTrayMenu()

  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) { mainWindow.focus() }
    else { mainWindow?.show(); mainWindow?.focus() }
    updateTrayMenu()
  })
}

// ── Window ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '選民服務系統',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  })

  const isDev = process.env.NODE_ENV !== 'production'
  const url = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`
  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    if (isDev) mainWindow!.webContents.openDevTools()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Window] 載入失敗 (${errorCode}): ${errorDescription}`)
    // 用本地 HTML 顯示錯誤，避免空白頁
    const errHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.box{background:#fff;padding:40px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.15);text-align:center;max-width:400px;}
h2{color:#d32f2f;margin:0 0 12px;}p{color:#555;margin:0 0 20px;line-height:1.6;}
button{background:#1677ff;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;}
button:hover{background:#0958d9;}</style></head><body>
<div class="box"><h2>⚠️ 無法連線到後端服務</h2>
<p>錯誤碼：${errorCode}<br>${errorDescription}</p>
<button onclick="location.reload()">重新嘗試</button></div></body></html>`
    mainWindow?.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errHtml))
  })

  mainWindow.on('close', (event) => {
    if (tray && process.platform !== 'darwin') {
      event.preventDefault()
      mainWindow?.hide()
      // 第一次最小化到系統匣時提示
      if (!(global as any).__trayHintShown) {
        (global as any).__trayHintShown = true
        tray?.displayBalloon?.({
          title: '選民服務系統仍在執行中',
          content: '系統已最小化到工作列右下角通知區。\n在通知圖示上按右鍵可選擇「離開」。',
          iconType: 'info',
        })
      }
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open external browser for http/https links; deny everything else
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Prevent navigation away from the app origin
  const allowedOrigins = [
    `http://localhost:${PORT}`,
    'http://localhost:5173',
  ]
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const origin = new URL(navigationUrl).origin
    if (!allowedOrigins.some(o => navigationUrl.startsWith(o))) {
      event.preventDefault()
      console.warn('[Security] Blocked navigation to:', navigationUrl)
    }
  })

  setupMenu()
}

// ── Menu ──────────────────────────────────────────────────────
function setupMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '系統',
      submenu: [
        { label: '關於選民服務系統', role: 'about' },
        { type: 'separator' },
        {
          label: '變更資料位置...',
          click: async () => {
            const cfg = loadConfig()
            const { response } = await dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '資料位置搬移說明',
              message: '目前版本不支援直接切換既有資料位置。',
              detail: [
                `目前資料位置：${cfg.dataPath || app.getPath('userData')}`,
                '',
                '直接改路徑會讓系統切到另一套資料目錄，造成看起來像資料遺失。',
                '若需搬移資料，請先執行手動備份，再在新位置初始化後做還原。',
              ].join('\n'),
              buttons: ['知道了', '開啟目前資料夾'],
              defaultId: 0,
              cancelId: 0,
            })
            if (response === 1) shell.openPath(cfg.dataPath || app.getPath('userData'))
          },
        },
        { type: 'separator' },
        { label: '離開', role: 'quit' },
      ],
    },
    {
      label: '編輯',
      submenu: [
        { label: '複製', role: 'copy' },
        { label: '貼上', role: 'paste' },
        { label: '全選', role: 'selectAll' },
      ],
    },
    {
      label: '視窗',
      submenu: [
        { label: '重新載入', role: 'reload' },
        ...(process.env.NODE_ENV !== 'production' ? [{ label: '開發者工具', role: 'toggleDevTools' as const }] : []),
        { type: 'separator' as const },
        { label: '最小化', role: 'minimize' as const },
        { label: '全螢幕', role: 'togglefullscreen' as const },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC ───────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-app-version', () => app.getVersion())

  // 隱藏維護功能：清除機器指紋（換電腦時用）
  ipcMain.handle('reset-fingerprint', (_: any, pwd: string) => {
    if (!verifyVendorPassword(pwd, resolveVendorPassword())) return { ok: false }
    try {
      const { db } = require('../server/db/index') as typeof import('../server/db/index')
      db.prepare("DELETE FROM settings WHERE key='machine_fingerprint'").run()
      return { ok: true }
    } catch { return { ok: false } }
  })
  ipcMain.handle('get-data-path', () => loadConfig().dataPath || app.getPath('userData'))
  ipcMain.handle('open-data-folder', () => {
    const cfg = loadConfig()
    if (cfg.dataPath) shell.openPath(cfg.dataPath)
  })
  ipcMain.handle('select-backup-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '選擇備份儲存目錄',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })
}

// ── App ready ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 防止多個實例同時執行（避免 port 衝突）
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  setupIPC()

  // 初始化資料路徑（生產模式才做精靈；開發模式直接用 ./data）
  if (process.env.NODE_ENV === 'production') {
    const dataPath = await initDataPath()
    process.env.DATA_PATH = dataPath
    process.env.UPLOADS_PATH = path.join(dataPath, 'uploads')
    process.env.BACKUPS_PATH = path.join(dataPath, 'backups')
    // 先執行 migration 初始化 DB（不啟動 HTTP server）
    // 讓授權驗證能讀取 settings 表，且 server 不會在驗證前就對外開放
    const { runMigrations } = require('../server/db/migrate') as typeof import('../server/db/migrate')
    await runMigrations()
    const { startupRestoreApplied, startupRestoreResult } = require('../server/db/index') as typeof import('../server/db/index')
    restoreAppliedOnStartup = startupRestoreApplied
    startupRestoreFailureMessage = startupRestoreResult.error
    startupRestoreFailedPath = startupRestoreResult.failedRestorePath

    // 授權驗證必須在 server 啟動前完成，避免 API 在解鎖期間對區網開放
    const licensed = await checkAndRegisterMachine()
    if (!licensed) {
      dialog.showErrorBox('未授權', '軟體授權驗證失敗，程式即將關閉。')
      app.quit()
      return
    }

    const ok = await startServer()
    if (!ok) {
      app.quit()
      return
    }
  }

  createTray()
  createWindow()
  if (restoreAppliedOnStartup && mainWindow) {
    mainWindow.once('ready-to-show', () => {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: '還原完成',
        message: '系統已在啟動時套用待還原的資料庫。',
        detail: '請登入後確認選民、陳情與操作紀錄是否符合預期，並保留 pre-restore 備份直到驗收完成。',
        buttons: ['知道了'],
      }).catch(() => {})
    })
  } else if (startupRestoreFailureMessage && mainWindow) {
    mainWindow.once('ready-to-show', () => {
      dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: '還原未套用',
        message: '待還原資料庫在啟動時未能成功套用，系統已回復到原本資料庫。',
        detail: [
          startupRestoreFailureMessage,
          startupRestoreFailedPath ? `失敗還原檔：${startupRestoreFailedPath}` : '',
          '請先確認目前資料正確，再決定是否重新執行還原。',
        ].filter(Boolean).join('\n'),
        buttons: ['知道了'],
      }).catch(() => {})
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 結束前關閉 SQLite 連線，避免 better-sqlite3 NAPI cleanup crash
app.on('will-quit', () => {
  stopServerWatchdog()
  if (localServer) {
    localServer.close().catch((error) => {
      console.error('[Cleanup] server.close() failed:', error)
    })
    localServer = null
  }
  if (!serverStarted) return
  try {
    const { db } = require('../server/db/index') as typeof import('../server/db/index')
    db.close()
  } catch (e) {
    console.error('[Cleanup] db.close() failed:', e)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
