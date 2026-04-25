import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Progress, Space, Tag, Typography, message } from 'antd'
import {
  CloudDownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons'

const { Paragraph, Text } = Typography

type UpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; notes?: string; assetUrl?: string; assetSize?: number }
  | { phase: 'not-available'; version: string }
  | { phase: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { phase: 'downloaded'; version: string; filePath?: string }
  | { phase: 'error'; message: string }

type ElectronUpdateAPI = {
  isSupported: () => Promise<boolean>
  getStatus: () => Promise<UpdateStatus>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  onStatus: (cb: (s: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      getVersion?: () => Promise<string>
      update?: ElectronUpdateAPI
    }
  }
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function AppUpdater() {
  const updateApi = typeof window !== 'undefined' ? window.electronAPI?.update : undefined
  const platform = typeof window !== 'undefined' ? window.electronAPI?.platform : undefined
  const isMac = platform === 'darwin'

  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })
  const [currentVersion, setCurrentVersion] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!updateApi) return
    let mounted = true
    window.electronAPI?.getVersion?.().then(v => {
      if (mounted) setCurrentVersion(v || '')
    })
    updateApi.getStatus().then(s => {
      if (mounted && s) setStatus(s)
    })
    const off = updateApi.onStatus(s => { if (mounted) setStatus(s) })
    return () => { mounted = false; off() }
  }, [updateApi])

  const handleCheck = async () => {
    if (!updateApi) return
    setBusy(true)
    try { await updateApi.check() } finally { setBusy(false) }
  }
  const handleDownload = async () => {
    if (!updateApi) return
    setBusy(true)
    try { await updateApi.download() } catch (e: any) { message.error(e?.message || '下載失敗') } finally { setBusy(false) }
  }
  const handleInstall = async () => {
    if (!updateApi) return
    try { await updateApi.install() } catch (e: any) { message.error(e?.message || '安裝失敗') }
  }

  const installLabel = useMemo(() => {
    if (isMac) return '開啟安裝檔（請拖曳到 Applications）'
    return '立即重啟並安裝'
  }, [isMac])

  // Browser / LAN users — no Electron API.
  if (!updateApi) {
    return (
      <Card
        title={
          <span>
            <CloudDownloadOutlined style={{ marginRight: 8, color: '#007AFF' }} />
            軟體更新
          </span>
        }
        size="small"
        style={{ borderRadius: 12 }}
      >
        <Alert
          type="info"
          showIcon
          message="瀏覽器存取無法直接更新"
          description="此頁透過區網瀏覽器存取，更新需在主機桌面版（Mac/Windows App）操作。請通知主機管理員打開應用程式 → 系統設定 → 軟體更新。"
        />
      </Card>
    )
  }

  return (
    <Card
      title={
        <span>
          <CloudDownloadOutlined style={{ marginRight: 8, color: '#007AFF' }} />
          軟體更新
        </span>
      }
      size="small"
      style={{ borderRadius: 12 }}
      extra={currentVersion && <Tag>目前版本 v{currentVersion}</Tag>}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* phase: idle */}
        {status.phase === 'idle' && (
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            點擊下方按鈕檢查 GitHub 是否有新版本。系統每小時也會自動檢查一次。
          </Paragraph>
        )}

        {/* phase: checking */}
        {status.phase === 'checking' && (
          <Alert type="info" showIcon message="正在檢查更新…" />
        )}

        {/* phase: not-available */}
        {status.phase === 'not-available' && (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message={`目前已是最新版本 v${status.version}`}
          />
        )}

        {/* phase: available */}
        {status.phase === 'available' && (
          <Alert
            type="warning"
            showIcon
            icon={<RocketOutlined />}
            message={
              <Space size={6}>
                偵測到新版本
                <Tag color="green">v{status.version}</Tag>
                {status.assetSize ? <Text type="secondary">{formatBytes(status.assetSize)}</Text> : null}
              </Space>
            }
            description={
              status.notes ? (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#1677ff' }}>查看更新內容</summary>
                  <pre style={{
                    fontSize: 12, marginTop: 8, padding: 10, background: '#fafafa',
                    border: '1px solid #f0f0f0', borderRadius: 6, maxHeight: 220, overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}>{status.notes}</pre>
                </details>
              ) : null
            }
          />
        )}

        {/* phase: downloading */}
        {status.phase === 'downloading' && (
          <div>
            <Progress percent={status.percent} status="active" />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatBytes(status.transferred)} / {formatBytes(status.total)}
              {status.bytesPerSecond ? ` · ${formatBytes(status.bytesPerSecond)}/s` : ''}
            </Text>
          </div>
        )}

        {/* phase: downloaded */}
        {status.phase === 'downloaded' && (
          <Alert
            type="success"
            showIcon
            message={`已下載 v${status.version}`}
            description={
              isMac
                ? '點擊下方按鈕開啟 DMG 檔，再把應用程式圖示拖曳到 Applications 即完成升級。'
                : '點擊下方按鈕，系統會自動關閉並執行安裝程式。'
            }
          />
        )}

        {/* phase: error */}
        {status.phase === 'error' && (
          <Alert type="error" showIcon message="更新失敗" description={status.message} />
        )}

        {/* Action buttons */}
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleCheck}
            loading={busy && status.phase === 'checking'}
            disabled={status.phase === 'downloading'}
          >
            檢查更新
          </Button>

          {status.phase === 'available' && (
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              onClick={handleDownload}
              loading={busy}
            >
              下載更新
            </Button>
          )}

          {status.phase === 'downloaded' && (
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleInstall}
            >
              {installLabel}
            </Button>
          )}
        </Space>

        {isMac && status.phase !== 'idle' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            註：macOS 版本未經代碼簽章，無法靜默覆蓋安裝；下載後會自動開啟 DMG，由你拖曳至 Applications 完成升級（約 30 秒）。
          </Text>
        )}
      </Space>
    </Card>
  )
}
