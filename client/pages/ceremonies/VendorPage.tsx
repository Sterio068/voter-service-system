import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Typography, Modal, Form, Input, Select,
  message, Popconfirm, Tag, Drawer, Descriptions, Statistic, Row, Col,
  Rate, InputNumber, Switch, Tabs, Empty, Badge
} from 'antd'
import {
  PlusOutlined, EditOutlined, ShopOutlined, PhoneOutlined,
  DollarOutlined, FileTextOutlined, StarOutlined
} from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const CATEGORY_LABELS: Record<string, string> = {
  flower: '花店', gift: '禮盒', print: '印刷', food: '餐飲', other: '其他'
}
const CATEGORY_COLORS: Record<string, string> = {
  flower: 'pink', gift: 'gold', print: 'blue', food: 'green', other: 'default'
}
const CEREMONY_LABELS: Record<string, string> = {
  wedding: '婚禮', funeral: '喪禮', birthday: '壽宴', full_moon: '彌月',
  opening: '開幕', graduation: '升學', election: '選舉', condolence: '慰問', other: '其他'
}

export default function VendorPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailItems, setDetailItems] = useState<any[]>([])
  const [detailStats, setDetailStats] = useState<any>(null)
  const [monthlyStats, setMonthlyStats] = useState<any[]>([])
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [form] = Form.useForm()

  useEffect(() => { fetchVendors() }, [])

  const fetchVendors = async () => {
    setLoading(true)
    try {
      const res = await api.get('/vendors?active=all&pageSize=200')
      setVendors(res.data.data || [])
    } catch { message.error('載入廠商失敗') }
    finally { setLoading(false) }
  }

  const fetchDetail = async (id: number) => {
    try {
      const [detailRes, statsRes] = await Promise.all([
        api.get(`/vendors/${id}`),
        api.get(`/vendors/${id}/stats?year=${dayjs().year()}`)
      ])
      setDetail(detailRes.data.data)
      setDetailItems(detailRes.data.items || [])
      setDetailStats(detailRes.data.stats)
      setMonthlyStats(statsRes.data.data || [])
      setDetailOpen(true)
    } catch { message.error('載入廠商資料失敗') }
  }

  const handleSave = async (values: any) => {
    try {
      if (editingItem) {
        await api.put(`/vendors/${editingItem.id}`, { ...values, is_active: editingItem.is_active })
        message.success('已更新')
      } else {
        await api.post('/vendors', values)
        message.success('廠商已新增')
      }
      setModalOpen(false)
      form.resetFields()
      setEditingItem(null)
      fetchVendors()
    } catch { message.error('儲存失敗') }
  }

  const handleEdit = (record: any) => {
    setEditingItem(record)
    form.setFieldsValue({ ...record })
    setModalOpen(true)
  }

  const handleToggleActive = async (id: number, current: number) => {
    const vendor = vendors.find(v => v.id === id)
    if (!vendor) return
    try {
      await api.put(`/vendors/${id}`, { ...vendor, is_active: current ? 0 : 1 })
      fetchVendors()
    } catch { message.error('狀態更新失敗') }
  }

  const filteredVendors = filterCategory
    ? vendors.filter(v => v.category === filterCategory)
    : vendors

  const columns = [
    {
      title: '廠商名稱', dataIndex: 'name', key: 'name',
      render: (name: string, record: any) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => fetchDetail(record.id)}>
          <ShopOutlined style={{ marginRight: 4 }} />{name}
        </Button>
      )
    },
    {
      title: '類別', dataIndex: 'category', key: 'category',
      render: (c: string) => <Tag color={CATEGORY_COLORS[c] || 'default'}>{CATEGORY_LABELS[c] || c}</Tag>
    },
    { title: '聯絡人', dataIndex: 'contact_person', key: 'contact_person', render: (v: string) => v || '—' },
    {
      title: '電話', dataIndex: 'phone', key: 'phone',
      render: (v: string) => v ? <a href={`tel:${v}`}><PhoneOutlined style={{ marginRight: 4 }} />{v}</a> : '—'
    },
    {
      title: '評分', dataIndex: 'rating', key: 'rating',
      render: (r: number) => r ? <Rate disabled value={r} style={{ fontSize: 12 }} /> : <Text type="secondary">未評</Text>
    },
    {
      title: '狀態', dataIndex: 'is_active', key: 'is_active',
      render: (v: number, record: any) => (
        <Switch size="small" checked={!!v} onChange={() => handleToggleActive(record.id, v)} />
      )
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>編輯</Button>
      )
    }
  ]

  const itemColumns = [
    { title: '日期', dataIndex: 'event_date', key: 'event_date', width: 100, render: (v: string) => v || '—' },
    { title: '類型', dataIndex: 'ceremony_type', key: 'ceremony_type', width: 70, render: (v: string) => CEREMONY_LABELS[v] || v },
    { title: '受贈人', dataIndex: 'recipient_name', key: 'recipient_name', width: 90 },
    { title: '品項', dataIndex: 'item_name', key: 'item_name' },
    {
      title: '數量', key: 'qty', width: 70,
      render: (_: any, r: any) => `${r.quantity} × ${r.unit_price.toLocaleString()}`
    },
    {
      title: '金額', dataIndex: 'amount', key: 'amount', width: 90,
      render: (v: number) => <Text strong>NT$ {v.toLocaleString()}</Text>
    },
    {
      title: '付款', dataIndex: 'payment_status', key: 'payment_status', width: 70,
      render: (v: string) => v === 'paid'
        ? <Tag color="success">已付款</Tag>
        : <Tag color="warning">待付款</Tag>
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>🏪 廠商管理</Title>
        <Space>
          <Select placeholder="篩選類別" allowClear style={{ width: 120 }} onChange={v => setFilterCategory(v || '')} value={filterCategory || undefined}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); form.resetFields(); setModalOpen(true) }}>新增廠商</Button>
        </Space>
      </div>

      <Card>
        <Table
          dataSource={filteredVendors}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 筆` }}
          rowClassName={(r) => r.is_active ? '' : 'opacity-50'}
        />
      </Card>

      {/* 新增/編輯 Modal */}
      <Modal
        title={editingItem ? '編輯廠商' : '新增廠商'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setEditingItem(null) }}
        onOk={() => form.submit()}
        okText="儲存"
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="name" label="廠商名稱" rules={[{ required: true, message: '請輸入廠商名稱' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="category" label="類別" initialValue="other">
                <Select>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact_person" label="聯絡人"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="電話"><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="line_id" label="LINE ID"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rating" label="評分">
                <Rate />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="bank_account" label="銀行帳號（付款用）"><Input placeholder="銀行名稱 + 帳號" /></Form.Item>
          <Form.Item name="note" label="備註"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 廠商對帳 Drawer */}
      <Drawer
        title={<Space><ShopOutlined />{detail?.name} — 對帳明細</Space>}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null); setDetailItems([]); setDetailStats(null); setMonthlyStats([]) }}
        width={800}
        destroyOnClose
      >
        {detail && (
          <>
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={6}>
                <Statistic title="總採購次數" value={detailStats?.order_count || 0} suffix="次" />
              </Col>
              <Col span={6}>
                <Statistic title="總支出" value={detailStats?.total_amount || 0} prefix="NT$" formatter={v => Number(v).toLocaleString()} />
              </Col>
              <Col span={6}>
                <Statistic title="已付款" value={detailStats?.paid_amount || 0} prefix="NT$" valueStyle={{ color: '#52c41a' }} formatter={v => Number(v).toLocaleString()} />
              </Col>
              <Col span={6}>
                <Statistic title="待付款" value={detailStats?.pending_amount || 0} prefix="NT$" valueStyle={{ color: detailStats?.pending_amount ? '#faad14' : undefined }} formatter={v => Number(v).toLocaleString()} />
              </Col>
            </Row>

            <Tabs items={[
              {
                key: 'items', label: '採購明細',
                children: detailItems.length
                  ? <Table dataSource={detailItems} columns={itemColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
                  : <Empty description="尚無採購記錄" />
              },
              {
                key: 'monthly', label: `${dayjs().year()}年月統計`,
                children: (
                  <Table
                    dataSource={monthlyStats}
                    rowKey="month"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: '月份', dataIndex: 'month', render: (m: string) => `${Number(m)}月` },
                      { title: '採購次數', dataIndex: 'count', render: (v: number) => `${v} 次` },
                      { title: '金額', dataIndex: 'amount', render: (v: number) => <Text strong>NT$ {Number(v).toLocaleString()}</Text> },
                    ]}
                    footer={() => {
                      const total = monthlyStats.reduce((s, r) => s + (r.amount || 0), 0)
                      return <Text strong>年度合計：NT$ {total.toLocaleString()}</Text>
                    }}
                  />
                )
              },
              {
                key: 'info', label: '廠商資訊',
                children: (
                  <Descriptions column={2} bordered size="small">
                    <Descriptions.Item label="廠商名稱">{detail.name}</Descriptions.Item>
                    <Descriptions.Item label="類別"><Tag color={CATEGORY_COLORS[detail.category]}>{CATEGORY_LABELS[detail.category]}</Tag></Descriptions.Item>
                    <Descriptions.Item label="聯絡人">{detail.contact_person || '—'}</Descriptions.Item>
                    <Descriptions.Item label="電話">{detail.phone || '—'}</Descriptions.Item>
                    <Descriptions.Item label="LINE">{detail.line_id || '—'}</Descriptions.Item>
                    <Descriptions.Item label="評分"><Rate disabled value={detail.rating} /></Descriptions.Item>
                    <Descriptions.Item label="地址" span={2}>{detail.address || '—'}</Descriptions.Item>
                    <Descriptions.Item label="銀行帳號" span={2}>{detail.bank_account || '—'}</Descriptions.Item>
                    <Descriptions.Item label="備註" span={2}>{detail.note || '—'}</Descriptions.Item>
                  </Descriptions>
                )
              }
            ]} />
          </>
        )}
      </Drawer>
    </div>
  )
}
