import React, { useState, useEffect } from 'react'
import {
  Card, Table, Button, Space, Tag, Typography, Modal, Form, Input,
  Select, DatePicker, message, Badge, Tooltip, Progress, Popconfirm, Alert
} from 'antd'
import { PlusOutlined, CheckOutlined, CalendarOutlined, DeleteOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import { useDataSync } from '../../hooks/useDataSync'
import PageScaffold from '../../components/ui/PageScaffold'
import { TASK_PRIORITY_COLORS as PRIORITY_COLORS, TASK_PRIORITY_LABELS as PRIORITY_LABELS, TASK_STATUS_COLORS as STATUS_COLORS, TASK_STATUS_LABELS as STATUS_LABELS } from '../../utils/constants'
import dayjs from 'dayjs'
import { hasModulePermission } from '../../utils/permissions'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export default function TasksPage() {
  const { user } = useAuthStore()
  const canCreateTask = hasModulePermission(user?.role, 'tasks', 'create')
  const canEditTask = hasModulePermission(user?.role, 'tasks', 'edit')
  const canDeleteTask = hasModulePermission(user?.role, 'tasks', 'delete')
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('pending,in_progress')
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [users, setUsers] = useState<any[]>([])
  const [voters, setVoters] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [auxError, setAuxError] = useState<string | null>(null)

  // U-9: Today focus
  const [todayFocus, setTodayFocus] = useState(searchParams.get('focus') === 'today')

  useEffect(() => {
    setTodayFocus(searchParams.get('focus') === 'today')
  }, [searchParams])

  useEffect(() => {
    if (searchParams.get('action') === 'new' && canCreateTask) {
      form.resetFields()
      setModalOpen(true)
    }
  }, [searchParams, canCreateTask, form])

  useEffect(() => {
    fetchTasks()
    setAuxError(null)
    Promise.allSettled([
      api.get('/users/list').then(r => setUsers(r.data.data || [])),
      api.get('/voters?pageSize=200').then(r => setVoters(r.data.data || [])),
    ]).then(results => {
      const failed = results.filter(r => r.status === 'rejected')
      if (failed.length > 0) {
        setAuxError('部分輔助資料（承辦人或選民清單）載入失敗，仍可建立任務但選項可能不完整。')
      }
    })
  }, [page, statusFilter, todayFocus])

  useDataSync((events) => {
    const hasTaskChange = events.some(e => e.target_type === 'task')
    if (hasTaskChange) fetchTasks()
  }, [])

  const fetchTasks = async () => {
    setLoading(true)
    setError(null)
    try {
      const effectiveStatus = todayFocus ? '' : statusFilter
      const res = await api.get(`/tasks?page=${page}&pageSize=${todayFocus ? 200 : 20}${effectiveStatus ? '&status=' + effectiveStatus : ''}`)
      setTasks(res.data.data || [])
      setTotal(res.data.total || 0)
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || '載入待辦事項失敗')
    }
    setLoading(false)
  }

  // U-9: Compute today-focus filtered and grouped tasks
  const today = dayjs().format('YYYY-MM-DD')
  const todayTasks = tasks.filter(t => {
    const isDueToday = t.due_date === today
    const isActiveAssigned = ['pending', 'in_progress'].includes(t.status) &&
      (t.assignee_id === user?.id || t.assignee_name === user?.name)
    return isDueToday || isActiveAssigned
  })
  const todayTasksSorted = [...todayTasks].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  )
  const todayDoneCount = todayTasks.filter(t => t.status === 'done').length
  const todayTotalCount = todayTasks.length

  const displayTasks = todayFocus ? todayTasksSorted : tasks
  const displayTotal = todayFocus ? todayTasks.length : total

  const toggleTodayFocus = () => {
    const next = !todayFocus
    const nextParams = new URLSearchParams(searchParams)
    if (next) nextParams.set('focus', 'today')
    else nextParams.delete('focus')
    setSearchParams(nextParams, { replace: true })
  }

  const handleSave = async (values: any) => {
    try {
      await api.post('/tasks', {
        ...values,
        due_date: values.due_date ? dayjs(values.due_date).format('YYYY-MM-DD') : undefined
      })
      message.success('待辦已建立')
      setModalOpen(false); form.resetFields(); fetchTasks()
    } catch { message.error('建立失敗') }
  }

  const handleStatus = async (id: number, status: string) => {
    try {
      await api.put(`/tasks/${id}`, { status })
      fetchTasks()
    } catch { message.error('更新失敗') }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/tasks/${id}`)
      message.success('任務已刪除')
      fetchTasks()
    } catch { message.error('刪除失敗') }
  }

  const columns = [
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: string) => <Tag color={PRIORITY_COLORS[v]}>{PRIORITY_LABELS[v]}</Tag>
    },
    { title: '標題', dataIndex: 'title', render: (v: string, r: any) => (
      <Space direction="vertical" size={0}>
        <Text>{v}</Text>
        {r.related_voter_id && <Text type="secondary" style={{ fontSize: 12 }}>👤 {r.voter_name}</Text>}
      </Space>
    )},
    { title: '截止日', dataIndex: 'due_date', width: 100, render: (v: string) => {
      if (!v) return '—'
      const isOverdue = dayjs(v).isBefore(dayjs(), 'day')
      return <Text type={isOverdue ? 'danger' : undefined}>{v}{isOverdue ? ' ⚠️' : ''}</Text>
    }},
    { title: '承辦人', dataIndex: 'assignee_name', width: 100, render: (v: string) => v || '—' },
    { title: '狀態', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>
    },
    { title: '操作', width: 120, render: (_: any, r: any) => (
      <Space>
        {canEditTask && r.status !== 'done' && (
          <Tooltip title="標記完成">
            <Button size="small" icon={<CheckOutlined />} aria-label="完成待辦" type="primary" ghost
              onClick={() => handleStatus(r.id, 'done')} />
          </Tooltip>
        )}
        {canEditTask && r.status === 'done' && (
          <Button size="small" aria-label="重啟待辦" onClick={() => handleStatus(r.id, 'pending')}>重啟</Button>
        )}
        {canDeleteTask && (
          <Popconfirm
            title="確定刪除此任務？"
            okText="確定刪除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="刪除待辦" />
          </Popconfirm>
        )}
      </Space>
    )}
  ]

  return (
    <PageScaffold
      eyebrow="Task Queue"
      title="待辦事項"
      titleLevel={4}
      variant="compact"
      description={todayFocus ? '今日焦點模式只顯示今天到期與指派給你的進行中任務。' : '統一追蹤服務處待辦、承辦人與截止日期。'}
      actions={
        <>
          <Badge count={todayTasks.length} size="small" offset={[-4, 4]}>
            <Button
              icon={<CalendarOutlined />}
              type={todayFocus ? 'primary' : 'default'}
              onClick={toggleTodayFocus}
            >
              今日焦點
            </Button>
          </Badge>
          {!todayFocus && (
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 160 }}>
              <Option value="pending,in_progress">未完成</Option>
              <Option value="done">已完成</Option>
              <Option value="">全部</Option>
            </Select>
          )}
          {canCreateTask && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true) }}>
              新增待辦
            </Button>
          )}
        </>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          action={<Button size="small" onClick={fetchTasks}>重試</Button>}
          style={{ marginBottom: 12 }}
          onClose={() => setError(null)}
        />
      )}
      {auxError && (
        <Alert
          type="warning"
          showIcon
          closable
          message={auxError}
          style={{ marginBottom: 12 }}
          onClose={() => setAuxError(null)}
        />
      )}

      {todayFocus && todayTotalCount > 0 && (
        <Card size="small" style={{ marginBottom: 12, background: 'rgba(0,122,255,0.06)', border: '1px solid rgba(0,122,255,0.2)' }}>
          <Space style={{ width: '100%' }} direction="vertical" size={4}>
            <Text strong>今日完成進度 {todayDoneCount}/{todayTotalCount}</Text>
            <Progress
              percent={todayTotalCount > 0 ? Math.round((todayDoneCount / todayTotalCount) * 100) : 0}
              size="small"
              status={todayDoneCount === todayTotalCount && todayTotalCount > 0 ? 'success' : 'active'}
              style={{ marginBottom: 0 }}
            />
          </Space>
        </Card>
      )}

      <Card>
        <Table
          columns={columns} dataSource={displayTasks} rowKey="id" loading={loading} size="small"
          pagination={todayFocus ? false : { current: page, total: displayTotal, pageSize: 20, showTotal: t => `共 ${t} 筆`, onChange: setPage }}
        />
      </Card>
      <Modal title="新增待辦" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} okText="建立" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="標題" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="說明"><TextArea rows={2} /></Form.Item>
          <Space style={{ width: '100%' }} size={12}>
            <Form.Item name="priority" label="優先級" initialValue="normal" style={{ flex: 1 }}>
              <Select>{Object.entries(PRIORITY_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="due_date" label="截止日" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="assignee_id" label="承辦人">
            <Select allowClear placeholder="指定承辦人">
              {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="related_voter_id" label="關聯選民">
            <Select allowClear showSearch placeholder="搜尋選民" filterOption={(input, opt) =>
              String(opt?.children || '').toLowerCase().includes(input.toLowerCase())
            }>
              {voters.map(v => <Option key={v.id} value={v.id}>{v.name}{v.mobile ? ` (${v.mobile})` : ''}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </PageScaffold>
  )
}
