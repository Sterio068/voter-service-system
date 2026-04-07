import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input,
  Select, DatePicker, message, Drawer, Descriptions, Badge, Progress, Popconfirm
} from 'antd'
import { PlusOutlined, TeamOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { RangePicker } = DatePicker

const TYPE_LABELS: Record<string, string> = {
  meeting: '會議', seminar: '說明會', activity: '活動', ceremony: '典禮', other: '其他'
}
const STATUS_COLORS: Record<string, string> = {
  planned: 'blue', ongoing: 'green', completed: 'default', cancelled: 'red'
}
const STATUS_LABELS: Record<string, string> = {
  planned: '計畫中', ongoing: '進行中', completed: '已完成', cancelled: '已取消'
}

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [addVoterOpen, setAddVoterOpen] = useState(false)
  const [addVoterForm] = Form.useForm()
  const [voters, setVoters] = useState<any[]>([])

  useEffect(() => { fetchEvents() }, [page])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/events?page=${page}&pageSize=20`)
      setEvents(res.data.data || []); setTotal(res.data.total || 0)
    } catch { message.error('載入失敗') }
    setLoading(false)
  }

  const openDetail = async (event: any) => {
    setSelectedEvent(event)
    try {
      const res = await api.get(`/events/${event.id}/participants`)
      setParticipants(res.data.data || [])
    } catch { message.error('載入參與者失敗') }
    api.get('/voters?pageSize=500').then(r => setVoters(r.data.data || [])).catch(() => {})
    setDetailOpen(true)
  }

  const handleSave = async (values: any) => {
    try {
      await api.post('/events', {
        ...values,
        event_date: values.date_range?.[0] ? dayjs(values.date_range[0]).format('YYYY-MM-DD') : values.event_date,
        end_date: values.date_range?.[1] ? dayjs(values.date_range[1]).format('YYYY-MM-DD') : undefined,
      })
      message.success('活動已建立')
      setDrawerOpen(false); form.resetFields(); fetchEvents()
    } catch { message.error('建立失敗') }
  }

  const handleAddParticipant = async (values: any) => {
    try {
      await api.post(`/events/${selectedEvent.id}/participants`, values)
      const res = await api.get(`/events/${selectedEvent.id}/participants`)
      setParticipants(res.data.data || [])
      setAddVoterOpen(false); addVoterForm.resetFields()
    } catch { message.error('新增失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/events/${id}`)
      message.success('活動已刪除')
      fetchEvents()
    } catch (err: any) {
      message.error(err.response?.data?.error || '刪除失敗')
    }
  }

  const handleAttendance = async (voterId: number, attendance: number) => {
    try {
      await api.put(`/events/${selectedEvent.id}/participants/${voterId}`, { attendance })
      const res = await api.get(`/events/${selectedEvent.id}/participants`)
      setParticipants(res.data.data || [])
    } catch { message.error('更新失敗') }
  }

  const columns = [
    { title: '活動名稱', dataIndex: 'title' },
    { title: '日期', dataIndex: 'event_date', width: 110 },
    { title: '類型', dataIndex: 'event_type', width: 80, render: (v: string) => TYPE_LABELS[v] || v },
    { title: '地點', dataIndex: 'location', width: 120, render: (v: string) => v || '—' },
    { title: '狀態', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag> },
    { title: '操作', width: 130, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" icon={<TeamOutlined />} onClick={(e) => { e.stopPropagation(); openDetail(r) }}>名單</Button>
        <Popconfirm
          title="確定刪除此活動？"
          description="刪除後將無法復原。"
          okText="確定刪除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={(e) => { e?.stopPropagation(); handleDelete(r.id) }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      </Space>
    )}
  ]

  const participantColumns = [
    { title: '姓名', dataIndex: 'voter_name' },
    { title: '角色', dataIndex: 'role', width: 90, render: (v: string) => v || 'participant' },
    { title: '出席', dataIndex: 'attendance', width: 100, render: (v: number, r: any) => (
      <Select size="small" value={v} onChange={(val) => handleAttendance(r.voter_id, val)} style={{ width: 80 }}>
        <Option value={0}>已報名</Option>
        <Option value={1}>出席</Option>
        <Option value={2}>缺席</Option>
      </Select>
    )},
    { title: '備註', dataIndex: 'note', render: (v: string) => v || '—' },
  ]

  const attended = participants.filter(p => p.attendance === 1).length

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>🎪 活動管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>新增活動</Button>
      </div>
      <Card>
        <Table columns={columns} dataSource={events} rowKey="id" loading={loading} size="small"
          onRow={r => ({ onClick: () => openDetail(r), style: { cursor: 'pointer' } })}
          pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 筆`, onChange: setPage }} />
      </Card>
      <Drawer title="新增活動" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}
        footer={<Space><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>儲存</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="活動名稱" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="date_range" label="活動日期"><RangePicker style={{ width: '100%' }} /></Form.Item>
          <Space size={12} style={{ width: '100%' }}>
            <Form.Item name="event_type" label="類型" style={{ flex: 1 }} initialValue="activity">
              <Select>{Object.entries(TYPE_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="capacity" label="名額" style={{ flex: 1 }}><Input type="number" /></Form.Item>
          </Space>
          <Form.Item name="location" label="地點"><Input /></Form.Item>
          <Form.Item name="organizer" label="主辦單位"><Input /></Form.Item>
          <Form.Item name="description" label="說明"><TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>
      <Drawer title={selectedEvent?.title} open={detailOpen} onClose={() => setDetailOpen(false)} width={600}
        extra={<Button type="primary" size="small" onClick={() => setAddVoterOpen(true)}>新增參與者</Button>}>
        {selectedEvent && (
          <div>
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="日期">{selectedEvent.event_date}</Descriptions.Item>
              <Descriptions.Item label="類型">{TYPE_LABELS[selectedEvent.event_type]}</Descriptions.Item>
              <Descriptions.Item label="地點">{selectedEvent.location || '—'}</Descriptions.Item>
              <Descriptions.Item label="出席率">
                {participants.length > 0 ? `${attended}/${participants.length} (${Math.round(attended/participants.length*100)}%)` : '0'}
              </Descriptions.Item>
            </Descriptions>
            <Table columns={participantColumns} dataSource={participants} rowKey="voter_id" size="small" pagination={false} />
          </div>
        )}
      </Drawer>
      <Modal title="新增參與者" open={addVoterOpen} onCancel={() => setAddVoterOpen(false)}
        onOk={() => addVoterForm.submit()} okText="新增">
        <Form form={addVoterForm} layout="vertical" onFinish={handleAddParticipant}>
          <Form.Item name="voter_id" label="選民" rules={[{ required: true }]}>
            <Select showSearch filterOption={(i, o) => String(o?.children || '').toLowerCase().includes(i.toLowerCase())}>
              {voters.map(v => <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="participant">
            <Select>
              <Option value="participant">一般參與者</Option>
              <Option value="volunteer">志工</Option>
              <Option value="speaker">講者</Option>
              <Option value="host">主持人</Option>
            </Select>
          </Form.Item>
          <Form.Item name="note" label="備註"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
