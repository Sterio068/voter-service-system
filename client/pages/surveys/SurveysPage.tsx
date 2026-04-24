import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Drawer, Popconfirm } from 'antd'
import { PlusOutlined, BarChartOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'

const { Option } = Select
const { TextArea } = Input

const STATUS_COLORS: Record<string,string> = { draft: 'default', active: 'green', closed: 'red' }
const STATUS_LABELS: Record<string,string> = { draft: '草稿', active: '進行中', closed: '已結束' }

export default function SurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm()
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])

  useEffect(() => { fetchSurveys() }, [])

  const fetchSurveys = async () => {
    setLoading(true)
    try { const r = await api.get('/surveys'); setSurveys(r.data.data || []) }
    catch { message.error('載入失敗') }
    setLoading(false)
  }

  const handleCreate = async (values: any) => {
    try {
      await api.post('/surveys', values)
      message.success('問卷已建立')
      setCreateOpen(false); form.resetFields(); fetchSurveys()
    } catch (err: any) {
      message.error(err.response?.data?.error || '建立失敗')
    }
  }

  const openStats = async (survey: any) => {
    setSelectedSurvey(survey)
    try {
      const [statsRes, respRes] = await Promise.all([
        api.get(`/surveys/${survey.id}/stats`),
        api.get(`/surveys/${survey.id}/responses`)
      ])
      setStats(statsRes.data.data)
      setResponses(respRes.data.data || [])
    } catch {}
    setStatsOpen(true)
  }

  const handleStatusChange = async (id: number, status: string) => {
    try { await api.put(`/surveys/${id}`, { status }); fetchSurveys() }
    catch { message.error('更新失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/surveys/${id}`)
      message.success('問卷已刪除')
      fetchSurveys()
    } catch { message.error('刪除失敗') }
  }

  const columns = [
    { title: '問卷名稱', dataIndex: 'title' },
    { title: '狀態', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '建立日期', dataIndex: 'created_at', width: 120, render: (v: string) => v?.slice(0,10) },
    { title: '操作', width: 180, render: (_: any, r: any) => (
      <Space>
        <Button size="small" icon={<BarChartOutlined />} onClick={() => openStats(r)}>統計</Button>
        {r.status === 'draft' && <Button size="small" type="primary" onClick={() => handleStatusChange(r.id, 'active')}>發布</Button>}
        {r.status === 'active' && <Button size="small" danger onClick={() => handleStatusChange(r.id, 'closed')}>結束</Button>}
        <Popconfirm
          title="確定刪除此問卷？"
          description="刪除後所有填答資料也將一併刪除。"
          okText="確定刪除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(r.id)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )}
  ]

  return (
    <PageScaffold
      eyebrow="Survey Lab"
      title="問卷管理"
      titleLevel={4}
      variant="compact"
      description="建立議題問卷、發布狀態與回應統計，支援後續交叉分析。"
      actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true) }}>新增問卷</Button>}
    >
      <Card>
        <Table columns={columns} dataSource={surveys} rowKey="id" loading={loading} size="small" />
      </Card>
      <Modal title="新增問卷" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} okText="建立">
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="title"
            label="問卷名稱"
            rules={[{ required: true, whitespace: true, message: '請輸入問卷名稱' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="說明"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
      <Drawer title={`${selectedSurvey?.title} — 統計`} open={statsOpen} onClose={() => setStatsOpen(false)} width={600}>
        <div>
          <p>回應數：{responses.length}</p>
          {stats && <pre style={{ fontSize: 12, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(stats, null, 2)}</pre>}
        </div>
      </Drawer>
    </PageScaffold>
  )
}
