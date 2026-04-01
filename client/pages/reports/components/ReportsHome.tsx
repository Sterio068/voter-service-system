import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Alert, Typography, Statistic } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface Props {
  onNavigate: (key: string) => void
}

export default function ReportsHome({ onNavigate }: Props) {
  const [summary, setSummary] = useState<any>(null)
  const [alerts, setAlerts] = useState<string[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/reports/monthly-trend').then(r => setSummary(r.data.data)).catch(() => {})
    api.get('/admin/alerts').then(r => {
      if (r.data.success && r.data.data?.length > 0) {
        const latest = r.data.data[0]
        const detail = typeof latest.detail === 'string'
          ? (() => { try { return JSON.parse(latest.detail) } catch { return {} } })()
          : (latest.detail || {})
        if (detail.alerts?.length > 0) setAlerts(detail.alerts.slice(0, 3))
      }
    }).catch(() => {})
  }, [])

  const currentMonth = dayjs().format('MM')
  const thisMonthPetitions = summary?.petitions_this?.find((d: any) => d.month === currentMonth)?.count || 0
  const thisMonthDocs = summary?.docs_this?.find((d: any) => d.month === currentMonth)?.count || 0

  const quickLinks = [
    { key: 'workload', label: '人員工作量', color: '#007AFF' },
    { key: 'trend', label: '月趨勢', color: '#52c41a' },
    { key: 'no-contact', label: '未接觸選民', color: '#fa8c16' },
    { key: 'high-risk', label: '高風險陳情', color: '#ff4d4f' },
    { key: 'area-gap', label: '選區缺口', color: '#722ed1' },
    { key: 'satisfaction', label: '滿意度排名', color: '#13c2c2' },
  ]

  return (
    <div>
      {alerts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`系統預警（${alerts.length} 項）`}
          description={alerts.join('、')}
          closable
          style={{ marginBottom: 16 }}
        />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="本月新增陳情" value={thisMonthPetitions} valueStyle={{ color: '#007AFF' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="本月公文" value={thisMonthDocs} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>
      <Title level={5}>快速連結</Title>
      <Row gutter={[12, 12]}>
        {quickLinks.map(link => (
          <Col xs={12} sm={8} key={link.key}>
            <Card
              size="small"
              style={{ cursor: 'pointer', borderLeft: `4px solid ${link.color}`, textAlign: 'center' }}
              onClick={() => onNavigate(link.key)}
            >
              <Text strong style={{ color: link.color }}>{link.label}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
