import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Select, Typography, Button, Spin, Statistic, Table, Tag, Space
} from 'antd'
import { PrinterOutlined, BarChartOutlined } from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

const STATUS_LABELS: Record<string, string> = {
  pending: '待處理', processing: '處理中', referred: '已轉介',
  replied: '已回覆', closed: '已結案', archived: '已歸檔',
}
const STATUS_COLORS: Record<string, string> = {
  pending: '#faad14', processing: '#1677ff', referred: '#722ed1',
  replied: '#13c2c2', closed: '#52c41a', archived: '#8c8c8c',
}
const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }
const URGENCY_COLORS: Record<string, string> = { normal: '#1677ff', urgent: '#faad14', critical: '#f5222d' }

export default function PetitionStatsPage() {
  const currentYear = dayjs().year()
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<any>({})
  const [officeName, setOfficeName] = useState('選民服務系統')

  useEffect(() => {
    api.get('/admin/settings').then(r => {
      if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
    }).catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [year])

  const loadStats = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/petitions/stats?year=${year}`)
      setStats(res.data.data || {})
    } catch {}
    finally { setLoading(false) }
  }

  const totalCount = (stats.byStatus || []).reduce((s: number, r: any) => s + r.count, 0)
  const closedCount = (stats.byStatus || []).find((r: any) => r.status === 'closed')?.count || 0
  const closedRate = totalCount > 0 ? Math.round(closedCount / totalCount * 100) : 0

  const monthlyData = (stats.byMonth || []).map((r: any) => ({
    name: MONTH_NAMES[parseInt(r.month) - 1],
    數量: r.count,
  }))

  const statusData = (stats.byStatus || []).map((r: any) => ({
    name: STATUS_LABELS[r.status] || r.status,
    value: r.count,
    color: STATUS_COLORS[r.status] || '#8c8c8c',
  }))

  const categoryData = (stats.byCategory || []).slice(0, 10).map((r: any) => ({
    name: r.category || '未分類',
    數量: r.count,
  }))

  const urgencyData = (stats.byUrgency || []).map((r: any) => ({
    name: URGENCY_LABELS[r.urgency] || r.urgency,
    value: r.count,
    color: URGENCY_COLORS[r.urgency] || '#8c8c8c',
  }))

  const handlePrint = () => {
    window.print()
  }

  const yearOptions = []
  for (let y = currentYear; y >= currentYear - 5; y--) yearOptions.push(y)

  return (
    <div className="petition-stats-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-header { margin-bottom: 8px; }
          .ant-card { break-inside: avoid; }
        }
      `}</style>

      <div className="page-header">
        <Space>
          <Title level={4} style={{ margin: 0 }}>📊 陳情統計報表</Title>
          <Select value={year} onChange={setYear} style={{ width: 90 }} className="no-print">
            {yearOptions.map(y => <Option key={y} value={y}>{y} 年</Option>)}
          </Select>
        </Space>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} className="no-print">
          列印報表
        </Button>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {officeName}　{year} 年度陳情業務統計
      </Text>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* 關鍵指標 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="年度陳情總數" value={totalCount} suffix="件" valueStyle={{ color: '#1677ff' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="已結案" value={closedCount} suffix="件" valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="結案率" value={closedRate} suffix="%" valueStyle={{ color: closedRate >= 80 ? '#52c41a' : '#faad14' }} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="待處理"
                  value={(stats.byStatus || []).find((r: any) => r.status === 'pending')?.count || 0}
                  suffix="件"
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            {/* 月度趨勢 */}
            <Col xs={24} lg={14}>
              <Card title="📈 月度陳情趨勢" size="small">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="數量" fill="#1677ff" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>

            {/* 狀態分佈 */}
            <Col xs={24} lg={10}>
              <Card title="🔵 狀態分佈" size="small">
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="45%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {statusData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>尚無資料</div>}
              </Card>
            </Col>

            {/* 類別統計 */}
            <Col xs={24} lg={14}>
              <Card title="📋 陳情類別統計（前 10）" size="small">
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={categoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="數量" fill="#52c41a" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>尚無資料</div>}
              </Card>
            </Col>

            {/* 急迫程度 */}
            <Col xs={24} lg={10}>
              <Card title="⚠️ 急迫程度分佈" size="small">
                {urgencyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={urgencyData} cx="45%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {urgencyData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>尚無資料</div>}
              </Card>
            </Col>

            {/* 詳細數字表 */}
            <Col xs={24} md={12}>
              <Card title="狀態明細" size="small">
                <Table
                  size="small"
                  pagination={false}
                  dataSource={stats.byStatus || []}
                  rowKey="status"
                  columns={[
                    { title: '狀態', dataIndex: 'status', render: s => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]||s}</Tag> },
                    { title: '件數', dataIndex: 'count', align: 'right' as const },
                    { title: '佔比', render: (_, r: any) => `${totalCount ? Math.round(r.count/totalCount*100) : 0}%`, align: 'right' as const },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="類別明細" size="small">
                <Table
                  size="small"
                  pagination={{ pageSize: 8, size: 'small' }}
                  dataSource={stats.byCategory || []}
                  rowKey="category"
                  columns={[
                    { title: '類別', dataIndex: 'category', render: c => c || '未分類' },
                    { title: '件數', dataIndex: 'count', align: 'right' as const },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  )
}
