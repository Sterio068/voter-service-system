import React, { useState, useEffect } from 'react'
import {
  Card, Form, Input, Button, Typography, message, notification, Divider, Space, Alert,
  InputNumber, Table, Modal, Upload, Tag, Popconfirm, Switch, Select
} from 'antd'
import {
  SaveOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined,
  DatabaseOutlined, ReloadOutlined, ClockCircleOutlined, InfoCircleOutlined, FolderOpenOutlined
} from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'
import type { UploadFile } from 'antd/es/upload'

const { Title, Text } = Typography

declare const __APP_VERSION__: string

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function SettingsPage() {
  const [form] = Form.useForm()
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
  const [savingBackupPath, setSavingBackupPath] = useState(false)
  const isElectron = !!(window as any).electronAPI

  useEffect(() => {
    loadSettings()
    loadNetworkInfo()
    loadBackups()
    loadBackupPath()
  }, [])

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

  const loadBackupPath = async () => {
    try {
      const res = await api.get('/admin/backup/path')
      setBackupPath(res.data.data?.path || '')
    } catch {}
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

  const handleSave = async (values: any) => {
    setSaving(true)
    try {
      await api.put('/admin/settings', values)
      message.success('設定已儲存')
    } catch { message.error('儲存失敗') }
    finally { setSaving(false) }
  }

  const handleBackup = async () => {
    setBacking(true)
    try {
      const res = await api.post('/admin/backup')
      message.success(res.data.message)
      loadBackups()
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

  const backupColumns = [
    { title: '備份檔案', dataIndex: 'name', ellipsis: true },
    { title: '大小', dataIndex: 'size', width: 90, render: (s: number) => formatBytes(s) },
    { title: '建立時間', dataIndex: 'created_at', width: 150, render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', width: 60,
      render: (_: any, r: any) => (
        <Popconfirm title="確定刪除此備份？" onConfirm={() => handleDeleteBackup(r.name)}>
          <Button size="small" icon={<DeleteOutlined />} danger type="text" />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>⚙️ 系統設定</Title>
      </div>

      {/* 基本設定 */}
      <Card loading={loading} style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Divider orientation="left" orientationMargin={0}>基本資訊</Divider>
          <Form.Item name="office_name" label="服務處名稱">
            <Input placeholder="例：○○議員服務處" style={{ maxWidth: 400 }} />
          </Form.Item>

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
        {form.getFieldValue('last_auto_backup') && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            <ClockCircleOutlined /> 上次自動備份：{dayjs(form.getFieldValue('last_auto_backup')).format('YYYY-MM-DD HH:mm')}
          </Text>
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

      {/* 系統資訊 */}
      <Card title={<><InfoCircleOutlined /> 系統資訊</>} style={{ marginTop: 16 }}>
        <Text>版本：<strong>v{__APP_VERSION__}</strong></Text>
      </Card>

      {/* 還原 Modal */}
      <Modal
        title="從備份還原資料庫"
        open={restoreModalOpen}
        onCancel={() => setRestoreModalOpen(false)}
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
    </div>
  )
}
