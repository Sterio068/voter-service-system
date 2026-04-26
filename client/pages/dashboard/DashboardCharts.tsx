import React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, Col, Row } from 'antd'
import { AlertOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../../components/ui/EmptyState'
import { Button } from 'antd'

interface StatusDatum {
  name: string
  value: number
  color: string
}

interface MonthlyDatum {
  name: string
  數量: number
}

interface DashboardChartsProps {
  statusData: StatusDatum[]
  monthlyData: MonthlyDatum[]
  birthdaySpan: number
}

export default function DashboardCharts({ statusData, monthlyData, birthdaySpan }: DashboardChartsProps) {
  const navigate = useNavigate()
  return (
    <>
      <Col xs={24} lg={birthdaySpan}>
        <Card title="陳情狀態分佈">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={58} outerRadius={86} dataKey="value">
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState variant="compact" title="尚無陳情資料" description="建立案件後會顯示狀態分佈。" />
          )}
        </Card>
      </Col>

      <Col xs={24}>
        <Card
          title={<><AlertOutlined /> 本年度陳情趨勢</>}
          extra={<Button type="link" onClick={() => navigate('/reports')}>進階報表</Button>}
        >
          {monthlyData.some((item) => item.數量 > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="數量" fill="#007AFF" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState variant="compact" title="本年度尚無陳情紀錄" description="案件建立後會自動累積月份趨勢。" />
          )}
        </Card>
      </Col>
    </>
  )
}
