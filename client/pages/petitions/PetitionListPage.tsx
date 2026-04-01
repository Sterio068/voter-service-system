import React, { useState, useEffect } from 'react'
import {
  Table, Button, Space, Input, Select, Tag, Typography, Card,
  Drawer, Form, DatePicker, message, Popconfirm, Row, Col, Divider, Empty, Modal
} from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined, DownloadOutlined, FilterOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import { useDataSync } from '../../hooks/useDataSync'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

function getSLAColor(created_at: string, status: string): string {
  if (status === 'closed' || status === 'cancelled') return 'transparent'
  const days = (Date.now() - new Date(created_at).getTime()) / 86400000
  if (days < 3) return '#52c41a'
  if (days < 7) return '#faad14'
  if (days < 14) return '#fa8c16'
  return '#ff4d4f'
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  waiting_external: 'purple',
  waiting_applicant: 'cyan',
  replied: 'green',
  closed: 'default',
  cancelled: 'red',
}
const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  waiting_external: '待外部回覆',
  waiting_applicant: '待民眾補件',
  replied: '已回覆',
  closed: '已結案',
  cancelled: '已取消',
}
const URGENCY_COLORS: Record<string, string> = { normal: 'default', urgent: 'orange', critical: 'red' }
const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }

export default function PetitionListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Restore filters from sessionStorage (URL param takes precedence for status)
  const _savedFilters = (() => {
    try { return JSON.parse(sessionStorage.getItem('petition_filters') || '{}') } catch { return {} }
  })()
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || _savedFilters.filterStatus || '')
  const [filterCategory, setFilterCategory] = useState(_savedFilters.filterCategory || '')
  const [filterUrgency, setFilterUrgency] = useState(_savedFilters.filterUrgency || '')
  const [search, setSearch] = useState(_savedFilters.search || '')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<string[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [voterSearch, setVoterSearch] = useState('')
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickForm] = Form.useForm()
  const [inlineVoterOpen, setInlineVoterOpen] = useState(false)
  const [inlineVoterForm] = Form.useForm()
  const [voters, setVoters] = useState<any[]>([])
  const [startDate, setStartDate] = useState(_savedFilters.startDate || '')
  const [endDate, setEndDate] = useState(_savedFilters.endDate || '')
  const [editingPetitionId, setEditingPetitionId] = useState<number | null>(null)

  useEffect(() => {
    fetchCategories()
    fetchUsers()
    if (new URLSearchParams(location.search).get('action') === 'new') {
      setDrawerOpen(true)
    }
  }, [])

  useEffect(() => {
    fetchPetitions()
  }, [page, pageSize, filterStatus, filterCategory, filterUrgency, search, startDate, endDate])

  useDataSync((events) => {
    const hasPetitionChange = events.some(e => e.target_type === 'petition')
    if (hasPetitionChange) fetchPetitions()
  }, [])

  useEffect(() => {
    sessionStorage.setItem('petition_filters', JSON.stringify({ filterStatus, filterCategory, filterUrgency, search, startDate, endDate }))
  }, [filterStatus, filterCategory, filterUrgency, search, startDate, endDate])

  const fetchCategories = async () => {
    try {
      const res = await api.get('/admin/categories?type=petition_category')
      setCategories(res.data.data?.map((c: any) => c.name) || [])
    } catch {}
  }

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users')
      setUsers(res.data.data || [])
    } catch {}
  }

  const fetchPetitions = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      if (filterUrgency) params.urgency = filterUrgency
      if (search) params.search = search
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      const res = await api.get('/petitions', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch {
      message.error('載入陳情資料失敗')
    } finally {
      setLoading(false)
    }
  }

  const searchVoters = async (q: string) => {
    if (!q) return
    try {
      const res = await api.get(`/voters/search?q=${q}`)
      setVoterOptions(res.data.data || [])
    } catch {}
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params: any = {}
      if (filterStatus) params.status = filterStatus
      if (filterCategory) params.category = filterCategory
      if (filterUrgency) params.urgency = filterUrgency
      if (search) params.search = search
      const res = await api.get('/petitions/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `petitions_${dayjs().format('YYYYMMDD')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('匯出成功')
    } catch {
      message.error('匯出失敗')
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async (values: any) => {
    try {
      const payload = {
        ...values,
        petition_date: values.petition_date ? dayjs(values.petition_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      }
      await api.post('/petitions', payload)
      message.success('陳情案件已建立')
      setDrawerOpen(false)
      form.resetFields()
      fetchPetitions()
    } catch (err: any) {
      message.error(err.response?.data?.error || '建立失敗')
    }
  }

  const handleInlineVoterCreate = async (vals: any) => {
    try {
      const res = await api.post('/voters', { name: vals.name, mobile: vals.mobile })
      const newId = res.data.data.id
      const vRes = await api.get('/voters?pageSize=500')
      setVoters(vRes.data.data || [])
      quickForm.setFieldValue('voter_id', newId)
      setInlineVoterOpen(false)
      inlineVoterForm.resetFields()
      message.success('選民已新增')
    } catch { message.error('新增失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/petitions/${id}`)
      message.success('陳情案件已刪除')
      fetchPetitions()
      setDrawerOpen(false)
    } catch (err: any) {
      message.error(err.response?.data?.error || '刪除失敗')
    }
  }

  const handleQuickCreate = async (values: any) => {
    try {
      await api.post('/petitions', {
        ...values,
        petition_date: dayjs().format('YYYY-MM-DD'),
        status: 'pending',
        urgency: 'normal',
      })
      message.success('案件已快速立案')
      setQuickOpen(false); quickForm.resetFields(); fetchPetitions()
    } catch { message.error('立案失敗') }
  }

  const columns: ColumnsType<any> = [
    {
      title: '案件編號',
      dataIndex: 'case_number',
      width: 130,
      render: (n, r) => (
        <Space size={4}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSLAColor(r.created_at, r.status), display: 'inline-block', flexShrink: 0 }} />
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/petitions/${r.id}`)}>{n}</Button>
        </Space>
      ),
    },
    {
      title: '緊急程度',
      dataIndex: 'urgency',
      width: 80,
      render: (u) => <Tag color={URGENCY_COLORS[u]}>{URGENCY_LABELS[u]}</Tag>,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 90,
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag>,
    },
    { title: '陳情人', dataIndex: 'voter_name', width: 90 },
    { title: '類別', dataIndex: 'category', width: 100 },
    {
      title: '陳情內容',
      dataIndex: 'content',
      ellipsis: true,
      render: (c) => <Text ellipsis style={{ maxWidth: 250 }}>{c}</Text>,
    },
    {
      title: '承辦人',
      dataIndex: 'assignee_name',
      width: 110,
      render: (v: string, row: any) => {
        if (editingPetitionId === row.id) return (
          <Select
            size="small"
            defaultValue={row.assignee_id}
            style={{ width: 90 }}
            autoFocus
            onBlur={() => setEditingPetitionId(null)}
            onChange={async (newId: number) => {
              try {
                await api.put(`/petitions/${row.id}`, { assignee_id: newId })
                fetchPetitions()
              } catch { message.error('更新失敗') }
              setEditingPetitionId(null)
            }}
          >
            {users.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
          </Select>
        )
        return (
          <span style={{ cursor: 'pointer' }} onClick={() => setEditingPetitionId(row.id)}>
            {v || '—'} <EditOutlined style={{ fontSize: 11, color: '#999' }} />
          </span>
        )
      },
    },
    {
      title: '陳情日期',
      dataIndex: 'petition_date',
      width: 100,
      render: (d) => dayjs(d).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      width: 120,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/petitions/${r.id}`)} />
          <Popconfirm
            title="確定刪除此陳情案件？"
            description="刪除後將無法復原。"
            okText="確定刪除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📋 陳情管理</Title>
        <Space>
          {(user?.role === 'admin' || user?.role === 'supervisor') && (
            <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>匯出 Excel</Button>
          )}
          <Button onClick={() => { quickForm.resetFields(); setQuickOpen(true) }}>快速立案</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>
            新增陳情
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space size={4} style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>快選：</Text>
          {[
            { label: '本月', start: dayjs().startOf('month').format('YYYY-MM-DD'), end: dayjs().endOf('month').format('YYYY-MM-DD') },
            { label: '上月', start: dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), end: dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') },
            { label: '本季', start: (() => { const m = dayjs().month(); const qStart = Math.floor(m / 3) * 3; return dayjs().month(qStart).startOf('month').format('YYYY-MM-DD') })(), end: (() => { const m = dayjs().month(); const qEnd = Math.floor(m / 3) * 3 + 2; return dayjs().month(qEnd).endOf('month').format('YYYY-MM-DD') })() },
            { label: '今年', start: dayjs().startOf('year').format('YYYY-MM-DD'), end: dayjs().endOf('year').format('YYYY-MM-DD') },
          ].map(opt => (
            <Button key={opt.label} size="small" onClick={() => { setStartDate(opt.start); setEndDate(opt.end); setPage(1) }}>
              {opt.label}
            </Button>
          ))}
          {(startDate || endDate) && <Button size="small" onClick={() => { setStartDate(''); setEndDate(''); setPage(1) }}>清除</Button>}
        </Space>
        <Space wrap>
          <Input.Search
            placeholder="搜尋陳情內容"
            allowClear
            style={{ width: 200 }}
            value={search}
            onChange={(e) => { if (!e.target.value) { setSearch(''); setPage(1) } }}
            onSearch={(v) => { setSearch(v); setPage(1) }}
            prefix={<SearchOutlined />}
          />
          <Select placeholder="狀態篩選" allowClear style={{ width: 110 }} onChange={(v) => { setFilterStatus(v || ''); setPage(1) }} value={filterStatus || undefined}>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          <Select placeholder="類別篩選" allowClear style={{ width: 120 }} onChange={(v) => { setFilterCategory(v || ''); setPage(1) }} value={filterCategory || undefined}>
            {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
          </Select>
          <Select placeholder="緊急程度" allowClear style={{ width: 100 }} onChange={(v) => { setFilterUrgency(v || ''); setPage(1) }} value={filterUrgency || undefined}>
            {Object.entries(URGENCY_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          {(search || filterStatus || filterCategory || filterUrgency) && (
            <Button
              icon={<FilterOutlined />}
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterCategory(''); setFilterUrgency(''); setPage(1) }}
            >
              清除篩選
            </Button>
          )}
          <Text type="secondary">共 {total} 筆</Text>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          locale={{
            emptyText: (search || filterStatus || filterCategory || filterUrgency)
              ? <Empty description="查無符合條件的資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : <Empty description="尚無資料" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
          }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 筆`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
          virtual={total > 100}
          scroll={{ x: 900, y: total > 100 ? 600 : undefined }}
        />
      </Card>

      <Drawer
        title="新增陳情案件"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => form.submit()}>送出</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}
          initialValues={{ urgency: 'normal', status: 'pending', petition_date: dayjs() }}>
          <Form.Item name="voter_id" label="陳情人（選填）">
            <Select
              showSearch
              allowClear
              filterOption={false}
              placeholder="輸入姓名或手機搜尋選民"
              onSearch={searchVoters}
              notFoundContent={null}
            >
              {voterOptions.map((v: any) => (
                <Option key={v.id} value={v.id}>{v.name} {v.mobile ? `(${v.mobile})` : ''}</Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="petition_date" label="陳情日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channel" label="陳情方式">
                <Select>
                  {['電話', '親訪', '書信', 'LINE', '電子郵件', '轉介', '其他'].map(c =>
                    <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="陳情類別">
                <Select allowClear>
                  {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="urgency" label="急迫程度">
                <Select>
                  <Option value="normal">一般</Option>
                  <Option value="urgent">急件</Option>
                  <Option value="critical">特急</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assignee_id" label="承辦人">
                <Select allowClear>
                  {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="content" label="陳情內容" rules={[{ required: true, message: '請填寫陳情內容' }]}>
            <TextArea rows={5} placeholder="詳細描述陳情事項..." />
          </Form.Item>

          <Divider orientation="left" orientationMargin={0}>處理區域</Divider>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="area_city" label="縣市"><Input /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="area_district" label="鄉鎮區"><Input /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="area_village" label="村里"><Input /></Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="area_address" label="詳細地址"><Input /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* 快速立案 Modal */}
      <Modal
        title="快速立案"
        open={quickOpen}
        onCancel={() => { setQuickOpen(false); quickForm.resetFields() }}
        onOk={() => quickForm.submit()}
        okText="立案"
        cancelText="取消"
      >
        <Form form={quickForm} layout="vertical" onFinish={handleQuickCreate}
          initialValues={{ channel: '電話' }}>
          <Form.Item name="voter_id" label="陳情人（選填）">
            <Select
              showSearch
              allowClear
              filterOption={false}
              placeholder="輸入姓名或手機搜尋選民"
              onSearch={searchVoters}
              notFoundContent={null}
            >
              {voterOptions.map((v: any) => (
                <Option key={v.id} value={v.id}>{v.name} {v.mobile ? `(${v.mobile})` : ''}</Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ marginTop: 4, marginBottom: 8 }}>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }}
              onClick={() => setInlineVoterOpen(true)}>
              ＋ 新增選民
            </Button>
          </div>
          <Form.Item name="content" label="陳情內容" rules={[{ required: true, message: '請填寫陳情內容' }]}>
            <TextArea rows={4} placeholder="詳細描述陳情事項..." />
          </Form.Item>
          <Form.Item name="category" label="陳情類別">
            <Select allowClear>
              {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="channel" label="陳情方式">
            <Select>
              {['電話', '現場', 'LINE', 'Email', '轉介'].map(c =>
                <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 快速新增選民 Modal */}
      <Modal title="快速新增選民" open={inlineVoterOpen} onCancel={() => setInlineVoterOpen(false)}
        onOk={() => inlineVoterForm.submit()} okText="新增" width={360} destroyOnClose>
        <Form form={inlineVoterForm} layout="vertical" onFinish={handleInlineVoterCreate}>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mobile" label="手機" rules={[{ pattern: /^09\d{8}$/, message: '格式：09xxxxxxxx' }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
