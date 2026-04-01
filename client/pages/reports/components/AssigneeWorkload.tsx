import React, { useState, useEffect } from 'react'
import { Table, Tag, Progress } from 'antd'
import api from '../../../utils/api'

export default function AssigneeWorkload({ year }: { year: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get(`/reports/assignee-workload?year=${year}`)
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year])

  const columns = [
    { title: '承辦人', dataIndex: 'name' },
    { title: '進行中', dataIndex: 'active_count', width: 80, render: (v: number) => <Tag color="blue">{v}</Tag> },
    { title: '今年結案', dataIndex: 'closed_count', width: 90 },
    { title: '逾期', dataIndex: 'overdue_count', width: 70, render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag>0</Tag> },
    { title: '平均結案天數', dataIndex: 'avg_days', width: 110, render: (v: number) => v ? `${v} 天` : '—' },
    { title: '平均滿意度', dataIndex: 'avg_satisfaction', width: 100, render: (v: number) => v ? `${v} ⭐` : '—' },
    { title: '工作量', width: 150, render: (_: any, r: any) => {
      const max = Math.max(...data.map(d => d.active_count || 0), 1)
      return <Progress percent={Math.round((r.active_count/max)*100)} size="small" showInfo={false} />
    }}
  ]
  return <Table dataSource={data} columns={columns} rowKey="id" loading={loading} size="small" pagination={false} />
}
