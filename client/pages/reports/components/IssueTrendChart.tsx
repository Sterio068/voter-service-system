import React, { useState, useEffect } from 'react'
import { Select, Space, Typography, Spin, Empty } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../../../utils/api'
import { COLORS } from '../utils'

const { Text } = Typography

export default function IssueTrendChart() {
  const [rawData, setRawData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [months, setMonths] = useState(6)
  useEffect(() => {
    setLoading(true)
    api.get(`/reports/issue-trend?months=${months}`)
      .then(r => setRawData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [months])

  // Build top 5 categories and pivot data
  const catCounts: Record<string, number> = {}
  rawData.forEach(d => { catCounts[d.category] = (catCounts[d.category] || 0) + d.count })
  const top5 = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0])
  const monthSet = Array.from(new Set(rawData.map(d => d.month))).sort()
  const chartData = monthSet.map(m => {
    const entry: any = { month: m }
    top5.forEach(cat => {
      const found = rawData.find(d => d.month === m && d.category === cat)
      entry[cat] = found?.count || 0
    })
    return entry
  })

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Text>查詢月數：</Text>
        <Select value={months} onChange={setMonths} style={{ width: 100 }}>
          <Select.Option value={3}>3 個月</Select.Option>
          <Select.Option value={6}>6 個月</Select.Option>
          <Select.Option value={12}>12 個月</Select.Option>
        </Select>
      </Space>
      {loading ? <Spin /> : chartData.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            {top5.map((cat, i) => (
              <Line key={cat} type="monotone" dataKey={cat} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
