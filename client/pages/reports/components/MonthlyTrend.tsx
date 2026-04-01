import React, { useState, useEffect } from 'react'
import { Typography, Spin, Empty } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../../../utils/api'
import { MONTH_NAMES } from '../utils'

const { Title } = Typography

export default function MonthlyTrend({ year }: { year: string }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    setLoading(true)
    setError(false)
    api.get('/reports/monthly-trend')
      .then(r => setData(r.data.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [year])
  if (loading) return <Spin />
  if (error) return <Empty description="載入失敗，請重試" />
  if (!data) return <Empty />
  const chartData = MONTH_NAMES.map((month, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const thisY = data.petitions_this?.find((d: any) => d.month === mm)?.count || 0
    const lastY = data.petitions_last?.find((d: any) => d.month === mm)?.count || 0
    const docs = data.docs_this?.find((d: any) => d.month === mm)?.count || 0
    return { month, thisYear: thisY, lastYear: lastY, docs }
  })
  return (
    <div>
      <Title level={5}>陳情案件趨勢（{data.lastYear} vs {data.thisYear}）</Title>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="thisYear" name={`${data.thisYear}年`} stroke="#007AFF" strokeWidth={2} />
          <Line type="monotone" dataKey="lastYear" name={`${data.lastYear}年`} stroke="#d9d9d9" strokeWidth={2} strokeDasharray="5 5" />
          <Line type="monotone" dataKey="docs" name="公文" stroke="#52c41a" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
