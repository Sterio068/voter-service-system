import React, { Suspense, useState, useEffect } from 'react'
import { Card, Tabs, Select, Button, Alert, Modal, Form, Input, message, Row, Col, Spin, Dropdown } from 'antd'
import { FileTextOutlined, AlertOutlined, CheckCircleOutlined, ClockCircleOutlined, DownOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import { useThemeStore } from '../../stores/themeStore'
import { usePersistedState, exportToPDF } from './utils'
import PageScaffold from '../../components/ui/PageScaffold'
import MetricCard from '../../components/ui/MetricCard'
import { useAuthStore } from '../../stores/authStore'
import { hasModulePermission } from '../../utils/permissions'

// Lazy-load each report tab — they all pull recharts (chart-vendor).
// They only load when the user clicks into that tab.
const ReportsHome = React.lazy(() => import('./components/ReportsHome'))
const AssigneeWorkload = React.lazy(() => import('./components/AssigneeWorkload'))
const AreaHeatmap = React.lazy(() => import('./components/AreaHeatmap'))
const MonthlyTrend = React.lazy(() => import('./components/MonthlyTrend'))
const ClosureEfficiency = React.lazy(() => import('./components/ClosureEfficiency'))
const SatisfactionRanking = React.lazy(() => import('./components/SatisfactionRanking'))
const VoterActivity = React.lazy(() => import('./components/VoterActivity'))
const NoContactVoters = React.lazy(() => import('./components/NoContactVoters'))
const HighRiskPetitions = React.lazy(() => import('./components/HighRiskPetitions'))
const AreaGapAnalysis = React.lazy(() => import('./components/AreaGapAnalysis'))
const WeeklyReport = React.lazy(() => import('./components/WeeklyReport'))
const TypeAreaCross = React.lazy(() => import('./components/TypeAreaCross'))
const VoterLifecycleFunnel = React.lazy(() => import('./components/VoterLifecycleFunnel'))
const EventROIReport = React.lazy(() => import('./components/EventROIReport'))
const NotificationReachRate = React.lazy(() => import('./components/NotificationReachRate'))
const IssueTrendChart = React.lazy(() => import('./components/IssueTrendChart'))
const TeamEfficiency = React.lazy(() => import('./components/TeamEfficiency'))
const SurveyCrossAnalysis = React.lazy(() => import('./components/SurveyCrossAnalysis'))
const AssigneeLoadIndex = React.lazy(() => import('./components/AssigneeLoadIndex'))

function TabFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spin size="large" />
    </div>
  )
}

const { Option } = Select

export default function ReportsPage() {
  const currentYear = new Date().getFullYear().toString()
  const { user } = useAuthStore()
  const canExportReports = hasModulePermission(user?.role, 'reports', 'export')
  const navigate = useNavigate()
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

  // 報表 headline metrics：年度案件總量、結案率、逾期、滿意度
  const [reportHeadline, setReportHeadline] = useState<any>(null)

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

  useEffect(() => {
    Promise.allSettled([
      api.get(`/petitions/stats?year=${year}`),
      api.get('/petitions/overdue-count'),
      api.get('/petitions/satisfaction-stats'),
    ]).then(results => {
      const [statsR, overdueR, satR] = results.map(r => r.status === 'fulfilled' ? r.value.data : null)
      const byStatus = statsR?.data?.byStatus || []
      const totalCases = byStatus.reduce((s: number, b: any) => s + (b.count || 0), 0)
      const closed = byStatus
        .filter((b: any) => b.status === 'closed' || b.status === 'replied')
        .reduce((s: number, b: any) => s + (b.count || 0), 0)
      setReportHeadline({
        totalCases,
        closed,
        closeRate: totalCases > 0 ? Math.round((closed / totalCases) * 100) : 0,
        overdue: overdueR?.data?.count ?? 0,
        avgRating: satR?.data?.avg_rating ?? null,
        collectionRate: satR?.data?.collection_rate ?? null,
      })
    })
  }, [year])

  // 伺服器產出 PDF（月報）— 呼叫後端 /api/reports/monthly?format=pdf，由 pdfmake 產生具 CJK 字型的真 PDF。
  const handleExportMonthlyServerPdf = async () => {
    try {
      const now = new Date()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const res = await api.get(`/reports/monthly`, {
        params: { year, month: m, format: 'pdf' },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `陳情月報_${year}${m}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      message.error(err.response?.data?.error || 'PDF 匯出失敗')
    }
  }

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

  function wrap(el: React.ReactNode) {
    return <Suspense fallback={<TabFallback />}>{el}</Suspense>
  }

  const tabItems = [
    { key: 'home', label: '報表首頁', children: wrap(<ReportsHome onNavigate={setActiveTab} />) },
    { key: 'workload', label: '承辦人工作量', children: wrap(<AssigneeWorkload year={year} />) },
    { key: 'area', label: '選區熱點', children: wrap(<AreaHeatmap year={year} />) },
    { key: 'trend', label: '月份趨勢', children: wrap(<MonthlyTrend year={year} />) },
    { key: 'efficiency', label: '結案效率', children: wrap(<ClosureEfficiency year={year} />) },
    { key: 'satisfaction', label: '滿意度排行', children: wrap(<SatisfactionRanking year={year} />) },
    { key: 'activity', label: '選民活躍度', children: wrap(<VoterActivity />) },
    { key: 'no-contact', label: '未接觸選民', children: wrap(<NoContactVoters />) },
    { key: 'high-risk', label: '高風險案件', children: wrap(<HighRiskPetitions />) },
    { key: 'area-gap', label: '選區缺口', children: wrap(<AreaGapAnalysis />) },
    { key: 'weekly', label: '週報', children: wrap(<WeeklyReport />) },
    { key: 'type-area', label: '類型×選區', children: wrap(<TypeAreaCross year={year} />) },
    { key: 'lifecycle', label: '選民生命週期', children: wrap(<VoterLifecycleFunnel />) },
    { key: 'event-roi', label: '活動效益', children: wrap(<EventROIReport />) },
    { key: 'notif-reach', label: '通知觸及率', children: wrap(<NotificationReachRate />) },
    { key: 'issue-trend', label: '議題趨勢', children: wrap(<IssueTrendChart />) },
    { key: 'team-efficiency', label: '團隊效率', children: wrap(<TeamEfficiency />) },
    { key: 'survey-cross', label: '問卷交叉分析', children: wrap(<SurveyCrossAnalysis />) },
    { key: 'assignee-load', label: '負載指數', children: wrap(<AssigneeLoadIndex />) },
  ]

  return (
    <PageScaffold
      eyebrow="Decision Analytics"
      title="進階報表"
      titleLevel={4}
      variant="compact"
      description="集中查看服務量能、選區缺口、案件風險與月報輸出。"
      actions={
        <>
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
          {canExportReports && (
            <>
              <Button onClick={() => setNarrativeOpen(true)}>匯出月報</Button>
              <Dropdown
                menu={{
                  items: [
                    { key: 'monthly-pdf', label: '伺服器產出 PDF（月報）', onClick: handleExportMonthlyServerPdf },
                    { key: 'browser-pdf', label: '瀏覽器列印 PDF（年度概要）', onClick: () => handleExportPDF(narrative) },
                  ],
                }}
              >
                <Button>匯出 PDF <DownOutlined /></Button>
              </Dropdown>
              <Modal
                title="月報匯出設定"
                open={narrativeOpen}
                onCancel={() => setNarrativeOpen(false)}
                onOk={() => { handleExportReport(narrative); setNarrativeOpen(false) }}
                okText="確認匯出月報"
                cancelText="取消"
                destroyOnClose
              >
                <Form layout="vertical">
                  <Form.Item label="主任綜整說明（可留空）">
                    <Input.TextArea rows={4} value={narrative} onChange={e => setNarrative(e.target.value)}
                      placeholder="例如：本月陳情量較上月增加12%，主要集中在交通類議題，已協調相關局處優先處理..." />
                  </Form.Item>
                </Form>
              </Modal>
            </>
          )}
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            {years.map(y => <Option key={y} value={y}>{y}年</Option>)}
          </Select>
        </>
      }
    >
      {/* 年度 headline metrics — 推到報表頁，讓主管一眼看清今年量能 */}
      {reportHeadline && (
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label={`${year} 年陳情總量`}
              value={reportHeadline.totalCases}
              helper={`已結 ${reportHeadline.closed} 件`}
              icon={<FileTextOutlined />}
              tone="blue"
              onClick={() => navigate('/petitions')}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="結案率"
              value={`${reportHeadline.closeRate}%`}
              helper={reportHeadline.closeRate >= 80 ? '達標' : reportHeadline.closeRate >= 60 ? '可改進' : '需關注'}
              icon={<CheckCircleOutlined />}
              tone={reportHeadline.closeRate >= 80 ? 'green' : reportHeadline.closeRate >= 60 ? 'amber' : 'red'}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="逾期案件"
              value={reportHeadline.overdue}
              helper={reportHeadline.overdue > 0 ? '需立即處理' : '無逾期'}
              icon={<AlertOutlined />}
              tone={reportHeadline.overdue > 0 ? 'red' : 'green'}
              onClick={() => navigate('/petitions?status=overdue')}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <MetricCard
              label="滿意度回收率"
              value={reportHeadline.collectionRate != null ? `${reportHeadline.collectionRate}%` : '—'}
              helper={reportHeadline.avgRating != null ? `平均 ${reportHeadline.avgRating} / 5` : '尚無評分'}
              icon={<ClockCircleOutlined />}
              tone={(reportHeadline.collectionRate ?? 0) >= 50 ? 'green' : 'amber'}
            />
          </Col>
        </Row>
      )}
      <Card>
        <Tabs items={tabItems} activeKey={activeTab} onChange={setActiveTab} defaultActiveKey="home" />
      </Card>
    </PageScaffold>
  )
}
