import React, { useState, useEffect } from 'react'
import { Typography, Table, Spin, Empty } from 'antd'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../../../utils/api'

const { Title } = Typography

export default function ClosureEfficiency({ year }: { year: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get(`/reports/closure-efficiency?year=${year}`)
      .then(r => setData(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year])
  if (loading) return <Spin />
  if (!data) return <Empty />
  const monthChartData = (data.byMonth || []).map((d: any) => ({
    month: d.month + '月', total: d.total, closed: d.closed, avg_days: d.avg_days || 0
  }))
  return (
    <div>
      <Title level={5}>月份結案趨勢</Title>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={monthChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" />
          <Tooltip /><Legend />
          <Bar yAxisId="left" dataKey="total" name="總案件" fill="#d9d9d9" />
          <Bar yAxisId="left" dataKey="closed" name="結案" fill="#52c41a" />
          <Line yAxisId="right" type="monotone" dataKey="avg_days" name="平均天數" stroke="#fa8c16" />
        </BarChart>
      </ResponsiveContainer>
      <Title level={5} style={{ marginTop: 24 }}>各類別平均結案天數</Title>
      <Table
        dataSource={data.byCategory || []} rowKey="category" size="small" pagination={false}
        columns={[
          { title: '類別', dataIndex: 'category' },
          { title: '總案件', dataIndex: 'total', width: 80 },
          { title: '平均結案天數', dataIndex: 'avg_days', width: 130, render: (v: number) => v ? `${v} 天` : '—' },
        ]}
      />
    </div>
  )
}
