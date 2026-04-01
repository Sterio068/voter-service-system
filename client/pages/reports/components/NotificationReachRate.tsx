import React, { useState, useEffect } from 'react'
import { Typography, Card, Row, Col, Spin, Empty } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '../../../utils/api'
import { COLORS } from '../utils'

const { Title } = Typography

export default function NotificationReachRate() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get('/reports/notification-reach')
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <Spin />
  if (!data) return <Empty />
  const monthChart = (data.byMonth || []).map((d: any) => ({ month: d.month, 已發送: d.sent }))
  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, fontWeight: 'bold', color: '#007AFF' }}>{data.overall_sent_rate}%</div>
            <div style={{ fontSize: 14, color: '#666' }}>整體發送率</div>
            <div style={{ fontSize: 12, color: '#999' }}>{data.overall_sent?.toLocaleString()} / {data.overall_total?.toLocaleString()}</div>
          </Card>
        </Col>
        <Col xs={24} sm={16}>
          <Card size="small" title="各頻道分佈">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={data.byChannel || []} dataKey="sent" nameKey="channel" cx="50%" cy="50%" outerRadius={60} label={({ channel, sent }: any) => `${channel}:${sent}`}>
                  {(data.byChannel || []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
      <Title level={5}>近 6 個月發送趨勢</Title>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={monthChart}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="已發送" stroke="#007AFF" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
