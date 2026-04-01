import React, { useState, useEffect } from 'react'
import { Table, Tag, Button, Select, Space, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import { usePersistedState } from '../utils'

const { Text } = Typography

export default function NoContactVoters() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [days, setDays] = usePersistedState('no_contact_days', 90)
  const [selected, setSelected] = useState<any[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get(`/reports/no-contact-voters?days=${days}`)
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  const handleBatchTask = async (selectedRows: any[]) => {
    try {
      await Promise.all(selectedRows.map(v => api.post('/tasks', {
        title: `電訪追蹤：${v.name}`,
        related_voter_id: v.id,
        priority: 'normal',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      })))
      message.success(`已為 ${selectedRows.length} 位選民建立電訪待辦`)
    } catch { message.error('操作失敗') }
  }

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Text>未聯絡超過：</Text>
        <Select value={days} onChange={setDays} style={{ width: 100 }}>
          <Select.Option value={30}>30 天</Select.Option>
          <Select.Option value={60}>60 天</Select.Option>
          <Select.Option value={90}>90 天</Select.Option>
        </Select>
        {selected.length > 0 && (
          <Button type="primary" onClick={() => handleBatchTask(selected)}>
            為選取的 {selected.length} 位建立電訪待辦
          </Button>
        )}
      </Space>
      <Table
        dataSource={data} rowKey="id" loading={loading} size="small"
        rowSelection={{ onChange: (_, rows) => setSelected(rows) }}
        columns={[
          { title: '姓名', dataIndex: 'name', render: (v: string, r: any) => (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/voters/${r.id}`)}>{v}</Button>
          )},
          { title: '手機', dataIndex: 'mobile', width: 120 },
          { title: '選區', dataIndex: 'household_district', width: 100 },
          { title: '陳情次數', dataIndex: 'petition_count', width: 90 },
          { title: '最後聯絡', dataIndex: 'last_contact', width: 110, render: (v: string) => v || '從未' },
          { title: '未聯絡天數', dataIndex: 'days_since_contact', width: 100,
            render: (v: number) => <Tag color={v > 180 ? 'red' : v > 90 ? 'orange' : 'default'}>{v} 天</Tag> },
        ]}
        pagination={{ pageSize: 20, showTotal: t => `共 ${t} 位` }}
      />
    </div>
  )
}
