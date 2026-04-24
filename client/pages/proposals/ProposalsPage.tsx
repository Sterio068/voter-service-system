import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Button, Space, Typography, Modal, Form, Input, Select,
  message, Popconfirm, Tag, Drawer, Descriptions, Row, Col, DatePicker,
  Statistic, Tooltip, Badge
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
  FileTextOutlined, EyeOutlined, LinkOutlined, ReloadOutlined, RobotOutlined, ImportOutlined,
  DownloadOutlined
} from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'
import AIButton from '../../components/ai/AIButton'
import PageScaffold from '../../components/ui/PageScaffold'
import WorkspaceToolbar from '../../components/ui/WorkspaceToolbar'
import { SCROLLABLE_FORM_MODAL_STYLE, SCROLLABLE_FORM_MODAL_STYLES } from '../../components/ui/modalStyles'

const { Text, Paragraph } = Typography
const { TextArea } = Input

// P3: source_url 協定白名單（防止 javascript: / data:）
function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

// P1/P2: 驗證並清理 AI parse-proposal 回應欄位
const PARSE_FIELD_MAX: Record<string, number> = {
  proposal_number: 50, proposal_date: 10, title: 256, session: 50,
  meeting: 100, category: 100, proposal_type: 20, proposer: 100,
  co_signers: 256, content: 4000,
}
function sanitizeAIParsed(data: any): Record<string, any> {
  if (!data || typeof data !== 'object') return {}
  const out: Record<string, any> = {}
  for (const [k, maxLen] of Object.entries(PARSE_FIELD_MAX)) {
    const v = data[k]
    if (v === null || v === undefined) continue
    if (typeof v !== 'string') continue
    // 移除控制字元
    out[k] = v.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '').slice(0, maxLen)
  }
  return out
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待審查', in_progress: '審議中', passed: '通過', rejected: '否決',
  withdrawn: '撤回', archived: '封存'
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'default', in_progress: 'processing', passed: 'success',
  rejected: 'error', withdrawn: 'warning', archived: 'default'
}
const PROPOSAL_TYPES = ['議員提案', '市府提案', '臨時動議', '請願提案']

export default function ProposalsPage() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  // Filters
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  // Modal / Drawer
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<any>(null)
  const [form] = Form.useForm()

  // AI import modal
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importParsing, setImportParsing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize }
      if (search.trim()) params.search = search.trim()
      if (filterStatus) params.status = filterStatus
      if (filterType) params.proposal_type = filterType
      const res = await api.get('/proposals', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch { message.error('載入提案失敗') }
    finally { setLoading(false) }
  }, [page, pageSize, search, filterStatus, filterType])

  const fetchStats = async () => {
    try {
      const res = await api.get('/proposals/stats')
      setStats(res.data.data || {})
    } catch {}
  }

  useEffect(() => { fetchData(); fetchStats() }, [fetchData])

  const handleAIImport = async () => {
    if (!importText.trim()) { message.warning('請先貼入提案文字'); return }
    setImportParsing(true)
    try {
      const res = await api.post('/ai/parse-proposal', { text: importText })
      const parsed = res.data.data
      setImportModalOpen(false)
      setImportText('')
      setEditingItem(null)
      form.resetFields()
      // P1: 清理 AI 回應，防止惡意內容注入表單
      const clean = sanitizeAIParsed(parsed)
      if (clean.proposal_date) clean.proposal_date = dayjs(clean.proposal_date).isValid() ? dayjs(clean.proposal_date) : null
      form.setFieldsValue(clean)
      setModalOpen(true)
      message.success('AI 已解析完成，請確認後儲存')
    } catch (e: any) {
      const msg = e?.response?.data?.error || '解析失敗'
      if (msg.includes('尚未啟用') || msg.includes('尚未設定')) {
        message.warning({ content: msg + '（系統設定 → AI 助理）', duration: 4 })
      } else {
        message.error(msg)
      }
    } finally { setImportParsing(false) }
  }

  const openCreate = () => {
    setEditingItem(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (row: any) => {
    setEditingItem(row)
    form.setFieldsValue({
      ...row,
      proposal_date: row.proposal_date ? dayjs(row.proposal_date) : null,
    })
    setModalOpen(true)
  }

  const openDetail = async (id: number) => {
    try {
      const res = await api.get(`/proposals/${id}`)
      setDetailItem(res.data.data)
      setDetailOpen(true)
    } catch { message.error('載入詳細資料失敗') }
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (values.proposal_date) values.proposal_date = values.proposal_date.format('YYYY-MM-DD')
      if (editingItem) {
        await api.put(`/proposals/${editingItem.id}`, values)
        message.success('提案已更新')
      } else {
        await api.post('/proposals', values)
        message.success('提案已新增')
      }
      setModalOpen(false)
      fetchData()
      fetchStats()
    } catch (err: any) {
      if (err?.response?.data?.error) message.error(err.response.data.error)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params: any = {}
      if (search.trim()) params.search = search.trim()
      if (filterStatus) params.status = filterStatus
      if (filterType) params.proposal_type = filterType
      const res = await api.get('/proposals/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `proposals_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      message.success('匯出成功')
    } catch { message.error('匯出失敗') }
    finally { setExporting(false) }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/proposals/${id}`)
      message.success('已刪除')
      fetchData()
      fetchStats()
    } catch { message.error('刪除失敗') }
  }

  const columns = [
    { title: '提案編號', dataIndex: 'proposal_number', width: 110, render: (v: string) => v || '—' },
    { title: '提案日期', dataIndex: 'proposal_date', width: 100, render: (v: string) => v || '—' },
    {
      title: '主旨', dataIndex: 'title', ellipsis: true,
      render: (v: string, row: any) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(row.id)}>{v}</Button>
      )
    },
    {
      title: '類型', dataIndex: 'proposal_type', width: 90,
      render: (v: string) => <Tag>{v || '—'}</Tag>
    },
    { title: '提案人', dataIndex: 'proposer', width: 90, render: (v: string) => v || '—' },
    {
      title: '狀態', dataIndex: 'status', width: 80,
      render: (v: string) => <Badge status={STATUS_COLORS[v] as any} text={STATUS_LABELS[v] || v} />
    },
    {
      title: '操作', width: 100, fixed: 'right' as const,
      render: (_: any, row: any) => (
        <Space size={4}>
          <Tooltip title="查看"><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row.id)} /></Tooltip>
          <Tooltip title="編輯"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Tooltip>
          <Popconfirm title="確定刪除此提案？" onConfirm={() => handleDelete(row.id)} okText="刪除" cancelText="取消">
            <Tooltip title="刪除"><Button size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  const totalCount = Object.values(stats).reduce((a, b) => a + b, 0)

  return (
    <PageScaffold
      eyebrow="Proposal Tracker"
      title="提案追蹤"
      titleLevel={4}
      variant="compact"
      description="追蹤議會提案、審查狀態、來源連結與 AI 匯入解析。"
      actions={
        <>
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
            匯出 Excel
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
            AI 匯入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增提案</Button>
        </>
      }
    >

      {/* Stats bar */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col><Statistic title="總計" value={totalCount} /></Col>
        <Col><Statistic title="待審查" value={stats.pending || 0} valueStyle={{ color: '#8c8c8c' }} /></Col>
        <Col><Statistic title="審議中" value={stats.in_progress || 0} valueStyle={{ color: '#1677ff' }} /></Col>
        <Col><Statistic title="通過" value={stats.passed || 0} valueStyle={{ color: '#52c41a' }} /></Col>
        <Col><Statistic title="否決" value={stats.rejected || 0} valueStyle={{ color: '#ff4d4f' }} /></Col>
      </Row>

      <Card>
        <WorkspaceToolbar
          title="提案篩選"
          description="依關鍵字、審查狀態與提案類型整理追蹤清單。"
          meta={<Text type="secondary">共 {total} 筆</Text>}
        >
        <Space wrap>
          <Input
            placeholder="搜尋主旨、提案編號、內容"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            placeholder="狀態"
            value={filterStatus || undefined}
            onChange={v => { setFilterStatus(v || ''); setPage(1) }}
            style={{ width: 110 }}
            allowClear
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="提案類型"
            value={filterType || undefined}
            onChange={v => { setFilterType(v || ''); setPage(1) }}
            style={{ width: 120 }}
            allowClear
          >
            {PROPOSAL_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setPage(1) }}>
            清除篩選
          </Button>
        </Space>
        </WorkspaceToolbar>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 800 }}
          pagination={{
            current: page, pageSize, total,
            showTotal: t => `共 ${t} 筆`,
            onChange: p => setPage(p)
          }}
          size="small"
        />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingItem ? '編輯提案' : '新增提案'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="儲存"
        cancelText="取消"
        width={680}
        destroyOnClose
        style={SCROLLABLE_FORM_MODAL_STYLE}
        styles={SCROLLABLE_FORM_MODAL_STYLES}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="title" label="提案主旨" rules={[{ required: true, message: '請輸入主旨' }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="proposal_number" label="提案編號">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="proposal_date" label="提案日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="proposal_type" label="提案類型" initialValue="議員提案">
                <Select>
                  {PROPOSAL_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="session" label="屆次">
                <Input placeholder="例：第12屆" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="meeting" label="會議">
                <Input placeholder="例：第3次定期會" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="category" label="類別">
                <Input placeholder="例：交通、教育" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="proposer" label="提案人">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="co_signers" label="連署人">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="content"
            label={
              <Space>
                <span>提案內容</span>
                <AIButton
                  label="AI 優化"
                  size="small"
                  type="link"
                  tooltip="用 AI 整理並優化提案內容文字"
                  endpoint="/ai/summarize"
                  payload={{ text: form.getFieldValue('content') || form.getFieldValue('title') || '', type: 'proposal' }}
                  onResult={(d) => form.setFieldsValue({ content: d.summary })}
                />
              </Space>
            }
          >
            <TextArea rows={4} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="status" label="狀態" initialValue="pending">
                <Select>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="result" label="決議">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="track_note"
            label={
              <Space>
                <span>追蹤備註</span>
                <AIButton
                  label="AI 建議"
                  size="small"
                  type="link"
                  tooltip="根據提案狀態生成追蹤備註草稿"
                  endpoint="/ai/suggest-note"
                  payload={{
                    title: form.getFieldValue('title') || '',
                    content: form.getFieldValue('content') || '',
                    status: form.getFieldValue('status') || '',
                    category: form.getFieldValue('category') || '',
                    type: 'proposal'
                  }}
                  onResult={(d) => form.setFieldsValue({ track_note: d.note })}
                />
              </Space>
            }
          >
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="source_url" label="來源網址">
            <Input prefix={<LinkOutlined />} placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI Import Modal */}
      <Modal
        title={<Space><RobotOutlined /><span>AI 匯入提案</span></Space>}
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportText('') }}
        onOk={handleAIImport}
        okText="解析並填入"
        cancelText="取消"
        confirmLoading={importParsing}
        width={600}
      >
        <p style={{ color: '#666', marginBottom: 8 }}>
          將議會提案公文文字貼入下方，AI 將自動解析欄位並填入新增表單，請確認後再儲存。
        </p>
        <TextArea
          rows={10}
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder="貼入提案文字，例如：
提案編號：112-001
提案日期：112年3月15日
主旨：請市府研議改善XX路交通問題案
提案人：議員○○○
說明：..."
        />
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined />
            <span>提案詳細</span>
          </Space>
        }
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={detailItem && (
          <Space>
            <AIButton
              label="AI 摘要"
              tooltip="摘要提案重點"
              endpoint="/ai/summarize"
              payload={{ text: detailItem.content || detailItem.title, type: 'proposal' }}
              onResult={(d) => message.info({ content: d.summary, duration: 10, icon: <RobotOutlined /> })}
            />
            <AIButton
              label="AI 備註"
              tooltip="生成追蹤備註建議"
              endpoint="/ai/suggest-note"
              payload={{ title: detailItem.title, content: detailItem.content, status: detailItem.status, category: detailItem.category, type: 'proposal' }}
              onResult={(d) => { openEdit({ ...detailItem, track_note: d.note }); setDetailOpen(false) }}
            />
            <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailItem) }}>編輯</Button>
          </Space>
        )}
      >
        {detailItem && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="提案編號" span={1}>{detailItem.proposal_number || '—'}</Descriptions.Item>
              <Descriptions.Item label="提案日期" span={1}>{detailItem.proposal_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="提案類型" span={1}><Tag>{detailItem.proposal_type || '—'}</Tag></Descriptions.Item>
              <Descriptions.Item label="狀態" span={1}>
                <Badge status={STATUS_COLORS[detailItem.status] as any} text={STATUS_LABELS[detailItem.status] || detailItem.status} />
              </Descriptions.Item>
              <Descriptions.Item label="屆次" span={1}>{detailItem.session || '—'}</Descriptions.Item>
              <Descriptions.Item label="會議" span={1}>{detailItem.meeting || '—'}</Descriptions.Item>
              <Descriptions.Item label="類別" span={1}>{detailItem.category || '—'}</Descriptions.Item>
              <Descriptions.Item label="提案人" span={1}>{detailItem.proposer || '—'}</Descriptions.Item>
              <Descriptions.Item label="連署人" span={2}>{detailItem.co_signers || '—'}</Descriptions.Item>
            </Descriptions>

            <Card size="small" title="提案主旨" style={{ marginBottom: 12 }}>
              <Text strong>{detailItem.title}</Text>
            </Card>

            {detailItem.content && (
              <Card size="small" title="提案內容" style={{ marginBottom: 12 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detailItem.content}</Paragraph>
              </Card>
            )}

            {detailItem.result && (
              <Card size="small" title="決議" style={{ marginBottom: 12 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detailItem.result}</Paragraph>
              </Card>
            )}

            {detailItem.track_note && (
              <Card size="small" title="追蹤備註" style={{ marginBottom: 12 }}>
                <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detailItem.track_note}</Paragraph>
              </Card>
            )}

            {detailItem.source_url && (
              <Card size="small" title="來源網址" style={{ marginBottom: 12 }}>
                {/* P3: 只允許 http/https，防止 javascript: / data: 協定 */}
                {isSafeUrl(detailItem.source_url) ? (
                  <a href={detailItem.source_url} target="_blank" rel="noreferrer noopener">
                    {detailItem.source_url}
                  </a>
                ) : (
                  <Text type="secondary">{detailItem.source_url}</Text>
                )}
              </Card>
            )}

            <Text type="secondary" style={{ fontSize: 12 }}>
              建立者：{detailItem.created_by_name || '—'} ｜ {detailItem.created_at}
            </Text>
          </>
        )}
      </Drawer>
    </PageScaffold>
  )
}
