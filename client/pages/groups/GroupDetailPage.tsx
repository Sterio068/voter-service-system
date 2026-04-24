import React, { useState, useEffect } from 'react'
import {
  Card, Tabs, Descriptions, Button, Space, Typography, Table, Spin,
  Breadcrumb, message, Modal, Select, Input, Row, Col, Tag, Statistic, Popconfirm, Form
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined, EditOutlined, CalendarOutlined, DollarOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../utils/api'
import { useDataSync } from '../../hooks/useDataSync'
import PageScaffold from '../../components/ui/PageScaffold'
import EmptyState from '../../components/ui/EmptyState'
import dayjs from 'dayjs'
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS } from '../../utils/constants'

const { Text } = Typography
const { Option } = Select

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<any>(null)
  const [schedules, setSchedules] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [editMemberOpen, setEditMemberOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<any>(null)
  const [selectedVoters, setSelectedVoters] = useState<number[]>([])
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberTitle, setNewMemberTitle] = useState('')
  const [voterOptions, setVoterOptions] = useState<any[]>([])
  const [memberForm] = Form.useForm()
  const [editGroupOpen, setEditGroupOpen] = useState(false)
  const [editGroupForm] = Form.useForm()
  const [groupCategories, setGroupCategories] = useState<string[]>([])

  useDataSync((events) => {
    const relevant = events.some(e => ['group', 'group_member', 'schedule', 'ceremony'].includes(e.target_type))
    if (relevant && id) loadAll()
  }, [id ?? ''])

  useEffect(() => {
    if (id) loadAll()
    api.get('/admin/categories?type=group_category').then(r => setGroupCategories((r.data.data || []).map((c: any) => c.name))).catch(() => {})
  }, [id])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [groupRes, schedRes, expRes] = await Promise.all([
        api.get(`/groups/${id}`),
        api.get(`/groups/${id}/schedules`).catch(() => ({ data: { data: [] } })),
        api.get(`/groups/${id}/expenses`).catch(() => ({ data: { data: [], total: 0 } })),
      ])
      setGroup(groupRes.data.data)
      setSchedules(schedRes.data.data || [])
      setExpenses(expRes.data.data || [])
      setExpenseTotal(expRes.data.total || 0)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const searchVoters = async (q: string) => {
    if (!q) return
    try {
      const res = await api.get(`/voters/search?q=${q}`)
      setVoterOptions(res.data.data || [])
    } catch {}
  }

  const handleAddMembers = async (): Promise<void> => {
    if (!selectedVoters.length) { message.warning('請選擇成員'); return Promise.reject() }
    try {
      await api.post(`/groups/${id}/members`, { voter_ids: selectedVoters, role: newMemberRole || null })
      // Update title for each member if provided
      if (newMemberTitle) {
        for (const vid of selectedVoters) {
          await api.put(`/groups/${id}/members/${vid}`, { role: newMemberRole || null, title: newMemberTitle })
        }
      }
      message.success('成員已新增')
      setAddMemberOpen(false)
      setSelectedVoters([])
      setNewMemberRole('')
      setNewMemberTitle('')
      loadAll()
    } catch (err: any) { message.error(err.response?.data?.error || '新增失敗') }
  }

  const handleRemoveMember = async (voterId: number) => {
    try {
      await api.delete(`/groups/${id}/members/${voterId}`)
      message.success('成員已移除')
      loadAll()
    } catch { message.error('移除失敗') }
  }

  const handleEditGroup = async (values: any) => {
    try {
      await api.put(`/groups/${id}`, values)
      message.success('團體資料已更新')
      setEditGroupOpen(false)
      editGroupForm.resetFields()
      loadAll()
    } catch (err: any) { message.error(err.response?.data?.error || '更新失敗') }
  }

  const handleDeleteGroup = async () => {
    try {
      await api.delete(`/groups/${id}`)
      message.success('團體已停用')
      navigate('/groups')
    } catch { message.error('停用失敗') }
  }

  const handleEditMember = (member: any) => {
    setEditingMember(member)
    memberForm.setFieldsValue({ role: member.role, title: member.title })
    setEditMemberOpen(true)
  }

  const handleSaveMember = async (values: any) => {
    try {
      await api.put(`/groups/${id}/members/${editingMember.voter_id}`, values)
      message.success('已更新')
      setEditMemberOpen(false)
      memberForm.resetFields()
      loadAll()
    } catch { message.error('更新失敗') }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
  if (!group) return <EmptyState title="團體不存在" description="這筆資料可能已停用、刪除或目前沒有讀取權限。" />

  const members = group.members || []

  const memberColumns = [
    {
      title: '姓名', dataIndex: 'voter_name',
      render: (n: string, r: any) => <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/voters/${r.voter_id}`)}>{n}</Button>
    },
    { title: '手機', dataIndex: 'voter_mobile', render: (v: string) => v || '—' },
    {
      title: '角色', dataIndex: 'role',
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '—'
    },
    {
      title: '頭銜', dataIndex: 'title',
      render: (v: string) => v ? <Tag color="purple">{v}</Tag> : '—'
    },
    {
      title: '操作', width: 90,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEditMember(r)} />
          <Popconfirm title="確定移除？" onConfirm={() => handleRemoveMember(r.voter_id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const scheduleColumns = [
    {
      title: '日期', dataIndex: 'start_time', width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD')
    },
    {
      title: '時間', dataIndex: 'start_time', width: 80,
      render: (v: string) => dayjs(v).format('HH:mm')
    },
    {
      title: '類型', dataIndex: 'schedule_type', width: 70,
      render: (v: string) => <Tag color={SCHEDULE_TYPE_COLORS[v] || '#8c8c8c'}>{SCHEDULE_TYPE_LABELS[v] || v || '其他'}</Tag>
    },
    {
      title: '標題', dataIndex: 'title',
      render: (v: string, _r: any) => <Button type="link" style={{ padding: 0 }} onClick={() => navigate('/schedules')}>{v}</Button>
    },
    { title: '地點', dataIndex: 'location', render: (v: string) => v || '—' },
    { title: '狀態', dataIndex: 'status', width: 70, render: (v: string) => v || '—' },
  ]

  const expenseColumns = [
    { title: '日期', dataIndex: 'event_date', width: 100, render: (v: string) => v || '—' },
    {
      title: '類型', dataIndex: 'ceremony_type', width: 70,
      render: (v: string) => <Tag>{v}</Tag>
    },
    { title: '受贈人', dataIndex: 'recipient_name', width: 90 },
    {
      title: '金額', dataIndex: 'computed_total', width: 110,
      render: (v: number) => <Text strong>NT$ {(v || 0).toLocaleString()}</Text>
    },
    {
      title: '狀態', dataIndex: 'status', width: 70,
      render: (v: string) => v === 'paid' ? <Tag color="success">已付款</Tag> : <Tag color="warning">計畫中</Tag>
    },
  ]

  return (
    <PageScaffold
      eyebrow="Group Profile"
      title={group.name}
      titleLevel={4}
      variant="compact"
      description={group.address || group.phone || '團體成員、行程與禮儀往來紀錄'}
      actions={
        <>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          {group.category && <Tag color="blue">{group.category}</Tag>}
          <Button icon={<EditOutlined />} onClick={() => {
            editGroupForm.setFieldsValue({
              name: group.name, category: group.category, phone: group.phone,
              member_count: group.member_count, address: group.address, note: group.note,
            })
            setEditGroupOpen(true)
          }}>編輯資料</Button>
          <Popconfirm title="確定停用此團體？" description="停用後將從列表隱藏" onConfirm={handleDeleteGroup} okText="停用" okType="danger" cancelText="取消">
            <Button danger icon={<DeleteOutlined />}>停用</Button>
          </Popconfirm>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberOpen(true)}>新增成員</Button>
        </>
      }
    >
      <Breadcrumb items={[{ title: '團體資料', href: '/groups' }, { title: group.name }]} style={{ marginBottom: 16 }} />

      {/* 統計卡 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title={<Space><TeamOutlined />成員人數</Space>} value={members.length} suffix="人" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title={<Space><CalendarOutlined />相關行程</Space>} value={schedules.length} suffix="筆" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title={<Space><DollarOutlined />禮儀支出</Space>} value={expenseTotal} prefix="NT$" formatter={v => Number(v).toLocaleString()} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="禮儀筆數" value={expenses.length} suffix="筆" /></Card>
        </Col>
      </Row>

      <Card>
        <Tabs defaultActiveKey="members" items={[
          {
            key: 'members', label: `成員名單 (${members.length})`,
            children: (
              <Table columns={memberColumns} dataSource={members} rowKey="id" size="small"
                pagination={{ pageSize: 15 }} locale={{ emptyText: <EmptyState title="尚無成員" description="加入成員後，角色、職稱與關係網絡會在此顯示。" /> }} />
            ),
          },
          {
            key: 'info', label: '基本資料',
            children: (
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="團體名稱">{group.name}</Descriptions.Item>
                <Descriptions.Item label="類別">{group.category || '-'}</Descriptions.Item>
                <Descriptions.Item label="聯絡電話">{group.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="預估成員數">{group.member_count || '-'}</Descriptions.Item>
                <Descriptions.Item label="地址" span={2}>{group.address || '-'}</Descriptions.Item>
                <Descriptions.Item label="備註" span={2}>{group.note || '-'}</Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'schedules', label: `行程紀錄 (${schedules.length})`,
            children: schedules.length === 0
              ? <EmptyState title="尚無相關行程" description="建立團體相關行程後會顯示日期、類型與狀態。" />
              : <Table columns={scheduleColumns} dataSource={schedules} rowKey="id" size="small" pagination={{ pageSize: 10 }} />,
          },
          {
            key: 'expenses', label: `禮儀收支 (${expenses.length})`,
            children: (
              <>
                {expenseTotal > 0 && (
                  <div style={{ textAlign: 'right', marginBottom: 12 }}>
                    <Text>總支出：</Text>
                    <Text strong style={{ fontSize: 18, color: '#1677ff' }}>NT$ {expenseTotal.toLocaleString()}</Text>
                  </div>
                )}
                {expenses.length === 0
                  ? <EmptyState title="尚無禮儀支出" description="禮儀或活動支出建立後會彙整在此。" />
                  : <Table columns={expenseColumns} dataSource={expenses} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
                }
              </>
            ),
          },
        ]} />
      </Card>

      {/* 新增成員 Modal */}
      <Modal title="新增成員" open={addMemberOpen}
        onCancel={() => { setAddMemberOpen(false); setSelectedVoters([]); setNewMemberRole(''); setNewMemberTitle('') }}
        onOk={handleAddMembers} okText="加入" width={480}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>搜尋選民</Text>
          <Select mode="multiple" style={{ width: '100%', marginTop: 4 }} placeholder="搜尋選民姓名或手機"
            showSearch filterOption={false} onSearch={searchVoters} onChange={(v: any) => setSelectedVoters(v)}>
            {voterOptions.map((v: any) => (
              <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>
            ))}
          </Select>
        </div>
        <Row gutter={12}>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>角色</Text>
            <Input style={{ marginTop: 4 }} placeholder="如：主委、幹部" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} />
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>頭銜</Text>
            <Input style={{ marginTop: 4 }} placeholder="如：里長、主任委員" value={newMemberTitle} onChange={e => setNewMemberTitle(e.target.value)} />
          </Col>
        </Row>
      </Modal>

      {/* 編輯成員 Modal */}
      <Modal title={`編輯成員：${editingMember?.voter_name}`} open={editMemberOpen}
        onCancel={() => { setEditMemberOpen(false); memberForm.resetFields() }}
        onOk={() => memberForm.submit()} okText="儲存">
        <Form form={memberForm} layout="vertical" onFinish={handleSaveMember}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="role" label="角色"><Input placeholder="如：主委、幹部" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="title" label="頭銜"><Input placeholder="如：里長、主任委員" /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 編輯團體資料 */}
      <Modal title="編輯團體資料" open={editGroupOpen}
        onCancel={() => { setEditGroupOpen(false); editGroupForm.resetFields() }}
        onOk={() => editGroupForm.submit()} okText="儲存" cancelText="取消" destroyOnClose>
        <Form form={editGroupForm} layout="vertical" onFinish={handleEditGroup}>
          <Form.Item name="name" label="團體名稱" rules={[{ required: true }]}><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category" label="類別">
                <Select allowClear>
                  {groupCategories.map(c => <Option key={c} value={c}>{c}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="聯絡電話"><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="member_count" label="預估成員數"><Input type="number" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="address" label="地址"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="備註"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
