import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Button, Space, Statistic, Progress, Spin, Empty } from 'antd'
import { DatePicker } from 'antd'
import api from '../../../utils/api'
import { COLORS } from '../utils'

export default function WeeklyReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const loadWeek = (startDate?: string) => {
    setLoading(true)
    setError(false)
    const url = startDate ? `/reports/weekly?start_date=${startDate}` : '/reports/weekly'
    api.get(url).then(r => setData(r.data.data)).catch(() => setError(true)).finally(() => setLoading(false))
  }

  useEffect(() => { loadWeek() }, [])

  const handleExportWeekly = () => {
    if (!data) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><title>週報</title>
<style>body{font-family:'微軟正黑體',sans-serif;margin:20mm 25mm;font-size:11pt}h1{text-align:center;color:#1677ff}h2{color:#1677ff;border-bottom:1px solid #1677ff;padding-bottom:4px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:5px 8px}th{background:#f0f4ff}@media print{@page{size:A4}}</style></head><body>
<h1>每週工作報告</h1>
<p style="text-align:center;color:#666">${data.weekStart} ～ ${data.weekEnd}</p>
<h2>本週數據</h2>
<table><tr><th>新增陳情</th><th>結案</th><th>選民聯絡</th><th>下週行程</th></tr>
<tr><td>${data.new_petitions}</td><td>${data.closed}</td><td>${data.contacts}</td><td>${data.next_week_schedules}</td></tr></table>
<h2>本週熱點地區</h2>
<table><tr><th>地區</th><th>陳情件數</th></tr>${(data.top_areas||[]).map((a: any)=>`<tr><td>${a.district}</td><td>${a.count}</td></tr>`).join('')}</table>
<h2>本週主要陳情類別</h2>
<table><tr><th>類別</th><th>件數</th></tr>${(data.top_categories||[]).map((c: any)=>`<tr><td>${c.category}</td><td>${c.count}</td></tr>`).join('')}</table>
</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 400)
  }

  if (loading) return <Spin />
  if (error) return <Empty description="載入失敗，請重試" />
  if (!data) return <Empty />

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <DatePicker picker="week" onChange={(d) => d && loadWeek(d.startOf('week').add(1,'day').format('YYYY-MM-DD'))} placeholder="選擇週" />
        <Button onClick={handleExportWeekly}>匯出週報</Button>
      </Space>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {[
          { label: '新增陳情', value: data.new_petitions, color: '#007AFF' },
          { label: '已結案', value: data.closed, color: '#52c41a' },
          { label: '逾期案件', value: data.overdue, color: '#ff4d4f' },
          { label: '選民聯絡', value: data.contacts, color: '#722ed1' },
        ].map(stat => (
          <Col xs={12} sm={6} key={stat.label}>
            <Card size="small">
              <Statistic title={stat.label} value={stat.value} valueStyle={{ color: stat.color }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="熱點地區 Top 5" size="small">
            {(data.top_areas || []).map((a: any, i: number) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <Progress percent={Math.round(a.count / Math.max(...(data.top_areas||[{count:1}]).map((x: any)=>x.count)) * 100)}
                  format={() => `${a.district} ${a.count}件`} size="small" />
              </div>
            ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="陳情類別 Top 5" size="small">
            {(data.top_categories || []).map((c: any, i: number) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <Progress percent={Math.round(c.count / Math.max(...(data.top_categories||[{count:1}]).map((x: any)=>x.count)) * 100)}
                  format={() => `${c.category} ${c.count}件`} size="small" strokeColor={COLORS[i % COLORS.length]} />
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
