import React, { useState, useEffect } from 'react'
import { Table, Tag, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'

export default function TeamEfficiency() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    setLoading(true)
    api.get('/reports/team-efficiency')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const onTimeColor = (rate: number | null) => {
    if (rate === null || rate === undefined) return 'default'
    if (rate >= 80) return 'green'
    if (rate >= 50) return 'orange'
    return 'red'
  }
  return (
    <Table
      dataSource={data} rowKey="id" loading={loading} size="small"
      pagination={{ pageSize: 15 }}
      onRow={(record) => ({ onClick: () => navigate(`/petitions?assignee_id=${record.id}`) })}
      rowClassName={() => 'cursor-pointer'}
      columns={[
        { title: '姓名', dataIndex: 'name', width: 100, render: (v: string) => <Button type="link" style={{ padding: 0 }}>{v}</Button> },
        { title: '陳情案件數', dataIndex: 'petition_count', width: 100, sorter: (a: any, b: any) => a.petition_count - b.petition_count },
        { title: '平均結案天數', dataIndex: 'avg_close_days', width: 120,
          render: (v: number) => v ? `${v} 天` : '—',
          sorter: (a: any, b: any) => (a.avg_close_days || 0) - (b.avg_close_days || 0) },
        { title: '準時結案率', dataIndex: 'on_time_rate', width: 120,
          defaultSortOrder: 'descend' as const,
          sorter: (a: any, b: any) => (a.on_time_rate || 0) - (b.on_time_rate || 0),
          render: (v: number) => v !== null && v !== undefined
            ? <Tag color={onTimeColor(v)}>{v}%</Tag>
            : <Tag>—</Tag> },
        { title: '近30天聯絡', dataIndex: 'contact_count', width: 110,
          sorter: (a: any, b: any) => a.contact_count - b.contact_count,
          render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v}</Tag> },
      ]}
    />
  )
}
