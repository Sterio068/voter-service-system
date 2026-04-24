import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Typography, Select, DatePicker, Tag, Statistic,
  Row, Col, Modal, Form, Input, InputNumber, Divider, Popconfirm, message, Empty, Checkbox
} from 'antd'
import { PlusOutlined, GiftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import dayjs from 'dayjs'
import { CEREMONY_TYPE_LABELS } from '../../utils/constants'
import { useAuthStore } from '../../stores/authStore'
import { hasModulePermission } from '../../utils/permissions'

const { Text } = Typography
const { Option } = Select

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planned: { label: '計畫中', color: 'warning' },
  paid:    { label: '已付款', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
}

export default function CeremonyPage() {
  const role = useAuthStore((s) => s.user?.role)
  const canCreateCeremonies = hasModulePermission(role, 'ceremonies', 'create')
  const canEditCeremonies = hasModulePermission(role, 'ceremonies', 'edit')
  const canDeleteCeremonies = hasModulePermission(role, 'ceremonies', 'delete')
  const canViewExpenseSummary = hasModulePermission(role, 'expenses', 'view')
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterYear, setFilterYear] = useState<number>(dayjs().year())
  const [filterMonth, setFilterMonth] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [summary, setSummary] = useState<any>({})
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<any>(null)
  const [giftCategories, setGiftCategories] = useState<any[]>([])
  const [vendorList, setVendorList] = useState<any[]>([])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editingItems, setEditingItems] = useState<any[]>([])
  const [editForm] = Form.useForm()

  useEffect(() => {
    api.get('/gift-categories').then(r => setGiftCategories(r.data.data || [])).catch(() => {})
    api.get('/vendors?active=1&pageSize=200').then(r => setVendorList(r.data.data || [])).catch(() => {})
  }, [])

  useEffect(() => { fetchData() }, [page, filterType, filterStatus, filterYear, filterMonth, search])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize, year: filterYear }
      if (filterType) params.ceremony_type = filterType
      if (filterStatus) params.status = filterStatus
      if (filterMonth) params.month = filterMonth
      if (search) params.search = search
      const res = await api.get('/ceremonies', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!canViewExpenseSummary) {
      setSummary({})
      return
    }
    api.get('/expenses/summary', { params: { year: filterYear, month: filterMonth || undefined } })
      .then(r => setSummary(r.data.data || {}))
      .catch(() => {})
  }, [canViewExpenseSummary, filterYear, filterMonth])

  const openDetail = async (id: number) => {
    try {
      const res = await api.get(`/ceremonies/${id}`)
      setDetailRecord({ ...res.data.data, items: res.data.items })
      setDetailOpen(true)
    } catch { message.error('載入失敗') }
  }

  const openEdit = async (record: any) => {
    try {
      const res = await api.get(`/ceremonies/${record.id}`)
      const full = res.data.data
      const items = res.data.items || []
      setEditingRecord(full)
      setEditingItems(items)
      editForm.setFieldsValue({
        ceremony_type: full.ceremony_type,
        recipient_name: full.recipient_name,
        recipient_relation: full.recipient_relation,
        event_date: full.event_date ? dayjs(full.event_date) : null,
        event_location: full.event_location,
        is_joint: !!full.is_joint,
        joint_note: full.joint_note,
        status: full.status,
        note: full.note,
      })
      setEditModalOpen(true)
    } catch { message.error('載入記錄失敗') }
  }

  const openCreate = () => {
    setEditingRecord(null)
    setEditingItems([])
    editForm.resetFields()
    editForm.setFieldsValue({
      ceremony_type: 'other',
      event_date: dayjs(),
      is_joint: false,
      status: 'planned',
    })
    setEditModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/ceremonies/${id}`)
      message.success('已刪除')
      fetchData()
    } catch { message.error('刪除失敗') }
  }

  const handleEditSave = async (values: any) => {
    try {
      const payload = {
        ...values,
        event_date: values.event_date ? dayjs(values.event_date).format('YYYY-MM-DD') : null,
        is_joint: values.is_joint ? 1 : 0,
        items: editingItems,
      }

      if (editingRecord) {
        await api.put(`/ceremonies/${editingRecord.id}`, payload)
        message.success('已更新')
      } else {
        await api.post('/ceremonies', payload)
        message.success('已新增')
      }
      setEditModalOpen(false)
      editForm.resetFields()
      setEditingRecord(null)
      setEditingItems([])
      fetchData()
    } catch { message.error('儲存失敗') }
  }

  const totalAmount = summary.total?.total || 0
  const paidAmount = (summary.byPayStatus || []).find((s: any) => s.payment_status === 'paid')?.amount || 0

  const columns = [
    {
      title: '日期', dataIndex: 'event_date', key: 'event_date', width: 100,
      render: (v: string) => v || '—',
      sorter: (a: any, b: any) => (a.event_date || '').localeCompare(b.event_date || ''),
    },
    {
      title: '類型', dataIndex: 'ceremony_type', key: 'type', width: 80,
      render: (v: string) => <Tag color="pink">{CEREMONY_TYPE_LABELS[v] || v}</Tag>
    },
    {
      title: '受贈人', key: 'recipient', width: 120,
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openDetail(r.id)}>
            <Text strong>{r.recipient_name}</Text>
          </Button>
          {r.recipient_relation && <Text type="secondary" style={{ fontSize: 11 }}>{r.recipient_relation}</Text>}
        </Space>
      )
    },
    {
      title: '地點', dataIndex: 'event_location', key: 'location',
      render: (v: string) => v || '—'
    },
    {
      title: '聯合', dataIndex: 'is_joint', key: 'joint', width: 60,
      render: (v: number, r: any) => v ? <Tag color="blue" title={r.joint_note}>聯合</Tag> : '—'
    },
    {
      title: '金額', dataIndex: 'total_amount', key: 'amount', width: 110,
      render: (v: number) => <Text strong>NT$ {(v || 0).toLocaleString()}</Text>,
      sorter: (a: any, b: any) => (a.total_amount || 0) - (b.total_amount || 0),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const s = STATUS_LABELS[v] || { label: v, color: 'default' }
        return <Tag color={s.color}>{s.label}</Tag>
      }
    },
    {
      title: '關聯行程', dataIndex: 'schedule_title', key: 'schedule', width: 120,
      render: (v: string) => v ? <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> : '—'
    },
    {
      title: '操作', key: 'action', width: 90,
      render: (_: any, record: any) => (
        canEditCeremonies || canDeleteCeremonies ? (
          <Space>
            {canEditCeremonies && (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} aria-label="編輯禮儀記錄" />
            )}
            {canDeleteCeremonies && (
              <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(record.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="刪除禮儀記錄" />
              </Popconfirm>
            )}
          </Space>
        ) : <Text type="secondary">唯讀</Text>
      )
    }
  ]

  const itemColumns = [
    { title: '品項', dataIndex: 'item_name' },
    { title: '廠商', dataIndex: 'vendor_name', render: (v: string) => v || '—' },
    { title: '數量', dataIndex: 'quantity', width: 60 },
    { title: '單價', dataIndex: 'unit_price', width: 90, render: (v: number) => `NT$ ${(v ?? 0).toLocaleString()}` },
    { title: '金額', dataIndex: 'amount', width: 100, render: (v: number) => <Text strong>NT$ {(v ?? 0).toLocaleString()}</Text> },
    { title: '付款', dataIndex: 'payment_status', width: 70, render: (v: string) => v === 'paid' ? <Tag color="success">已付</Tag> : <Tag color="warning">待付</Tag> },
    { title: '收據', dataIndex: 'receipt_no', width: 90, render: (v: string) => v || '—' },
  ]

  return (
    <PageScaffold
      eyebrow="Ceremony Ledger"
      title="禮儀記錄"
      titleLevel={4}
      variant="compact"
      description={canViewExpenseSummary
        ? '追蹤禮儀案件、採購品項、付款狀態與年度支出統計。'
        : '追蹤禮儀案件與採購品項；目前帳號不顯示收支統計資料。'}
      actions={canCreateCeremonies ? (
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增禮儀記錄
        </Button>
      ) : undefined}
    >

      {canViewExpenseSummary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title={`${filterYear}年總支出`} value={totalAmount} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="已付款" value={paidAmount} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="待付款" value={Math.max(0, totalAmount - paidAmount)} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: totalAmount - paidAmount > 0 ? '#faad14' : undefined }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="記錄筆數" value={summary.total?.count || 0} suffix="筆" />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <WorkspaceToolbar
          title="禮儀篩選"
          description="依年度、月份、禮儀類型、狀態與受贈人查找紀錄。"
          meta={<Text type="secondary">共 {total} 筆</Text>}
        >
        <Space wrap>
          <DatePicker picker="year" value={dayjs().year(filterYear).startOf('year')}
            onChange={d => { setFilterYear(d ? d.year() : dayjs().year()); setPage(1) }}
            allowClear={false} style={{ width: 100 }} />
          <Select placeholder="月份" allowClear style={{ width: 90 }} value={filterMonth || undefined}
            onChange={v => { setFilterMonth(v || null); setPage(1) }}>
            {Array.from({ length: 12 }, (_, i) => <Option key={i + 1} value={i + 1}>{i + 1}月</Option>)}
          </Select>
          <Select placeholder="禮儀類型" allowClear style={{ width: 120 }} value={filterType || undefined}
            onChange={v => { setFilterType(v || ''); setPage(1) }}>
            {Object.entries(CEREMONY_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
          </Select>
          <Select placeholder="狀態" allowClear style={{ width: 100 }} value={filterStatus || undefined}
            onChange={v => { setFilterStatus(v || ''); setPage(1) }}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <Option key={k} value={k}>{v.label}</Option>)}
          </Select>
          <Input.Search placeholder="搜尋受贈人" allowClear style={{ width: 160 }}
            onSearch={v => { setSearch(v); setPage(1) }} />
        </Space>
        </WorkspaceToolbar>

        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ current: page, pageSize, total, onChange: setPage, showTotal: t => `共 ${t} 筆` }}
          expandable={{
            expandedRowRender: (record: any) => (
              record.items?.length > 0
                ? <Table dataSource={record.items} columns={itemColumns} rowKey="id" size="small" pagination={false} />
                : <Empty description="無送禮明細" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )
          }}
        />
      </Card>

      {/* 詳情 Modal */}
      <Modal title={<Space><GiftOutlined />{detailRecord?.recipient_name} — 禮儀詳情</Space>}
        open={detailOpen} onCancel={() => { setDetailOpen(false); setDetailRecord(null) }}
        footer={<Button onClick={() => { setDetailOpen(false); setDetailRecord(null) }}>關閉</Button>}
        width={620} destroyOnClose>
        {detailRecord && (
          <>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}><Text type="secondary">類型</Text><br /><Tag color="pink">{CEREMONY_TYPE_LABELS[detailRecord.ceremony_type] || detailRecord.ceremony_type}</Tag></Col>
              <Col span={8}><Text type="secondary">關係</Text><br /><Text>{detailRecord.recipient_relation || '—'}</Text></Col>
              <Col span={8}><Text type="secondary">狀態</Text><br /><Tag color={STATUS_LABELS[detailRecord.status]?.color}>{STATUS_LABELS[detailRecord.status]?.label}</Tag></Col>
            </Row>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}><Text type="secondary">活動日期</Text><br /><Text>{detailRecord.event_date || '—'}</Text></Col>
              <Col span={8}><Text type="secondary">地點</Text><br /><Text>{detailRecord.event_location || '—'}</Text></Col>
              <Col span={8}><Text type="secondary">聯合致贈</Text><br /><Text>{detailRecord.is_joint ? (detailRecord.joint_note || '是') : '否'}</Text></Col>
            </Row>
            {detailRecord.note && <p><Text type="secondary">備註：</Text>{detailRecord.note}</p>}
            <Divider style={{ margin: '12px 0' }}>送禮明細</Divider>
            {detailRecord.items?.length > 0
              ? <Table dataSource={detailRecord.items} columns={itemColumns} rowKey="id" size="small" pagination={false}
                  footer={() => <div style={{ textAlign: 'right' }}>合計：<Text strong style={{ color: '#1677ff' }}>NT$ {(detailRecord.total_amount || 0).toLocaleString()}</Text></div>} />
              : <Empty description="無送禮明細" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            }
          </>
        )}
      </Modal>

      {(canCreateCeremonies || canEditCeremonies) && (
        <Modal title={editingRecord ? '編輯禮儀記錄' : '新增禮儀記錄'} open={editModalOpen}
          onCancel={() => { setEditModalOpen(false); editForm.resetFields(); setEditingRecord(null); setEditingItems([]) }}
          onOk={() => editForm.submit()} okText="儲存" width={600} destroyOnClose>
          <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="ceremony_type" label="禮儀性質" rules={[{ required: true }]}>
                  <Select>{Object.entries(CEREMONY_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}</Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="event_date" label="活動日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={14}>
                <Form.Item name="recipient_name" label="受贈人" rules={[{ required: true }]}><Input /></Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item name="recipient_relation" label="關係">
                  <Select allowClear>{['選民','親屬','里長','議員','同事','廠商','朋友','其他'].map(r => <Option key={r} value={r}>{r}</Option>)}</Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="event_location" label="地點"><Input /></Form.Item></Col>
              <Col span={12}>
                <Form.Item name="status" label="狀態" initialValue="planned">
                  <Select><Option value="planned">計畫中</Option><Option value="paid">已付款</Option><Option value="cancelled">取消</Option></Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="is_joint" valuePropName="checked" label="聯合致贈">
                  <Checkbox />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="joint_note" label="聯合人說明"><Input placeholder="聯合人姓名（選填）" /></Form.Item>
              </Col>
            </Row>
            <Form.Item name="note" label="備註"><Input.TextArea rows={1} /></Form.Item>
            <Divider style={{ margin: '8px 0' }}><Text style={{ fontSize: 12 }}>送禮明細</Text></Divider>
            <div style={{ textAlign: 'right', marginBottom: 8 }}>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setEditingItems(prev => [...prev, { key: Date.now(), item_name: '', category_id: null, vendor_id: null, quantity: 1, unit_price: 0, amount: 0, payment_method: 'cash', payment_status: 'pending' }])}>新增品項</Button>
            </div>
            {editingItems.map((item, idx) => (
              <div key={item.id ?? item.key} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <Row gutter={8} align="middle">
                  <Col flex={1}>
                    <Select placeholder="類別" style={{ width: '100%' }} allowClear value={item.category_id}
                      onChange={v => {
                        const cat = giftCategories.find((c: any) => c.id === v)
                        setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, category_id: v, item_name: cat?.name || it.item_name, unit_price: cat?.default_price ?? it.unit_price, amount: (cat?.default_price ?? it.unit_price) * it.quantity } : it))
                      }}>
                      {giftCategories.map((c: any) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                    </Select>
                  </Col>
                  <Col flex={1}>
                    <Input placeholder="品項名稱" value={item.item_name}
                      onChange={e => setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))} />
                  </Col>
                  <Col><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setEditingItems(prev => prev.filter((_, i) => i !== idx))} /></Col>
                </Row>
                <Row gutter={8} style={{ marginTop: 6 }}>
                  <Col span={8}>
                    <Select placeholder="廠商" style={{ width: '100%' }} allowClear value={item.vendor_id}
                      onChange={v => setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, vendor_id: v } : it))}>
                      {vendorList.map((v: any) => <Option key={v.id} value={v.id}>{v.name}</Option>)}
                    </Select>
                  </Col>
                  <Col span={5}>
                    <InputNumber placeholder="數量" min={1} value={item.quantity} style={{ width: '100%' }}
                      onChange={v => setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v || 1, amount: (v || 1) * it.unit_price } : it))} />
                  </Col>
                  <Col span={6}>
                    <InputNumber placeholder="單價" min={0} value={item.unit_price} style={{ width: '100%' }}
                      formatter={v => `NT$ ${v}`}
                      parser={(v: any) => Number(String(v).replace(/[^0-9]/g, '')) || 0}
                      onChange={v => setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: v || 0, amount: (v || 0) * it.quantity } : it))} />
                  </Col>
                  <Col span={5}>
                    <Select value={item.payment_status} style={{ width: '100%' }}
                      onChange={v => setEditingItems(prev => prev.map((it, i) => i === idx ? { ...it, payment_status: v } : it))}>
                      <Option value="pending">待付</Option>
                      <Option value="paid">已付</Option>
                    </Select>
                  </Col>
                </Row>
                <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12 }}>小計：<Text strong>NT$ {(item.amount || 0).toLocaleString()}</Text></div>
              </div>
            ))}
            {editingItems.length > 0 && (
              <div style={{ textAlign: 'right', borderTop: '1px solid #e8e8e8', padding: '6px 0' }}>
                合計：<Text strong style={{ color: '#1677ff' }}>NT$ {editingItems.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}</Text>
              </div>
            )}
          </Form>
        </Modal>
      )}
    </PageScaffold>
  )
}
