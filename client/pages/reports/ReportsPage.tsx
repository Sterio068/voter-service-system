import React, { useState, useEffect } from 'react'
import { Card, Tabs, Select, Typography, Space, Button, Alert, Modal, Form, Input, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import { useThemeStore } from '../../stores/themeStore'
import { usePersistedState, exportToPDF } from './utils'

import ReportsHome from './components/ReportsHome'
import AssigneeWorkload from './components/AssigneeWorkload'
import AreaHeatmap from './components/AreaHeatmap'
import MonthlyTrend from './components/MonthlyTrend'
import ClosureEfficiency from './components/ClosureEfficiency'
import SatisfactionRanking from './components/SatisfactionRanking'
import VoterActivity from './components/VoterActivity'
import NoContactVoters from './components/NoContactVoters'
import HighRiskPetitions from './components/HighRiskPetitions'
import AreaGapAnalysis from './components/AreaGapAnalysis'
import WeeklyReport from './components/WeeklyReport'
import TypeAreaCross from './components/TypeAreaCross'
import VoterLifecycleFunnel from './components/VoterLifecycleFunnel'
import EventROIReport from './components/EventROIReport'
import NotificationReachRate from './components/NotificationReachRate'
import IssueTrendChart from './components/IssueTrendChart'
import TeamEfficiency from './components/TeamEfficiency'
import SurveyCrossAnalysis from './components/SurveyCrossAnalysis'
import AssigneeLoadIndex from './components/AssigneeLoadIndex'

const { Title } = Typography
const { Option } = Select

export default function ReportsPage() {
  const currentYear = new Date().getFullYear().toString()
  const [year, setYear] = usePersistedState('monthly_year', currentYear)
  const years = [String(new Date().getFullYear()), String(new Date().getFullYear()-1), String(new Date().getFullYear()-2)]
  const [activeTab, setActiveTab] = useState('home')

  // F-3: Dark mode chart colors
  const { isDark } = useThemeStore()

  // R-5: narrative state for enhanced monthly report
  const [narrativeOpen, setNarrativeOpen] = useState(false)
  const [narrative, setNarrative] = useState('')

  // C-4: system alerts
  const [systemAlerts, setSystemAlerts] = useState<string[]>([])

  useEffect(() => {
    api.get('/admin/alerts').then(r => {
      if (r.data.success && r.data.data?.length > 0) {
        const latest = r.data.data[0]
        const detail = typeof latest.detail === 'string'
          ? (() => { try { return JSON.parse(latest.detail) } catch { return {} } })()
          : (latest.detail || {})
        if (detail.alerts?.length > 0) setSystemAlerts(detail.alerts)
      }
    }).catch(() => {})
  }, [])

  const handleExportPDF = async (narrativeText: string = '') => {
    try {
      const [workload, trend] = await Promise.all([
        api.get(`/reports/assignee-workload?year=${year}`),
        api.get('/reports/monthly-trend'),
      ])
      const wData = workload.data.data || []
      const tData = trend.data.data || {}
      const content = `
        <h1>${year} 年度選民服務工作報告</h1>
        <p style="text-align:center;color:#666">列印日期：${new Date().toLocaleDateString('zh-TW')}</p>
        ${narrativeText ? `<h2>主任綜整說明</h2><div style="background:#f9f9f9;border-left:4px solid #007AFF;padding:10px 14px;white-space:pre-wrap">${narrativeText}</div>` : ''}
        <h2>一、承辦人工作量統計</h2>
        <table>
          <tr><th>承辦人</th><th>進行中</th><th>已結案</th><th>逾期</th><th>平均結案天數</th><th>平均滿意度</th></tr>
          ${wData.map((r: any) => `<tr><td>${r.name}</td><td>${r.active_count}</td><td>${r.closed_count}</td><td>${r.overdue_count}</td><td>${r.avg_days || '—'}</td><td>${r.avg_satisfaction || '—'}</td></tr>`).join('')}
        </table>
        <h2>二、月份陳情趨勢</h2>
        <table>
          <tr><th>月份</th><th>${year}年件數</th><th>${(parseInt(year, 10) - 1)}年件數</th></tr>
          ${Array.from({length:12},(_,i)=>{
            const mm = String(i+1).padStart(2,'0')
            const thisY = tData.petitions_this?.find((d:any)=>d.month===mm)?.count||0
            const lastY = tData.petitions_last?.find((d:any)=>d.month===mm)?.count||0
            return `<tr><td>${i+1}月</td><td>${thisY}</td><td>${lastY}</td></tr>`
          }).join('')}
        </table>
      `
      exportToPDF(`${year}年度工作報告`, content)
    } catch { message.error('匯出失敗') }
  }

  const handleExportReport = async (narrativeText: string = '') => {
    try {
      const [workload, trend, efficiency] = await Promise.all([
        api.get(`/reports/assignee-workload?year=${year}`),
        api.get('/reports/monthly-trend'),
        api.get(`/reports/closure-efficiency?year=${year}`),
      ])
      const w = window.open('', '_blank')
      if (!w) return
      const wData = workload.data.data || []
      const tData = trend.data.data || {}
      const eData = efficiency.data.data || []
      w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${year}年度工作報告</title>
<style>
  body { font-family:'微軟正黑體',sans-serif; font-size:11pt; margin:15mm 20mm; }
  h1 { text-align:center; font-size:16pt; border-bottom:2px solid #007AFF; padding-bottom:8px; }
  h2 { font-size:13pt; color:#007AFF; margin-top:20px; }
  table { width:100%; border-collapse:collapse; margin:8px 0; }
  td,th { border:1px solid #ddd; padding:5px 8px; font-size:10pt; }
  th { background:#f0f4ff; font-weight:bold; }
  .meta { text-align:center; color:#666; font-size:10pt; margin-bottom:20px; }
  .narrative { background:#f9f9f9; border-left:4px solid #007AFF; padding:10px 14px; margin:8px 0; font-size:10.5pt; line-height:1.7; white-space:pre-wrap; }
  @media print { @page { size:A4; margin:15mm 20mm; } }
</style></head><body>
<h1>${year} 年度選民服務工作報告</h1>
<p class="meta">列印日期：${new Date().toLocaleDateString('zh-TW')}</p>
${narrativeText ? `<h2>主任綜整說明</h2><div class="narrative">${narrativeText}</div>` : ''}
<h2>一、承辦人工作量統計</h2>
<table><tr><th>承辦人</th><th>進行中</th><th>已結案</th><th>逾期</th><th>平均結案天數</th><th>平均滿意度</th></tr>
${wData.map((r: any) => `<tr><td>${r.name}</td><td>${r.active_count}</td><td>${r.closed_count}</td><td>${r.overdue_count}</td><td>${r.avg_days || '—'}</td><td>${r.avg_satisfaction || '—'}</td></tr>`).join('')}
</table>
<h2>二、月份陳情趨勢</h2>
<table><tr><th>月份</th><th>${year}年件數</th><th>${(parseInt(year, 10) - 1)}年件數</th></tr>
${Array.from({length:12},(_,i)=>{
  const mm = String(i+1).padStart(2,'0')
  const thisY = tData.petitions_this?.find((d:any)=>d.month===mm)?.count||0
  const lastY = tData.petitions_last?.find((d:any)=>d.month===mm)?.count||0
  return `<tr><td>${i+1}月</td><td>${thisY}</td><td>${lastY}</td></tr>`
}).join('')}
</table>
${eData.length > 0 ? `<h2>三、結案效率統計</h2>
<table><tr><th>類別</th><th>總件數</th><th>平均結案天數</th><th>逾期率</th></tr>
${eData.map((r: any) => `<tr><td>${r.category || '未分類'}</td><td>${r.total_count}</td><td>${r.avg_days ? r.avg_days.toFixed(1) : '—'}</td><td>${r.overdue_rate ? (r.overdue_rate * 100).toFixed(1) + '%' : '—'}</td></tr>`).join('')}
</table>` : ''}
</body></html>`)
      w.document.close()
      setTimeout(() => { w.focus(); w.print() }, 500)
    } catch { message.error('匯出失敗') }
  }

  const tabItems = [
    { key: 'home', label: '報表首頁', children: <ReportsHome onNavigate={setActiveTab} /> },
    { key: 'workload', label: '承辦人工作量', children: <AssigneeWorkload year={year} /> },
    { key: 'area', label: '選區熱點', children: <AreaHeatmap year={year} /> },
    { key: 'trend', label: '月份趨勢', children: <MonthlyTrend year={year} /> },
    { key: 'efficiency', label: '結案效率', children: <ClosureEfficiency year={year} /> },
    { key: 'satisfaction', label: '滿意度排行', children: <SatisfactionRanking year={year} /> },
    { key: 'activity', label: '選民活躍度', children: <VoterActivity /> },
    { key: 'no-contact', label: '未接觸選民', children: <NoContactVoters /> },
    { key: 'high-risk', label: '高風險案件', children: <HighRiskPetitions /> },
    { key: 'area-gap', label: '選區缺口', children: <AreaGapAnalysis /> },
    { key: 'weekly', label: '週報', children: <WeeklyReport /> },
    { key: 'type-area', label: '類型×選區', children: <TypeAreaCross year={year} /> },
    { key: 'lifecycle', label: '選民生命週期', children: <VoterLifecycleFunnel /> },
    { key: 'event-roi', label: '活動效益', children: <EventROIReport /> },
    { key: 'notif-reach', label: '通知觸及率', children: <NotificationReachRate /> },
    { key: 'issue-trend', label: '議題趨勢', children: <IssueTrendChart /> },
    { key: 'team-efficiency', label: '團隊效率', children: <TeamEfficiency /> },
    { key: 'survey-cross', label: '問卷交叉分析', children: <SurveyCrossAnalysis /> },
    { key: 'assignee-load', label: '負載指數', children: <AssigneeLoadIndex /> },
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📊 進階報表</Title>
        <Space>
          {systemAlerts.length > 0 && (
            <Alert
              type="warning"
              message={`系統預警（${systemAlerts.length} 項）`}
              description={systemAlerts.join('、')}
              showIcon
              closable
              style={{ marginBottom: 0 }}
            />
          )}
          <Button onClick={() => setNarrativeOpen(true)}>匯出月報</Button>
          <Button onClick={() => handleExportPDF(narrative)}>匯出 PDF</Button>
          <Modal title="月報匯出設定" open={narrativeOpen} onCancel={() => setNarrativeOpen(false)}
            onOk={() => { handleExportReport(narrative); setNarrativeOpen(false) }} okText="匯出" destroyOnClose>
            <Form layout="vertical">
              <Form.Item label="主任綜整說明（可留空）">
                <Input.TextArea rows={4} value={narrative} onChange={e => setNarrative(e.target.value)}
                  placeholder="例如：本月陳情量較上月增加12%，主要集中在交通類議題，已協調相關局處優先處理..." />
              </Form.Item>
            </Form>
          </Modal>
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            {years.map(y => <Option key={y} value={y}>{y}年</Option>)}
          </Select>
        </Space>
      </div>
      <Card>
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} defaultActiveKey="home" />
      </Card>
    </div>
  )
}
