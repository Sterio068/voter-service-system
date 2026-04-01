import React, { useState, useEffect } from 'react'
import { Typography, Table, Tag, Spin, Empty } from 'antd'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../../../utils/api'

const { Title } = Typography

export default function EventROIReport() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get('/reports/event-roi')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const chartData = data.slice(0, 10).map(d => ({
    name: d.title?.slice(0, 12) || '—',
    參與人數: d.participant_count || 0,
    當日聯絡: d.same_day_contacts || 0,
  }))
  return (
    <div>
      <Title level={5}>活動效益報告（近 6 個月）</Title>
      {loading ? <Spin /> : data.length === 0 ? <Empty description="近 6 個月無活動資料" /> : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="參與人數" fill="#007AFF" />
              <Bar dataKey="當日聯絡" fill="#52c41a" />
            </BarChart>
          </ResponsiveContainer>
          <Table
            dataSource={data} rowKey="id" size="small" style={{ marginTop: 16 }}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: '活動名稱', dataIndex: 'title', ellipsis: true },
              { title: '日期', dataIndex: 'event_date', width: 110 },
              { title: '參與人數', dataIndex: 'participant_count', width: 90, render: (v: number) => v || 0 },
              { title: '當日聯絡數', dataIndex: 'same_day_contacts', width: 100,
                render: (v: number) => <Tag color={v > 0 ? 'green' : 'default'}>{v}</Tag> },
            ]}
          />
        </>
      )}
    </div>
  )
}
