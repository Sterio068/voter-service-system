import React, { useState, useEffect } from 'react'
import { Table, Button, Space, Select, Typography, Card, DatePicker, Tag } from 'antd'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

const ACTION_COLORS: Record<string, string> = {
  login: 'green', logout: 'default', create: 'blue', update: 'orange',
  delete: 'red', export: 'purple', print: 'cyan', query: 'geekblue',
}
const ACTION_LABELS: Record<string, string> = {
  login: '登入', logout: '登出', create: '新增', update: '修改',
  delete: '刪除', export: '匯出', print: '列印', query: '查詢',
}

export default function AuditLogPage() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [filterAction, setFilterAction] = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [modules, setModules] = useState<string[]>([])

  useEffect(() => { fetchLogs() }, [page, filterAction, filterModule, dateRange])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params: any = { page, pageSize: 30 }
      if (filterAction) params.action = filterAction
      if (filterModule) params.module = filterModule
      if (dateRange) { params.start_date = dateRange[0]; params.end_date = dateRange[1] }
      const res = await api.get('/admin/audit-logs', { params })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)

      // 收集模組
      const mods = [...new Set((res.data.data || []).map((r: any) => r.module))] as string[]
      if (mods.length > 0) setModules(prev => [...new Set([...prev, ...mods])])
    } catch {}
    finally { setLoading(false) }
  }

  const columns = [
    { title: '時間', dataIndex: 'created_at', width: 145, render: (d: string) => dayjs(d).format('MM-DD HH:mm:ss') },
    { title: '操作人員', dataIndex: 'user_name', width: 90 },
    {
      title: '操作類型', dataIndex: 'action', width: 80,
      render: (a: string) => <Tag color={ACTION_COLORS[a] || 'default'} style={{ fontSize: 11 }}>{ACTION_LABELS[a] || a}</Tag>,
    },
    { title: '模組', dataIndex: 'module', width: 100 },
    { title: '操作對象', dataIndex: 'target_name', ellipsis: true },
    { title: 'IP', dataIndex: 'ip_address', width: 120 },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📋 操作紀錄</Title>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="操作類型" allowClear style={{ width: 110 }} onChange={setFilterAction}>
            {Object.entries(ACTION_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
          </Select>
          <Select placeholder="功能模組" allowClear style={{ width: 120 }} onChange={setFilterModule}>
            {modules.map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
          <RangePicker onChange={(_, s) => setDateRange(s[0] && s[1] ? [s[0], s[1]] : null)} />
          <Text type="secondary">共 {total} 筆</Text>
        </Space>
      </Card>
      <Card>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading} size="small"
          pagination={{ current: page, pageSize: 30, total, showTotal: t => `共 ${t} 筆`, onChange: setPage }}
          scroll={{ x: 700 }} />
      </Card>
    </div>
  )
}
