import React, { useState, useEffect } from 'react'
import {
  Card, Form, Input, Button, Typography, message, notification, Divider, Space, Alert,
  InputNumber, Table, Modal, Upload, Tag, Popconfirm, Switch, Select, Row, Col
} from 'antd'
import {
  SaveOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined,
  DatabaseOutlined, ReloadOutlined, ClockCircleOutlined, InfoCircleOutlined, FolderOpenOutlined,
  CalendarOutlined, LinkOutlined, PlusOutlined, WifiOutlined, CopyOutlined, CheckOutlined,
  MobileOutlined, RobotOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import MetricCard from '../../components/ui/MetricCard'
import AppUpdater from '../../components/AppUpdater'
import dayjs from 'dayjs'
import QRCode from 'qrcode'
import type { UploadFile } from 'antd/es/upload'

const { Text } = Typography

declare const __APP_VERSION__: string

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function SettingsPage() {
  const [form] = Form.useForm()
  const lastAutoBackup = Form.useWatch('last_auto_backup', form)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [networkInfo, setNetworkInfo] = useState<any>(null)
  const [backups, setBackups] = useState<any[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backing, setBacking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [restoreFile, setRestoreFile] = useState<UploadFile | null>(null)
  const [restoreModalOpen, setRestoreModalOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [backupPath, setBackupPath] = useState<string>('')
  const [backupStatus, setBackupStatus] = useState<any>(null)
  const [backupPathPolicy, setBackupPathPolicy] = useState<{ whitelist_enforced: boolean; allowed_roots: string[] }>({ whitelist_enforced: false, allowed_roots: [] })
  const [savingBackupPath, setSavingBackupPath] = useState(false)
  const [verifyingBackup, setVerifyingBackup] = useState<string | null>(null)
  const isElectron = !!(window as any).electronAPI
  const [tailscale, setTailscale] = useState<{ installed: boolean; running: boolean; ip: string | null; port: number } | null>(null)
  const [tailscaleLoading, setTailscaleLoading] = useState(false)
  const [tsQrDataUrl, setTsQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [gcalStatus, setGcalStatus] = useState<any>(null)
  const [gcalCredForm] = Form.useForm()
  const [gcalConnecting, setGcalConnecting] = useState(false)
  const [gcalLabelInput, setGcalLabelInput] = useState('')
  const [aiConfig, setAiConfig] = useState<any>({ provider: 'none', model: '', apiKey: '', baseUrl: 'http://localhost:11434', maxTokens: 1024 })
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [dataQuality, setDataQuality] = useState<any>(null)
  const [dataQualityLoading, setDataQualityLoading] = useState(false)
  const [retentionPreview, setRetentionPreview] = useState<any>(null)
  const [retentionLoading, setRetentionLoading] = useState(false)
  const [retentionRunning, setRetentionRunning] = useState(false)
  const [retentionModalOpen, setRetentionModalOpen] = useState(false)
  const [retentionConfirmForm] = Form.useForm()
  const [systemHealth, setSystemHealth] = useState<any>(null)

  useEffect(() => {
    loadSettings()
    loadNetworkInfo()
    loadBackups()
    loadBackupStatus()
    loadBackupPath()
    loadGcalStatus()
    loadTailscale()
    loadAIConfig()
    loadRetentionPreview()
    loadSystemHealth()
  }, [])

  const loadSystemHealth = async () => {
    try {
      const res = await api.get('/admin/system-health')
      setSystemHealth(res.data?.data || res.data || null)
    } catch {
      // 部分角色可能 403，靜默忽略
    }
  }

  const loadSettings = async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/settings')
      form.setFieldsValue(res.data.data || {})
    } catch { message.error('載入設定失敗') }
    finally { setLoading(false) }
  }

  const loadNetworkInfo = async () => {
    try {
      const res = await api.get('/network-info')
      setNetworkInfo(res.data.data)
    } catch {}
  }

  const loadTailscale = async () => {
    setTailscaleLoading(true)
    try {
      const res = await api.get('/admin/tailscale/status')
      const data = res.data.data
      setTailscale(data)
      if (data.running && data.ip) {
        const url = `http://${data.ip}:${data.port}`
        QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setTsQrDataUrl).catch(() => {})
      }
    } catch {} finally { setTailscaleLoading(false) }
  }

  const handleCopyTsUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const loadBackupPath = async () => {
    try {
      const res = await api.get('/admin/backup/path')
      const data = res.data.data || {}
      setBackupPath(data.path || '')
      setBackupPathPolicy({
        whitelist_enforced: !!data.whitelist_enforced,
        allowed_roots: Array.isArray(data.allowed_roots) ? data.allowed_roots : [],
      })
    } catch {}
  }

  const loadGcalStatus = async () => {
    try {
      const res = await api.get('/integrations/gcal/status')
      setGcalStatus(res.data.data)
      if (res.data.data?.clientId) {
        gcalCredForm.setFieldsValue({ client_id: res.data.data.clientId })
      }
    } catch {}
  }

  const handleSaveGcalCreds = async (values: any) => {
    try {
      await api.post('/integrations/gcal/credentials', values)
      message.success('OAuth 設定已儲存')
      loadGcalStatus()
    } catch { message.error('儲存失敗') }
  }

  const handleConnectGcal = async () => {
    if (!gcalLabelInput.trim()) { message.warning('請輸入帳號標籤'); return }
    setGcalConnecting(true)
    try {
      const res = await api.get('/integrations/gcal/auth-url', { params: { label: gcalLabelInput } })
      window.open(res.data.data.url, '_blank')
      message.info('請在瀏覽器完成 Google 授權，完成後回來重新整理帳號列表')
      setTimeout(() => { loadGcalStatus(); setGcalConnecting(false) }, 5000)
    } catch (err: any) {
      message.error(err.response?.data?.error || '無法產生授權連結')
      setGcalConnecting(false)
    }
  }

  const handleDeleteGcalAccount = async (id: number) => {
    try {
      await api.delete(`/integrations/gcal/accounts/${id}`)
      message.success('已移除')
      loadGcalStatus()
    } catch { message.error('移除失敗') }
  }

  const loadAIConfig = async () => {
    try {
      const res = await api.get('/ai/config')
      setAiConfig(res.data.data || {})
    } catch {}
  }

  const handleSaveAI = async () => {
    setAiSaving(true)
    try {
      await api.put('/ai/config', aiConfig)
      message.success('AI 設定已儲存')
      setAiTestResult(null)
    } catch (e: any) {
      message.error(e?.response?.data?.error || '儲存失敗')
    } finally { setAiSaving(false) }
  }

  const handleTestAI = async () => {
    setAiTesting(true)
    setAiTestResult(null)
    try {
      const res = await api.post('/ai/test')
      setAiTestResult({ ok: res.data.success, message: res.data.data?.message || '測試完成' })
    } catch (e: any) {
      setAiTestResult({ ok: false, message: e?.response?.data?.error || '連線失敗' })
    } finally { setAiTesting(false) }
  }

  const loadDataQuality = async () => {
    setDataQualityLoading(true)
    try {
      const res = await api.get('/admin/data-quality')
      setDataQuality(res.data.data)
    } catch (e: any) {
      message.error(e?.response?.data?.error || '資料品質掃描失敗')
    } finally {
      setDataQualityLoading(false)
    }
  }

  const loadRetentionPreview = async () => {
    setRetentionLoading(true)
    try {
      const res = await api.get('/admin/data-retention/preview')
      setRetentionPreview(res.data.data)
    } catch (e: any) {
      message.error(e?.response?.data?.error || '資料保留預覽失敗')
    } finally {
      setRetentionLoading(false)
    }
  }

  const handleRunRetention = async () => {
    const values = await retentionConfirmForm.validateFields()
    setRetentionRunning(true)
    try {
      const res = await api.post('/admin/data-retention/run', { confirm: values.confirm })
      message.success(res.data.message || '資料保留清理已完成')
      setRetentionModalOpen(false)
      retentionConfirmForm.resetFields()
      loadRetentionPreview()
      loadDataQuality()
    } catch (e: any) {
      message.error(e?.response?.data?.error || '資料保留清理失敗')
    } finally {
      setRetentionRunning(false)
    }
  }

  const handleSelectBackupPath = async () => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.selectBackupPath) {
      message.warning('請在桌面應用程式中使用此功能')
      return
    }
    const selected = await electronAPI.selectBackupPath()
    if (!selected) return
    setSavingBackupPath(true)
    try {
      const res = await api.post('/admin/backup/path', { path: selected })
      setBackupPath(res.data.data?.path || selected)
      message.success('備份目錄已更新')
      loadBackups()
    } catch (err: any) {
      message.error(err.response?.data?.error || '設定失敗')
    } finally {
      setSavingBackupPath(false)
    }
  }

  const loadBackups = async () => {
    setBackupLoading(true)
    try {
      const res = await api.get('/admin/backup/list')
      setBackups(res.data.data || [])
    } catch {}
    finally { setBackupLoading(false) }
  }

  const loadBackupStatus = async () => {
    try {
      const res = await api.get('/admin/backup/status')
      setBackupStatus(res.data.data || null)
    } catch {}
  }

  const handleSave = async (values: any) => {
    setSaving(true)
    try {
      await api.put('/admin/settings', values)
      message.success('設定已儲存')
      loadRetentionPreview()
    } catch { message.error('儲存失敗') }
    finally { setSaving(false) }
  }

  const handleBackup = async () => {
    setBacking(true)
    try {
      const res = await api.post('/admin/backup')
      message.success(res.data.message)
      loadBackups()
      loadBackupStatus()
      notification.info({
        message: '備份完成',
        description: '建議將備份檔複製到外部裝置或雲端儲存，以防止硬碟損壞造成資料遺失。',
        duration: 8,
      })
    } catch { message.error('備份失敗') }
    finally { setBacking(false) }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await api.get('/admin/backup/download', { responseType: 'blob' })
      const cd = res.headers['content-disposition'] || ''
      const fname = decodeURIComponent(cd.split("UTF-8''")[1] || `backup-${dayjs().format('YYYYMMDD')}.db`)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
      message.success('備份已下載')
      loadBackups()
    } catch { message.error('下載失敗') }
    finally { setDownloading(false) }
  }

  const handleRestore = async () => {
    if (!restoreFile?.originFileObj) return message.error('請選擇備份檔案')
    setRestoring(true)
    try {
      const formData = new FormData()
      formData.append('file', restoreFile.originFileObj)
      const res = await api.post('/admin/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      message.success(res.data.message)
      setRestoreModalOpen(false)
    } catch (err: any) {
      message.error(err.response?.data?.error || '還原失敗')
    } finally {
      setRestoring(false)
    }
  }

  const handleDeleteBackup = async (name: string) => {
    try {
      await api.delete(`/admin/backup/${name}`)
      message.success('已刪除')
      loadBackups()
    } catch { message.error('刪除失敗') }
  }

  const handleVerifyBackup = async (name: string) => {
    setVerifyingBackup(name)
    try {
      const res = await api.get(`/backup/verify/${encodeURIComponent(name)}`)
      const data = res.data.data
      if (data?.backup_file_ok && data?.signature_ok) {
        notification.success({ message: '備份驗證通過', description: '完整性、系統 schema 與簽章皆正常。' })
      } else if (data?.backup_file_ok && data?.trust_level === 'unsigned_legacy') {
        notification.warning({ message: '備份檔案可用，但缺少簽章', description: '這是舊格式備份。建議重新建立新備份以取得簽章保護。' })
      } else {
        notification.error({ message: '備份驗證未通過', description: `狀態：${data?.signature_status || data?.integrity_check || 'unknown'}` })
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '驗證失敗')
    } finally {
      setVerifyingBackup(null)
    }
  }

  const backupColumns = [
    { title: '備份檔案', dataIndex: 'name', ellipsis: true },
    { title: '大小', dataIndex: 'size', width: 90, render: (s: number) => formatBytes(s) },
    {
      title: '簽章',
      dataIndex: 'signed',
      width: 90,
      render: (signed: boolean) => signed
        ? <Tag color="green">已簽章</Tag>
        : <Tag color="orange">舊格式</Tag>,
    },
    { title: '建立時間', dataIndex: 'created_at', width: 150, render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', width: 130,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            loading={verifyingBackup === r.name}
            onClick={() => handleVerifyBackup(r.name)}
            type="text"
            title="驗證簽章"
            aria-label={`驗證備份 ${r.name} 的簽章`}
          />
          {r.signed && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              type="text"
              title="下載 .meta.json sidecar（搬到外部儲存時請和 .db 一起留存）"
              aria-label={`下載備份 ${r.name} 的 .meta.json sidecar`}
              onClick={async () => {
                try {
                  const res = await api.get('/admin/backup/download-meta', { params: { file: r.name }, responseType: 'blob' })
                  const blob = new Blob([res.data], { type: 'application/json;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${r.name}.meta.json`
                  document.body.appendChild(a); a.click(); a.remove()
                  URL.revokeObjectURL(url)
                } catch (e: any) {
                  message.error(e?.response?.data?.error || 'sidecar 下載失敗')
                }
              }}
            />
          )}
          <Popconfirm title="確定刪除此備份？" onConfirm={() => handleDeleteBackup(r.name)}>
            <Button size="small" icon={<DeleteOutlined />} danger type="text" aria-label={`刪除備份 ${r.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const dataQualityColumns = [
    { title: '檢查項目', dataIndex: 'label' },
    {
      title: '風險',
      dataIndex: 'severity',
      width: 90,
      render: (severity: string) => <Tag color={severity === 'high' ? 'red' : 'orange'}>{severity === 'high' ? '高' : '中'}</Tag>,
    },
    {
      title: '問題數',
      dataIndex: 'count',
      width: 90,
      render: (count: number) => <Text type={count > 0 ? 'danger' : 'success'} strong>{count}</Text>,
    },
  ]

  return (
    <PageScaffold
      eyebrow="System Governance"
      title="系統設定"
      titleLevel={4}
      variant="compact"
      description="集中管理服務處資訊、備份還原、資安連線、資料品質與資料保留政策。"
    >

      {/* System Health metric cards：DB 大小、最後備份、24h 錯誤、stage 警示 */}
      {systemHealth && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="資料庫大小"
              value={`${systemHealth.db_size_mb ?? 0} MB`}
              helper={systemHealth.schema_version ? `schema v${systemHealth.schema_version}` : 'WAL：' + (systemHealth.wal_present ? '啟用' : '未啟用')}
              icon={<DatabaseOutlined />}
              tone="blue"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="最近一次備份"
              value={systemHealth.last_backup ? dayjs(systemHealth.last_backup).format('MM/DD HH:mm') : '從未備份'}
              helper={systemHealth.backup_count != null ? `共 ${systemHealth.backup_count} 份備份` : undefined}
              icon={<DownloadOutlined />}
              tone={systemHealth.last_backup ? 'green' : 'amber'}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="24h 錯誤次數"
              value={systemHealth.error_count_24h ?? 0}
              helper={systemHealth.last_error ? '最近錯誤已記錄稽核' : '無異常'}
              icon={<InfoCircleOutlined />}
              tone={(systemHealth.error_count_24h ?? 0) > 0 ? 'red' : 'slate'}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="主表筆數最高"
              value={systemHealth.top_tables?.[0]?.rows ?? 0}
              helper={systemHealth.top_tables?.[0]?.name ? `表：${systemHealth.top_tables[0].name}` : undefined}
              icon={<DatabaseOutlined />}
              tone="purple"
            />
          </Col>
        </Row>
      )}

      {/* 軟體更新 */}
      <div style={{ marginBottom: 16 }}>
        <AppUpdater />
      </div>

      {/* 基本設定 */}
      <Card loading={loading} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Divider orientation="left" orientationMargin={0}>基本資訊</Divider>
          <Form.Item name="office_name" label="服務處名稱">
            <Input placeholder="例：○○議員服務處" style={{ maxWidth: 400 }} />
          </Form.Item>
          <Form.Item name="office_address" label="地址">
            <Input placeholder="例：100台北市中正區○○路○段○號" style={{ maxWidth: 480 }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="office_contact" label="聯絡人">
                <Input placeholder="例：王小明" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="office_phone" label="電話">
                <Input placeholder="例：(02)2XXX-XXXX" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="office_fax" label="傳真">
                <Input placeholder="例：(02)2XXX-XXXX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="office_email" label="電子信箱">
                <Input placeholder="例：service@example.gov.tw" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0}>自動備份</Divider>
          <Form.Item name="auto_backup_enabled" label="啟用自動備份" valuePropName="checked"
            getValueFromEvent={(v: boolean) => v ? '1' : '0'}
            getValueProps={(v: string) => ({ checked: v === '1' })}>
            <Switch checkedChildren="開啟" unCheckedChildren="關閉" />
          </Form.Item>
          <Form.Item name="auto_backup_interval" label="備份頻率">
            <Select style={{ width: 160 }}>
              <Select.Option value="daily">每天</Select.Option>
              <Select.Option value="weekly">每週</Select.Option>
            </Select>
          </Form.Item>

          <Divider orientation="left" orientationMargin={0}>安全設定</Divider>
          <Form.Item name="idle_timeout" label="閒置自動登出（分鐘）">
            <InputNumber min={5} max={480} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="login_lock_attempts" label="登入失敗鎖定次數">
            <InputNumber min={3} max={20} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="login_lock_minutes" label="鎖定時間（分鐘）">
            <InputNumber min={5} max={60} style={{ width: 150 }} />
          </Form.Item>

          <Divider orientation="left" orientationMargin={0}>資料保留政策</Divider>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="資料保留清理不會硬刪選民主檔"
            description="系統會封存舊稽核紀錄、刪除舊前端錯誤紀錄，並對超過期限的已停用選民做去識別化。實際執行前仍需在下方預覽並輸入確認字串。"
          />
          <Form.Item
            name="data_retention_enabled"
            label="啟用資料保留政策"
            valuePropName="checked"
            getValueFromEvent={(v: boolean) => v ? '1' : '0'}
            getValueProps={(v: string) => ({ checked: v === '1' })}
          >
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="retention_audit_archive_days" label="稽核紀錄封存天數">
                <InputNumber min={30} max={3650} addonAfter="天" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="retention_client_error_days" label="前端錯誤保留天數">
                <InputNumber min={7} max={3650} addonAfter="天" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="retention_soft_deleted_voter_days" label="停用選民去識別天數">
                <InputNumber min={30} max={3650} addonAfter="天" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              儲存設定
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 網路資訊 */}
      {networkInfo && (
        <Card title="📡 網路資訊" style={{ marginBottom: 16 }}>
          <Space direction="vertical">
            <Text>伺服器連接埠：<strong>{networkInfo.port}</strong></Text>
            {networkInfo.ips?.length > 0 ? (
              <>
                <Text>區域網路 IP：</Text>
                {networkInfo.ips.map((ip: string) => (
                  <Alert
                    key={ip}
                    type="info"
                    message={<>其他電腦可透過 <strong>http://{ip}:{networkInfo.port}</strong> 連線使用本系統</>}
                  />
                ))}
              </>
            ) : (
              <Text type="secondary">未偵測到區域網路 IP（單機模式）</Text>
            )}
          </Space>
        </Card>
      )}

      {/* Tailscale 外網存取 */}
      <Card
        title={<><MobileOutlined /> 外網手機存取（Tailscale VPN）</>}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadTailscale} loading={tailscaleLoading}>偵測</Button>}
        style={{ marginBottom: 16 }}
      >
        {tailscale === null ? (
          <Text type="secondary">偵測中…</Text>
        ) : tailscale.running && tailscale.ip ? (
          /* ── 已連線 ── */
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="success"
              showIcon
              message={<>Tailscale 已啟動 &nbsp;<Tag color="green">{tailscale.ip}</Tag></>}
              description="手機與主機都需安裝 Tailscale App 並登入同一帳號，即可透過以下網址存取系統。"
            />
            {(() => {
              const url = `http://${tailscale.ip}:${tailscale.port}`
              return (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  {tsQrDataUrl && (
                    <div style={{ textAlign: 'center' }}>
                      <img src={tsQrDataUrl} alt="QR Code" style={{ width: 120, height: 120, borderRadius: 8, border: '1px solid #e0e0e0' }} />
                      <div style={{ fontSize: 11, color: '#8e8e93', marginTop: 4 }}>手機掃描連線</div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Text strong style={{ fontSize: 13 }}>連線網址</Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <code style={{ background: '#f5f5f7', border: '1px solid #e0e0e0', borderRadius: 6, padding: '5px 12px', fontSize: 13, flex: 1, wordBreak: 'break-all' }}>{url}</code>
                      <Button
                        size="small"
                        icon={copied ? <CheckOutlined style={{ color: '#34C759' }} /> : <CopyOutlined />}
                        onClick={() => handleCopyTsUrl(url)}
                      >{copied ? '已複製' : '複製'}</Button>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                      手機開啟瀏覽器貼上此網址，或掃描 QR Code 即可連線。
                    </Text>
                  </div>
                </div>
              )
            })()}
          </Space>
        ) : (
          /* ── 未連線 ── */
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message={tailscale.installed ? 'Tailscale 已安裝，但尚未啟動或未登入' : 'Tailscale 尚未安裝'}
              description={
                tailscale.installed
                  ? '請啟動 Tailscale 並登入帳號後，點選上方「偵測」按鈕重新偵測。'
                  : '依照下方教學安裝 Tailscale 後，即可讓手機透過外網安全連線到本系統。'
              }
            />
            <div style={{ marginTop: 4 }}>
              <Text strong style={{ fontSize: 13 }}>設定步驟</Text>
              <ol style={{ paddingLeft: 20, margin: '8px 0', lineHeight: 2, fontSize: 13 }}>
                <li>前往 <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">tailscale.com/download</a> 下載並安裝主機版（macOS / Windows）</li>
                <li>登入或建立免費的 Tailscale 帳號</li>
                <li>主機安裝完成後點選「偵測」確認已取得 Tailscale IP</li>
                <li>手機（iOS / Android）至 App Store / Google Play 安裝 <strong>Tailscale</strong> App</li>
                <li>手機 App 登入<strong>同一個</strong> Tailscale 帳號</li>
                <li>手機瀏覽器開啟 <code>http://主機Tailscale-IP:{tailscale.port}</code> 即可連線</li>
              </ol>
              <Alert
                type="info"
                showIcon
                message="Tailscale 個人免費版最多支援 3 台裝置（主機 + 手機 × 2）。多人使用可申請免費的 Tailscale 組織帳號（最多 3 人免費）。"
                style={{ marginTop: 8 }}
              />
            </div>
          </Space>
        )}
      </Card>

      {/* 資料庫備份 */}
      <Card
        title={<><DatabaseOutlined /> 資料庫備份與還原</>}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={loadBackups} loading={backupLoading}>
            重新整理
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <Button icon={<DatabaseOutlined />} onClick={handleBackup} loading={backing}>
            備份到本機
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} loading={downloading}>
            下載備份檔
          </Button>
          <Button
            icon={<UploadOutlined />}
            danger
            onClick={() => { setRestoreFile(null); setRestoreModalOpen(true) }}
          >
            從備份還原
          </Button>
        </Space>

        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f5f5f5', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FolderOpenOutlined style={{ color: '#1677ff' }} />
          <Text style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>
            備份目錄：<code style={{ fontSize: 11 }}>{backupPath || '（預設）'}</code>
          </Text>
          {backupPathPolicy.whitelist_enforced && <Tag color="blue">目錄白名單</Tag>}
          {isElectron && (
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              loading={savingBackupPath}
              onClick={handleSelectBackupPath}
            >
              變更目錄
            </Button>
          )}
        </div>
        {backupPathPolicy.whitelist_enforced && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="備份目錄已啟用白名單限制"
            description={`允許根目錄：${backupPathPolicy.allowed_roots.join('、')}`}
          />
        )}
        {lastAutoBackup && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            <ClockCircleOutlined /> 上次自動備份：{dayjs(lastAutoBackup).format('YYYY-MM-DD HH:mm')}
          </Text>
        )}
        {backupStatus?.last_error && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="最近一次自動備份失敗"
            description={`${backupStatus.last_error_at ? `${dayjs(backupStatus.last_error_at).format('YYYY-MM-DD HH:mm')}：` : ''}${backupStatus.last_error}`}
          />
        )}

        <Table
          columns={backupColumns}
          dataSource={backups}
          rowKey="name"
          loading={backupLoading}
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: '尚無備份紀錄' }}
        />
      </Card>

      {/* Google Calendar 整合 */}
      <Card title={<><CalendarOutlined /> Google 日曆同步</>} style={{ marginTop: 16 }}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="設定後，新增/修改/刪除行程時會自動同步到已連結的 Google 日曆帳號"
          description={<>需先至 <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a> 建立 OAuth 2.0 用戶端 ID，授權重新導向 URI 填：<code>http://localhost:8080/api/integrations/gcal/callback</code></>}
        />

        <Divider orientation="left" orientationMargin={0}>OAuth 設定</Divider>
        <Form form={gcalCredForm} layout="vertical" onFinish={handleSaveGcalCreds} style={{ maxWidth: 500 }}>
          <Form.Item name="client_id" label="用戶端 ID（Client ID）" rules={[{ required: true }]}>
            <Input placeholder="xxxxxxx.apps.googleusercontent.com" />
          </Form.Item>
          <Form.Item name="client_secret" label="用戶端密鑰（Client Secret）">
            <Input.Password placeholder="填入後點儲存；已設定者留空不變" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>儲存 OAuth 設定</Button>
          </Form.Item>
        </Form>

        <Divider orientation="left" orientationMargin={0}>已連結帳號</Divider>
        {gcalStatus?.accounts?.length > 0 ? (
          <Table
            size="small"
            pagination={false}
            style={{ marginBottom: 16 }}
            dataSource={gcalStatus.accounts}
            rowKey="id"
            columns={[
              { title: '標籤', dataIndex: 'label' },
              { title: 'Email', dataIndex: 'email', render: (e: string) => e || '-' },
              { title: '日曆 ID', dataIndex: 'calendar_id', render: (c: string) => c || 'primary' },
              { title: '狀態', dataIndex: 'is_active', width: 70, render: (v: number) => v ? <Tag color="green">啟用</Tag> : <Tag>停用</Tag> },
              {
                title: '操作', width: 60,
                render: (_: any, r: any) => (
                  <Popconfirm title="確定移除此帳號連結？" onConfirm={() => handleDeleteGcalAccount(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} type="text" />
                  </Popconfirm>
                )
              }
            ]}
          />
        ) : (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>尚未連結任何 Google 帳號</Text>
        )}

        <Space>
          <Input
            placeholder="帳號標籤（例：辦公室日曆）"
            value={gcalLabelInput}
            onChange={e => setGcalLabelInput(e.target.value)}
            style={{ width: 200 }}
          />
          <Button
            icon={<LinkOutlined />}
            loading={gcalConnecting}
            disabled={!gcalStatus?.configured}
            onClick={handleConnectGcal}
          >
            連結 Google 帳號
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadGcalStatus}>重新整理</Button>
        </Space>
        {!gcalStatus?.configured && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            請先儲存 OAuth 設定才能連結帳號
          </Text>
        )}
      </Card>

      {/* 系統資訊 */}
      <Card title={<><InfoCircleOutlined /> 系統資訊</>} style={{ marginTop: 16 }}>
        <Text>版本：<strong>v{__APP_VERSION__}</strong></Text>
      </Card>

      {/* 資料品質 */}
      <Card
        title={<><DatabaseOutlined /> 資料品質掃描</>}
        style={{ marginTop: 16 }}
        extra={
          <Space>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              disabled={!dataQuality}
              onClick={async () => {
                try {
                  const res = await api.get('/admin/data-quality', { params: { format: 'csv' }, responseType: 'blob' })
                  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `data-quality-${dayjs().format('YYYY-MM-DD')}.csv`
                  document.body.appendChild(a); a.click(); a.remove()
                  URL.revokeObjectURL(url)
                } catch (e: any) {
                  message.error(e?.response?.data?.error || '匯出失敗')
                }
              }}
            >
              下載 CSV
            </Button>
            <Button size="small" icon={<ReloadOutlined />} loading={dataQualityLoading} onClick={loadDataQuality}>開始掃描</Button>
          </Space>
        }
      >
        {dataQuality ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type={dataQuality.summary?.status === 'ok' ? 'success' : dataQuality.summary?.status === 'attention' ? 'error' : 'warning'}
              showIcon
              message={
                dataQuality.summary?.status === 'ok'
                  ? '目前未偵測到資料品質問題'
                  : `偵測到 ${dataQuality.summary?.issue_count || 0} 個資料品質問題`
              }
              description={`高風險項目：${dataQuality.summary?.high_issue_count || 0}。掃描時間：${dayjs(dataQuality.checked_at).format('YYYY-MM-DD HH:mm:ss')}`}
            />
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              columns={dataQualityColumns}
              dataSource={dataQuality.checks || []}
            />
          </Space>
        ) : (
          <Text type="secondary">可掃描重複手機/身分證、孤兒附件、附件檔案遺失與關聯資料異常。</Text>
        )}
      </Card>

      {/* 資料保留 */}
      <Card
        title={<><DatabaseOutlined /> 資料保留預覽</>}
        style={{ marginTop: 16 }}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={retentionLoading} onClick={loadRetentionPreview}>重新預覽</Button>}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type={retentionPreview?.enabled ? 'warning' : 'info'}
            showIcon
            message={retentionPreview?.enabled ? '資料保留政策已啟用' : '資料保留政策尚未啟用'}
            description="執行前會再次要求輸入 RUN_RETENTION；請先確認近期備份已簽章且可驗證。"
          />
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Card size="small">
                <Text type="secondary">待封存稽核紀錄</Text>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{retentionPreview?.counts?.audit_logs_to_archive ?? 0}</div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Text type="secondary">待刪除前端錯誤</Text>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{retentionPreview?.counts?.client_errors_to_delete ?? 0}</div>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Text type="secondary">待去識別停用選民</Text>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{retentionPreview?.counts?.inactive_voters_to_anonymize ?? 0}</div>
              </Card>
            </Col>
          </Row>
          <Button
            danger
            disabled={!retentionPreview?.enabled}
            loading={retentionRunning}
            onClick={() => setRetentionModalOpen(true)}
          >
            執行資料保留清理
          </Button>
        </Space>
      </Card>

      {/* AI 助理設定 */}
      <Card
        title={<Space><RobotOutlined /><span>AI 助理設定</span></Space>}
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <div style={{ marginBottom: 8 }}><Text strong>AI 供應商</Text></div>
            <Select
              value={aiConfig.provider}
              onChange={v => setAiConfig((c: any) => ({ ...c, provider: v, model: '' }))}
              style={{ width: '100%' }}
            >
              <Select.Option value="none">停用</Select.Option>
              <Select.Option value="gemini">Google Gemini</Select.Option>
              <Select.Option value="openai">OpenAI</Select.Option>
              <Select.Option value="ollama">Ollama（本地）</Select.Option>
            </Select>
          </Col>
          <Col xs={24} md={8}>
            <div style={{ marginBottom: 8 }}><Text strong>模型名稱</Text></div>
            {aiConfig.provider === 'gemini' ? (
              <Select
                value={aiConfig.model || 'gemini-2.5-flash'}
                onChange={v => setAiConfig((c: any) => ({ ...c, model: v }))}
                style={{ width: '100%' }}
              >
                <Select.Option value="gemini-2.5-flash">gemini-2.5-flash（快速）</Select.Option>
                <Select.Option value="gemini-2.5-pro">gemini-2.5-pro（最強）</Select.Option>
                <Select.Option value="gemini-2.0-flash">gemini-2.0-flash（穩定）</Select.Option>
                <Select.Option value="gemini-1.5-flash">gemini-1.5-flash（輕量）</Select.Option>
                <Select.Option value="gemini-1.5-pro">gemini-1.5-pro（均衡）</Select.Option>
              </Select>
            ) : aiConfig.provider === 'openai' ? (
              <Select
                value={aiConfig.model || 'gpt-4o-mini'}
                onChange={v => setAiConfig((c: any) => ({ ...c, model: v }))}
                style={{ width: '100%' }}
              >
                <Select.Option value="gpt-4o-mini">gpt-4o-mini（快速）</Select.Option>
                <Select.Option value="gpt-4o">gpt-4o（均衡）</Select.Option>
                <Select.Option value="gpt-4.1">gpt-4.1（最新）</Select.Option>
              </Select>
            ) : (
              <Input
                value={aiConfig.model}
                onChange={e => setAiConfig((c: any) => ({ ...c, model: e.target.value }))}
                placeholder={aiConfig.provider === 'ollama' ? 'llama3.2' : '—'}
                disabled={aiConfig.provider === 'none'}
              />
            )}
          </Col>
          <Col xs={24} md={8}>
            <div style={{ marginBottom: 8 }}><Text strong>最大 Token 數</Text></div>
            <InputNumber
              value={aiConfig.maxTokens}
              onChange={v => setAiConfig((c: any) => ({ ...c, maxTokens: v }))}
              min={64} max={16000} style={{ width: '100%' }}
              disabled={aiConfig.provider === 'none'}
            />
          </Col>
        </Row>
        {(aiConfig.provider === 'gemini' || aiConfig.provider === 'openai') && (
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24}>
              <div style={{ marginBottom: 8 }}><Text strong>API 金鑰</Text></div>
              <Input.Password
                value={aiConfig.apiKey}
                onChange={e => setAiConfig((c: any) => ({ ...c, apiKey: e.target.value }))}
                placeholder={aiConfig.provider === 'gemini' ? 'AIza...' : 'sk-...'}
              />
            </Col>
          </Row>
        )}
        {aiConfig.provider === 'ollama' && (
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col xs={24}>
              <div style={{ marginBottom: 8 }}><Text strong>Ollama 端點</Text></div>
              <Input
                value={aiConfig.baseUrl}
                onChange={e => setAiConfig((c: any) => ({ ...c, baseUrl: e.target.value }))}
                placeholder="http://localhost:11434"
              />
            </Col>
          </Row>
        )}
        {aiTestResult && (
          <Alert
            style={{ marginTop: 12 }}
            type={aiTestResult.ok ? 'success' : 'error'}
            icon={aiTestResult.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            showIcon
            message={aiTestResult.ok ? 'AI 連線正常' : '連線失敗'}
            description={aiTestResult.message}
          />
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<SaveOutlined />} loading={aiSaving} onClick={handleSaveAI}>
            儲存 AI 設定
          </Button>
          <Button icon={<RobotOutlined />} loading={aiTesting} onClick={handleTestAI} disabled={aiConfig.provider === 'none'}>
            測試連線
          </Button>
        </div>
      </Card>

      {/* 還原 Modal */}
      <Modal
        title="從備份還原資料庫"
        open={restoreModalOpen}
        onCancel={() => { setRestoreModalOpen(false); setRestoreFile(null) }}
        footer={null}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="warning"
            showIcon
            message="還原後，目前所有資料將被備份檔案取代"
            description="系統會先自動備份目前資料庫，再執行還原。還原完成後需重新啟動系統。"
          />
          <Upload
            accept=".db"
            maxCount={1}
            beforeUpload={() => false}
            onChange={({ fileList }) => setRestoreFile(fileList[0] || null)}
            fileList={restoreFile ? [restoreFile] : []}
          >
            <Button icon={<UploadOutlined />}>選擇備份檔案 (.db)</Button>
          </Upload>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setRestoreModalOpen(false)}>取消</Button>
              <Button
                type="primary"
                danger
                loading={restoring}
                disabled={!restoreFile}
                onClick={handleRestore}
              >
                確認還原
              </Button>
            </Space>
          </div>
        </Space>
      </Modal>

      <Modal
        title="執行資料保留清理"
        open={retentionModalOpen}
        onCancel={() => { setRetentionModalOpen(false); retentionConfirmForm.resetFields() }}
        onOk={handleRunRetention}
        okText="確認執行"
        okButtonProps={{ danger: true, loading: retentionRunning }}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="此操作會封存或清理舊資料"
          description="請確認已完成最新備份，且備份驗證通過。停用選民會做去識別化以保留關聯完整性，不會硬刪主檔。"
        />
        <Form form={retentionConfirmForm} layout="vertical">
          <Form.Item
            name="confirm"
            label="確認字串"
            rules={[
              { required: true, message: '請輸入確認字串' },
              {
                validator: (_, value) => value === 'RUN_RETENTION'
                  ? Promise.resolve()
                  : Promise.reject(new Error('請輸入 RUN_RETENTION')),
              },
            ]}
          >
            <Input placeholder="RUN_RETENTION" />
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
