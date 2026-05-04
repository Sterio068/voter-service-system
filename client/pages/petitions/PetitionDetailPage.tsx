import React, { useState, useEffect } from 'react'
import {
  Card, Tabs, Descriptions, Tag, Button, Space, Typography, Timeline,
  Form, Input, Select, Modal, message, Breadcrumb, Spin, Empty, Badge, Divider, Row, Col, Rate, Popconfirm, DatePicker
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined, CheckCircleOutlined, CheckSquareOutlined, PaperClipOutlined, EditOutlined, DeleteOutlined, RobotOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../utils/api'
import { useDataSync } from '../../hooks/useDataSync'
import { useIsMobile } from '../../components/Layout/MainLayout'
import AttachmentUpload from '../../components/AttachmentUpload'
import AIButton from '../../components/ai/AIButton'
import { PETITION_LOG_ACTION_TYPES } from '../../../shared/types'
import PageScaffold from '../../components/ui/PageScaffold'
import ManagedCategoryField from '../../components/ManagedCategoryField'
import dayjs from 'dayjs'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input

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
const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }
const URGENCY_COLORS: Record<string, string> = { normal: 'default', urgent: 'orange', critical: 'red' }

export default function PetitionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [petition, setPetition] = useState<any>(null)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [logForm] = Form.useForm()
  const [statusForm] = Form.useForm()
  const [users, setUsers] = useState<any[]>([])
  const [reassignOpen, setReassignOpen] = useState(false)
  const [newAssigneeId, setNewAssigneeId] = useState<any>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskForm] = Form.useForm()
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm] = Form.useForm()
  const [voters, setVoters] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])

  useDataSync((events) => {
    const relevant = events.some(e => e.target_type === 'petition' && String(e.target_id) === String(id))
    if (relevant) loadData()
  }, [id ?? ''])

  useEffect(() => {
    if (id) loadData()
    fetchUsers()
    api.get('/admin/categories?type=petition_category').then(r => setCategories((r.data.data || []).map((c: any) => c.name))).catch(() => {})
  }, [id])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/petitions/${id}`)
      setPetition(res.data.data)
    } catch {
      message.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users/list')
      setUsers(res.data.data || [])
    } catch {}
  }

  const handleCreateTask = async (vals: any) => {
    try {
      await api.post('/tasks', {
        title: vals.title || `追蹤案件：${petition?.case_number}`,
        description: vals.description,
        priority: vals.priority || 'normal',
        due_date: vals.due_date ? dayjs(vals.due_date).format('YYYY-MM-DD') : undefined,
        related_petition_id: petition?.id,
        related_voter_id: petition?.voter_id,
      })
      message.success('待辦已建立')
      setTaskModalOpen(false)
      taskForm.resetFields()
    } catch { message.error('建立失敗') }
  }

  const handleAddLog = async (values: any) => {
    try {
      await api.post(`/petitions/${id}/logs`, values)
      message.success('處理紀錄已新增')
      setLogModalOpen(false)
      logForm.resetFields()
      loadData()
    } catch (err: any) {
      message.error(err.response?.data?.error || '新增失敗')
    }
  }

  const handleEdit = async (values: any) => {
    try {
      await api.put(`/petitions/${id}`, {
        content: values.content,
        petition_date: values.petition_date ? dayjs(values.petition_date).format('YYYY-MM-DD') : undefined,
        channel: values.channel,
        category: values.category,
        subcategory: values.subcategory,
        area_city: values.area_city,
        area_district: values.area_district,
        area_village: values.area_village,
        area_address: values.area_address,
        contact_phone: values.contact_phone,
        urgency: values.urgency,
        voter_id: values.voter_id || undefined,
      })
      message.success('案件已更新')
      setEditModalOpen(false)
      editForm.resetFields()
      loadData()
    } catch (err: any) { message.error(err.response?.data?.error || '更新失敗') }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/petitions/${id}`)
      message.success('案件已刪除')
      navigate('/petitions')
    } catch (err: any) { message.error(err.response?.data?.error || '刪除失敗') }
  }

  const handleExportPdf = async () => {
    try {
      const res = await api.get(`/petitions/${id}/export-pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `陳情案件_${petition?.case_number || id}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      message.error(err.response?.data?.error || 'PDF 匯出失敗')
    }
  }

  const searchVoters = async (q: string) => {
    if (!q) return
    try {
      const res = await api.get(`/voters?search=${encodeURIComponent(q)}&pageSize=20`)
      setVoters(res.data.data || [])
    } catch {}
  }

  const handleUpdateStatus = async (values: any) => {
    try {
      // Only send updateable fields
      const payload: Record<string, any> = {}
      if (values.status !== undefined) payload.status = values.status
      if (values.assignee_id !== undefined) payload.assignee_id = values.assignee_id
      if (values.urgency !== undefined) payload.urgency = values.urgency
      if (values.satisfaction !== undefined) payload.satisfaction = values.satisfaction
      await api.put(`/petitions/${id}`, payload)
      message.success('案件狀態已更新')
      setStatusModalOpen(false)
      statusForm.resetFields()
      loadData()
    } catch (err: any) {
      message.error(err.response?.data?.error || '更新失敗')
    }
  }

  if (loading) return <div role="status" aria-live="polite" aria-label="案件資料載入中" style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  if (!petition) return <Empty description="陳情案件不存在" />

  const timelineItems = (petition.logs || []).map((log: any) => ({
    color: log.action_type === '受理' ? 'blue' : log.action_type === '結案' ? 'green' : 'gray',
    children: (
      <div>
        <div>
          <Tag>{log.action_type}</Tag>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            {dayjs(log.created_at).format('YYYY-MM-DD HH:mm')} · {log.created_by_name}
          </Text>
        </div>
        <div style={{ marginTop: 4 }}>{log.content}</div>
        {log.referred_to && <div style={{ color: '#666', fontSize: 12 }}>轉介：{log.referred_to}</div>}
      </div>
    ),
  }))

  return (
    <PageScaffold
      eyebrow="Case Detail"
      title={petition.case_number}
      titleLevel={4}
      variant="compact"
      description={petition.content}
      actions={
        <>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <Tag color={STATUS_COLORS[petition.status]}>{STATUS_LABELS[petition.status]}</Tag>
          <Tag color={URGENCY_COLORS[petition.urgency]}>{URGENCY_LABELS[petition.urgency]}</Tag>
          <Button icon={<EditOutlined />} onClick={() => {
            editForm.setFieldsValue({
              content: petition.content,
              petition_date: petition.petition_date ? dayjs(petition.petition_date) : undefined,
              channel: petition.channel,
              category: petition.category,
              subcategory: petition.subcategory,
              area_city: petition.area_city,
              area_district: petition.area_district,
              area_village: petition.area_village,
              area_address: petition.area_address,
              contact_phone: petition.contact_phone,
              urgency: petition.urgency,
              voter_id: petition.voter_id,
            })
            setEditModalOpen(true)
          }}>編輯案件</Button>
          <Popconfirm title="確定刪除此案件？" description="刪除後無法復原" onConfirm={handleDelete} okText="刪除" okType="danger" cancelText="取消">
            <Button danger icon={<DeleteOutlined />}>刪除</Button>
          </Popconfirm>
          <Button icon={<CheckSquareOutlined />} onClick={() => { taskForm.setFieldsValue({ title: `追蹤案件：${petition?.case_number}` }); setTaskModalOpen(true) }}>
            建立待辦
          </Button>
          <Button onClick={() => navigate('/documents')}>
            產生公文
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>
            匯出 PDF
          </Button>
          {petition?.status === 'closed' && (
            <Popconfirm title="確定要重啟此案件？" onConfirm={async () => {
              try {
                await api.put(`/petitions/${petition.id}`, { status: 'processing' })
                message.success('案件已重啟')
                loadData()
              } catch { message.error('重啟失敗') }
            }}>
              <Button>重啟案件</Button>
            </Popconfirm>
          )}
          <Button onClick={() => { setNewAssigneeId(null); setReassignOpen(true) }}>轉派</Button>
          <Button onClick={() => {
            statusForm.setFieldsValue({
              status: petition.status,
              assignee_id: petition.assignee_id,
              urgency: petition.urgency,
              satisfaction: petition.satisfaction,
            })
            setStatusModalOpen(true)
          }}>
            更新狀態
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLogModalOpen(true)}>
            新增處理紀錄
          </Button>
        </>
      }
    >
      <Breadcrumb
        items={[{ title: '陳情管理', href: '/petitions' }, { title: petition.case_number }]}
        style={{ marginBottom: 16 }}
      />

      <Card styles={{ body: isMobile ? { padding: 8 } : undefined }}>
        <Tabs defaultActiveKey="info" size={isMobile ? 'small' : 'middle'} items={[
          {
            key: 'info',
            label: '案件資訊',
            children: (
              <Descriptions bordered column={isMobile ? 1 : 2} size="small">
                <Descriptions.Item label="案件編號">{petition.case_number}</Descriptions.Item>
                <Descriptions.Item label="陳情日期">{petition.petition_date}</Descriptions.Item>
                <Descriptions.Item label="陳情人">{petition.voter_name || '未登記'}</Descriptions.Item>
                <Descriptions.Item label="聯絡電話">{petition.contact_phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="陳情方式">{petition.channel || '-'}</Descriptions.Item>
                <Descriptions.Item label="陳情類別">{petition.category || '-'}</Descriptions.Item>
                <Descriptions.Item label="子分類">{petition.subcategory || '-'}</Descriptions.Item>
                <Descriptions.Item label="急迫程度">
                  <Tag color={URGENCY_COLORS[petition.urgency]}>{URGENCY_LABELS[petition.urgency]}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="處理狀態">
                  <Tag color={STATUS_COLORS[petition.status]}>{STATUS_LABELS[petition.status]}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="承辦人">{petition.assignee_name || '未指派'}</Descriptions.Item>
                <Descriptions.Item label="結案時間">{petition.closed_at || '-'}</Descriptions.Item>
                <Descriptions.Item label="陳情內容" span={2}>
                  <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{petition.content}</div>
                  <Space wrap>
                    <AIButton
                      label="AI 摘要"
                      tooltip="用 AI 整理本案重點"
                      endpoint="/ai/summarize"
                      payload={{ text: petition.content, type: 'petition' }}
                      onResult={(d) => message.info({ content: d.summary, duration: 10, icon: <RobotOutlined /> })}
                    />
                    <AIButton
                      label="AI 分類建議"
                      tooltip="依內容推薦陳情類別"
                      endpoint="/ai/classify"
                      payload={{ title: petition.title || petition.content?.slice(0, 80), content: petition.content }}
                      onResult={(d) => message.success({ content: `建議類別：${d.category}`, duration: 6 })}
                    />
                    <AIButton
                      label="AI 備註建議"
                      tooltip="生成追蹤備註草稿"
                      endpoint="/ai/suggest-note"
                      payload={{ title: petition.title || petition.content?.slice(0, 80), content: petition.content, status: petition.status, category: petition.category, type: 'petition' }}
                      onResult={(d) => { logForm.setFieldsValue({ content: d.note }); setLogModalOpen(true) }}
                    />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="處理區域" span={2}>
                  {[petition.area_city, petition.area_address].filter(Boolean).join(' ') || '-'}
                </Descriptions.Item>
                {petition.related_doc_id && (
                  <Descriptions.Item label="關聯公文" span={2}>
                    公文 #{petition.related_doc_id}
                    <Button type="link" size="small" onClick={() => navigate(`/documents`)}>查看</Button>
                  </Descriptions.Item>
                )}
                {(petition.status === 'closed' || petition.status === 'replied') && (
                  <Descriptions.Item label="滿意度" span={2}>
                    <Rate value={petition.satisfaction_rating} onChange={async (val) => {
                      try {
                        await api.put(`/petitions/${id}`, { satisfaction_rating: val })
                        message.success('滿意度已更新')
                        loadData()
                      } catch {
                        message.error('更新失敗')
                      }
                    }} />
                  </Descriptions.Item>
                )}
              </Descriptions>
            ),
          },
          {
            key: 'logs',
            label: `處理紀錄 (${(petition.logs || []).length})`,
            children: timelineItems.length > 0 ? (
              <div style={{ padding: '16px 0' }}>
                <Timeline items={timelineItems} />
              </div>
            ) : <Empty description="尚無處理紀錄" />,
          },
          {
            key: 'attachments',
            label: <span><PaperClipOutlined />附件</span>,
            children: petition ? <AttachmentUpload refType="petition" refId={petition.id} /> : null,
          },
        ]} />
      </Card>

      {/* 新增處理紀錄 */}
      <Modal
        title="新增處理紀錄"
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        onOk={() => logForm.submit()}
        okText="儲存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={logForm} layout="vertical" onFinish={handleAddLog}>
          <Form.Item name="action_type" label="處理方式" rules={[{ required: true }]}>
            <Select>
              {PETITION_LOG_ACTION_TYPES.map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="content" label="處理內容" rules={[{ required: true }]}>
            <TextArea rows={4} />
          </Form.Item>
          <Form.Item name="referred_to" label="轉介對象（選填）">
            <Input placeholder="如：XX 區公所、市府 XX 局" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 轉派案件 */}
      <Modal
        title="轉派案件"
        open={reassignOpen}
        onCancel={() => setReassignOpen(false)}
        okText="確認"
        cancelText="取消"
        onOk={async () => {
          if (!newAssigneeId) {
            message.warning('請選擇承辦人')
            return Promise.reject()
          }
          try {
            await api.put(`/petitions/${id}`, { assignee_id: newAssigneeId })
            message.success('案件已轉派')
            setReassignOpen(false)
            loadData()
          } catch {
            message.error('轉派失敗')
            return Promise.reject()
          }
        }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="選擇承辦人"
          onChange={(v) => setNewAssigneeId(v)}
          value={newAssigneeId}
        >
          {users.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
        </Select>
      </Modal>

      {/* 建立追蹤待辦 */}
      <Modal title="建立追蹤待辦" open={taskModalOpen} onCancel={() => setTaskModalOpen(false)} onOk={() => taskForm.submit()} okText="建立" destroyOnClose>
        <Form form={taskForm} layout="vertical" onFinish={handleCreateTask}>
          <Form.Item name="title" label="待辦標題" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="說明"><Input.TextArea rows={2} /></Form.Item>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="priority" label="優先級" initialValue="normal" style={{ flex: 1 }}>
              <Select>
                <Select.Option value="low">低</Select.Option>
                <Select.Option value="normal">一般</Select.Option>
                <Select.Option value="high">高</Select.Option>
                <Select.Option value="urgent">緊急</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="due_date" label="截止日" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 更新狀態 */}
      <Modal
        title="更新案件狀態"
        open={statusModalOpen}
        onCancel={() => setStatusModalOpen(false)}
        onOk={() => statusForm.submit()}
        okText="更新"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={statusForm} layout="vertical" onFinish={handleUpdateStatus}>
          <Form.Item name="status" label="案件狀態" rules={[{ required: true }]}>
            <Select>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="assignee_id" label="承辦人">
            <Select allowClear>
              {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="urgency" label="急迫程度">
            <Select>
              <Option value="normal">一般</Option>
              <Option value="urgent">急件</Option>
              <Option value="critical">特急</Option>
            </Select>
          </Form.Item>
          <Form.Item name="satisfaction" label="滿意度（結案時填寫）">
            <Select allowClear>
              <Option value="satisfied">滿意</Option>
              <Option value="acceptable">尚可</Option>
              <Option value="unsatisfied">不滿意</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 編輯案件 */}
      <Modal title="編輯案件資訊" open={editModalOpen} onCancel={() => { setEditModalOpen(false); editForm.resetFields() }}
        onOk={() => editForm.submit()} okText="儲存" cancelText="取消" width={640} destroyOnClose>
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="content" label="陳情內容" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="petition_date" label="陳情日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="urgency" label="急迫程度">
                <Select>
                  <Option value="normal">一般</Option>
                  <Option value="urgent">急件</Option>
                  <Option value="critical">特急</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="channel" label="陳情方式">
                <Select allowClear>
                  {['電話','親訪','書信','Email','Line','網路','法律諮詢','其他'].map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <ManagedCategoryField name="category" tab="petition_category" buttonText="管理類別" label={
                <Space>
                  <span>陳情類別</span>
                  <AIButton
                    label="AI 推薦"
                    size="small"
                    type="link"
                    endpoint="/ai/classify"
                    payload={{ title: petition?.title || petition?.content?.slice(0, 80), content: petition?.content }}
                    onResult={(d) => editForm.setFieldsValue({ category: d.category })}
                  />
                </Space>
              }>
                <Select allowClear showSearch>
                  {categories.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </ManagedCategoryField>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="contact_phone" label="聯絡電話">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="voter_id" label="陳情人（選民）">
                <Select allowClear showSearch filterOption={false} onSearch={searchVoters} placeholder="搜尋選民">
                  {voters.map(v => <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>)}
                  {petition?.voter_id && !voters.find((v: any) => v.id === petition.voter_id) && (
                    <Option value={petition.voter_id}>{petition.voter_name}</Option>
                  )}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={8}>
              <Form.Item name="area_city" label="縣市"><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={16}>
              <ManagedCategoryField name="area_district" label="區域" tab="petition_area" buttonText="管理區域">
                <Input />
              </ManagedCategoryField>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="area_address" label="地址"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="subcategory" label="子分類"><Input /></Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
