import React, { useState, useEffect } from 'react'
import { Upload, Button, List, Typography, Space, Popconfirm, message, Image, Spin, Tag } from 'antd'
import { UploadOutlined, DeleteOutlined, FilePdfOutlined, FileImageOutlined, DownloadOutlined, PaperClipOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import api from '../utils/api'

const { Text } = Typography

interface Attachment {
  id: number
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
  uploader_name?: string
}

interface Props {
  refType: string
  refId: number
  readonly?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AttachmentUpload({ refType, refId, readonly }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)

  const fetchAttachments = async () => {
    setLoading(true)
    try {
      const res = await api.get('/attachments', { params: { ref_type: refType, ref_id: refId } })
      setAttachments(res.data.data || [])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (refId) fetchAttachments()
  }, [refType, refId])

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/attachments/${id}`)
      message.success('附件已刪除')
      fetchAttachments()
    } catch { message.error('刪除失敗') }
  }

  const handlePreview = (att: Attachment) => {
    const url = `/uploads/${att.file_path}`
    if (att.mime_type.startsWith('image/')) {
      setPreviewUrl(url)
      setPreviewVisible(true)
    } else {
      window.open(url, '_blank')
    }
  }

  const uploadProps: UploadProps = {
    accept: 'image/*,.pdf',
    showUploadList: false,
    beforeUpload: (file) => {
      const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf'
      if (!isAllowed) { message.error('僅支援 PDF 和圖片'); return false }
      if (file.size > 20 * 1024 * 1024) { message.error('檔案大小不能超過 20MB'); return false }
      return true
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file as File)
        await api.post(`/attachments?ref_type=${refType}&ref_id=${refId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        message.success('上傳成功')
        fetchAttachments()
        onSuccess?.({})
      } catch (err: any) {
        message.error(err.response?.data?.error || '上傳失敗')
        onError?.(err)
      } finally { setUploading(false) }
    },
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          <PaperClipOutlined style={{ marginRight: 6 }} />
          附件 ({attachments.length})
        </Text>
        {!readonly && (
          <Upload {...uploadProps}>
            <Button size="small" icon={<UploadOutlined />} loading={uploading}>
              上傳 PDF / 照片
            </Button>
          </Upload>
        )}
      </div>

      <Spin spinning={loading}>
        {attachments.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12, color: '#aaa' }}>尚無附件</Text>
        ) : (
          <List
            size="small"
            dataSource={attachments}
            renderItem={(att) => (
              <List.Item
                style={{ padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                actions={[
                  <Button
                    key="open"
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => handlePreview(att)}
                  >
                    開啟
                  </Button>,
                  ...(!readonly ? [
                    <Popconfirm
                      key="del"
                      title="確定刪除此附件？"
                      onConfirm={() => handleDelete(att.id)}
                      okText="刪除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ] : []),
                ]}
              >
                <Space>
                  {att.mime_type === 'application/pdf'
                    ? <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
                    : <FileImageOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                  }
                  <div>
                    <div style={{ fontSize: 13, lineHeight: 1.4, wordBreak: 'break-all' }}>
                      {att.file_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#8e8e93' }}>
                      {formatSize(att.file_size)}
                      {att.uploader_name && ` · ${att.uploader_name}`}
                      {att.created_at && ` · ${att.created_at.slice(0, 10)}`}
                    </div>
                  </div>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Spin>

      {/* 圖片預覽 */}
      <Image
        style={{ display: 'none' }}
        src={previewUrl || undefined}
        preview={{
          visible: previewVisible,
          onVisibleChange: (v) => { setPreviewVisible(v); if (!v) setPreviewUrl(null) },
        }}
      />
    </div>
  )
}
