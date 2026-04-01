import React, { useState, useEffect } from 'react'
import { Table, Tag, Typography } from 'antd'
import api from '../../../utils/api'

const { Text } = Typography

export default function HighRiskPetitions() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/high-risk-petitions')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const riskConfig: Record<string, { label: string; color: string }> = {
    overdue: { label: '已逾期', color: 'red' },
    low_satisfaction: { label: '低滿意度', color: 'orange' },
    stale: { label: '長期停滯', color: 'purple' },
  }

  return (
    <Table
      dataSource={data} rowKey="id" loading={loading} size="small"
      columns={[
        { title: '風險類型', dataIndex: 'risk_type', width: 100,
          render: (v: string) => <Tag color={riskConfig[v]?.color || 'default'}>{riskConfig[v]?.label || v}</Tag> },
        { title: '案件編號', dataIndex: 'case_number', width: 120 },
        { title: '陳情人', dataIndex: 'voter_name', width: 90, render: (v: string) => v || '匿名' },
        { title: '承辦人', dataIndex: 'assignee_name', width: 90, render: (v: string) => v || '未指派' },
        { title: '案件天數', dataIndex: 'age_days', width: 90,
          render: (v: number) => <Tag color={v > 30 ? 'red' : 'default'}>{v} 天</Tag> },
        { title: '截止日', dataIndex: 'due_date', width: 100,
          render: (v: string, r: any) => v ? <Text type={r.risk_type === 'overdue' ? 'danger' : undefined}>{v}</Text> : '—' },
        { title: '內容摘要', dataIndex: 'content',
          render: (v: string) => v?.slice(0, 30) || '—' },
      ]}
      pagination={{ pageSize: 20 }}
    />
  )
}
