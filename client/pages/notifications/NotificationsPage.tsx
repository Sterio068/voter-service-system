import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input,
  Select, message, Alert, Popconfirm
} from 'antd'
import { PlusOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

const CHANNEL_LABELS: Record<string, string> = { app: '系統通知', line: 'LINE', sms: '簡訊' }
const CHANNEL_COLORS: Record<string, string> = { app: 'blue', line: 'green', sms: 'orange' }
const STATUS_LABELS: Record<string, string> = { draft: '草稿', sent: '已發送', failed: '失敗' }
const STATUS_COLORS: Record<string, string> = { draft: 'default', sent: 'green', failed: 'red' }

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { fetchNotifications() }, [page])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/notifications?page=${page}&pageSize=20`)
      setNotifications(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    setLoading(false)
  }

  const handleCreate = async (values: any) => {
    try {
      await api.post('/notifications', values)
      message.success('通知草稿已建立')
      setCreateOpen(false); form.resetFields(); fetchNotifications()
    } catch { message.error('建立失敗') }
  }

  const handleSend = async (id: number) => {
    try {
      await api.post(`/notifications/${id}/send`)
      message.success('已標記為發送')
      fetchNotifications()
    } catch { message.error('操作失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`)
      message.success('通知已刪除')
      fetchNotifications()
    } catch { message.error('刪除失敗') }
  }

  const columns = [
    { title: '標題', dataIndex: 'title' },
    { title: '管道', dataIndex: 'channel', width: 90,
      render: (v: string) => <Tag color={CHANNEL_COLORS[v]}>{CHANNEL_LABELS[v] || v}</Tag> },
    { title: '對象', dataIndex: 'target_type', width: 80,
      render: (v: string) => v === 'all' ? '全部選民' : v },
    { title: '狀態', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '發送數', dataIndex: 'sent_count', width: 70 },
    { title: '建立時間', dataIndex: 'created_at', width: 120, render: (v: string) => v?.slice(0, 10) },
    { title: '操作', width: 100, render: (_: any, r: any) => (
      <Space>
        {r.status === 'draft' && (
          <Button size="small" type="primary" icon={<SendOutlined />}
            onClick={() => handleSend(r.id)}>標記發送</Button>
        )}
        {r.status === 'draft' && (
          <Popconfirm
            title="確定刪除此草稿通知？"
            okText="確定刪除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📢 通知管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true) }}>
          新增通知
        </Button>
      </div>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="LINE/簡訊實際發送需串接第三方 API（LINE Notify / 簡訊平台），目前為管理與記錄功能。"
      />
      <Card>
        <Table columns={columns} dataSource={notifications} rowKey="id" loading={loading} size="small"
          pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 筆`, onChange: setPage }} />
      </Card>
      <Modal title="新增通知" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()} okText="建立草稿" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="title" label="標題" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="content" label="內容" rules={[{ required: true }]}><TextArea rows={4} /></Form.Item>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="channel" label="發送管道" initialValue="app" style={{ flex: 1 }}>
              <Select>
                <Option value="app">系統通知</Option>
                <Option value="line">LINE</Option>
                <Option value="sms">簡訊</Option>
              </Select>
            </Form.Item>
            <Form.Item name="target_type" label="目標對象" initialValue="all" style={{ flex: 1 }}>
              <Select>
                <Option value="all">全部選民</Option>
                <Option value="tag">依標籤</Option>
                <Option value="area">依選區</Option>
              </Select>
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}
