import React, { useState, useEffect } from 'react'
import { Typography, Card, Row, Col, Spin, Empty } from 'antd'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import api from '../../../utils/api'

const { Title } = Typography

export default function VoterLifecycleFunnel() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get('/reports/voter-lifecycle')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <Spin />
  if (!data) return <Empty />
  const stages = [
    { label: '全部選民', key: 'total', color: '#007AFF' },
    { label: '已聯絡', key: 'contacted', color: '#36cfc9' },
    { label: '支持傾向 ≥3', key: 'engaged', color: '#73d13d' },
    { label: '活躍 (分數≥50)', key: 'active', color: '#fa8c16' },
    { label: '核心支持者', key: 'core_supporters', color: '#f5222d' },
  ]
  const total = data.total || 1
  const chartData = stages.map((s, i) => {
    const count = data[s.key] || 0
    const prev = i === 0 ? total : (data[stages[i - 1].key] || 1)
    const conversion = i === 0 ? 100 : Math.round(count / prev * 100)
    return { label: s.label, count, conversion, color: s.color, pct: Math.round(count / total * 100) }
  })
  return (
    <div>
      <Title level={5}>選民生命週期漏斗</Title>
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {chartData.map((s, i) => (
          <Col xs={12} sm={4} key={i}>
            <Card size="small" style={{ borderTop: `4px solid ${s.color}`, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: s.color }}>{s.count.toLocaleString()}</div>
              <div style={{ fontSize: 12 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{s.pct}% 全體</div>
              {i > 0 && <div style={{ fontSize: 11, color: s.color }}>{s.conversion}% 轉換</div>}
            </Card>
          </Col>
        ))}
      </Row>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="label" width={120} />
          <Tooltip formatter={(v: any) => [v.toLocaleString(), '人數']} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="count" position="right" formatter={(v: any) => v.toLocaleString()} />
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
