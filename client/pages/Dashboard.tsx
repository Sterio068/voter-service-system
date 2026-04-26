import React, { Suspense, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, List, Progress, Row, Skeleton, Space, Tag, Typography } from 'antd'
import {
  AlertOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

// Lazy-load chart-vendor (recharts, 410 KB gz) — not needed until data resolves.
const DashboardCharts = React.lazy(() => import('./dashboard/DashboardCharts'))

import { useAuthStore } from '../stores/authStore'
import PageScaffold from '../components/ui/PageScaffold'
import MetricCard from '../components/ui/MetricCard'
import ActionQueue, { type ActionQueueItem } from '../components/ui/ActionQueue'
import EmptyState from '../components/ui/EmptyState'
import { canAccessFeature, canPerformAction } from '../utils/permissions'
import { getPetitionSla } from '../utils/petitionSla'
import dayjs from 'dayjs'

const { Text } = Typography

const STATUS_COLORS: Record<string, string> = {
  pending: '#faad14',
  processing: '#007AFF',
  waiting_external: '#722ed1',
  waiting_applicant: '#13c2c2',
  referred: '#722ed1',
  replied: '#13c2c2',
  closed: '#52c41a',
  archived: '#8c8c8c',
  cancelled: '#ff4d4f',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  waiting_external: '待外部回覆',
  waiting_applicant: '待民眾補件',
  referred: '已轉介',
  replied: '已回覆',
  closed: '已結案',
  archived: '已歸檔',
  cancelled: '已取消',
}

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

function resultData(result: PromiseSettledResult<any>) {
  return result.status === 'fulfilled' ? result.value.data : null
}

function formatDateTime(value?: string) {
  return value ? dayjs(value).format('M/D HH:mm') : '未設定時間'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canAccessReports = canAccessFeature(user?.role, 'reports')
  const canAccessSettings = canAccessFeature(user?.role, 'settings')
  const canAccessCallBank = canAccessFeature(user?.role, 'callBank')
  const canCreatePetition = canPerformAction(user?.role, 'createPetition')
  const canCreateVoter = canPerformAction(user?.role, 'createVoter')

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>({})
  const [petitionStats, setPetitionStats] = useState<any>({})
  const [recentPetitions, setRecentPetitions] = useState<any[]>([])
  const [todaySchedules, setTodaySchedules] = useState<any[]>([])
  const [birthdayVoters, setBirthdayVoters] = useState<any[]>([])
  const [todayTasks, setTodayTasks] = useState<any[]>([])
  const [followUps, setFollowUps] = useState<any[]>([])
  const [unassignedPetitions, setUnassignedPetitions] = useState<any[]>([])
  const [highRiskPetitions, setHighRiskPetitions] = useState<any[]>([])
  const [systemAlerts, setSystemAlerts] = useState<string[]>([])
  const [backupStatus, setBackupStatus] = useState<any>(null)

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setLoading(true)
      const today = dayjs().format('YYYY-MM-DD')
      const year = dayjs().year().toString()

      const requests = await Promise.allSettled([
        api.get('/petitions?pageSize=8&page=1'),
        api.get(`/petitions/stats?year=${year}`),
        api.get(`/schedules?start=${today} 00:00:00&end=${today} 23:59:59`),
        api.get('/petitions?status=pending&pageSize=1'),
        api.get('/petitions?status=processing&pageSize=1'),
        api.get('/voters?pageSize=1'),
        api.get('/documents?status=pending&pageSize=1'),
        api.get('/petitions/overdue-count'),
        api.get('/voters/birthdays?days=7'),
        api.get('/tasks/today'),
        api.get('/petitions/follow-ups'),
        api.get('/petitions?status=pending&assignee_id=null&pageSize=10'),
        api.get('/reports/high-risk-petitions'),
        api.get('/admin/alerts'),
        canAccessSettings ? api.get('/admin/backup/status') : Promise.resolve({ data: null }),
      ])

      if (!mounted) return

      const [
        petitionsRes,
        statsRes,
        schedulesRes,
        pendingRes,
        processingRes,
        votersRes,
        docsRes,
        overdueRes,
        birthdaysRes,
        tasksRes,
        followUpsRes,
        unassignedRes,
        highRiskRes,
        alertsRes,
        backupRes,
      ] = requests.map(resultData)

      setRecentPetitions(petitionsRes?.data || [])
      setPetitionStats(statsRes?.data || {})
      setTodaySchedules(schedulesRes?.data || [])
      setBirthdayVoters(birthdaysRes?.data || [])
      setTodayTasks(tasksRes?.data || [])
      setFollowUps(followUpsRes?.data || [])
      setUnassignedPetitions(unassignedRes?.data || [])
      setHighRiskPetitions(highRiskRes?.data || [])
      setBackupStatus(backupRes?.data || null)
      setStats({
        pending: pendingRes?.total ?? 0,
        processing: processingRes?.total ?? 0,
        totalVoters: votersRes?.total ?? 0,
        pendingDocs: docsRes?.total ?? 0,
        overdue: overdueRes?.data?.count ?? 0,
      })

      const latestAlert = alertsRes?.data?.[0]
      const detail = typeof latestAlert?.detail === 'string'
        ? (() => { try { return JSON.parse(latestAlert.detail) } catch { return {} } })()
        : (latestAlert?.detail || {})
      setSystemAlerts(detail.alerts || [])
      setLoading(false)
    }

    loadDashboard()
    return () => { mounted = false }
  }, [canAccessSettings])

  const monthlyData = useMemo(() => (petitionStats.byMonth || []).map((item: any) => ({
    name: MONTH_NAMES[parseInt(item.month, 10) - 1] || item.month,
    數量: item.count || 0,
  })), [petitionStats.byMonth])

  const statusData = useMemo(() => (petitionStats.byStatus || []).map((item: any) => ({
    name: STATUS_LABELS[item.status] || item.status,
    value: item.count,
    color: STATUS_COLORS[item.status] || '#8c8c8c',
  })), [petitionStats.byStatus])

  const urgentTasks = todayTasks.filter((task: any) => task.priority === 'urgent' || task.priority === 'high')
  const totalActionCount = urgentTasks.length + followUps.length + unassignedPetitions.length + highRiskPetitions.length + (stats.overdue || 0)
  const completedToday = todayTasks.filter((task: any) => task.status === 'done' || task.status === 'completed').length
  const taskProgress = todayTasks.length > 0 ? Math.round((completedToday / todayTasks.length) * 100) : 0

  const focusItems: ActionQueueItem[] = [
    ...highRiskPetitions.slice(0, 3).map((petition: any) => ({
      key: `risk-${petition.id}`,
      title: petition.case_number || petition.voter_name || `案件 #${petition.id}`,
      description: petition.content || petition.voter_name || '高風險陳情需主管確認',
      meta: petition.risk_type === 'overdue' ? '逾期案件' : '停滯案件',
      tag: '高風險',
      tone: 'red' as const,
      onClick: () => navigate(petition.id ? `/petitions/${petition.id}` : (canAccessReports ? '/reports' : '/petitions')),
    })),
    ...unassignedPetitions.slice(0, 3).map((petition: any) => ({
      key: `unassigned-${petition.id}`,
      title: petition.case_number || `案件 #${petition.id}`,
      description: petition.voter_name ? `${petition.voter_name}：${petition.content || ''}` : petition.content || '尚未分派承辦人',
      meta: formatDateTime(petition.created_at),
      tag: '待分派',
      tone: 'amber' as const,
      onClick: () => navigate(`/petitions/${petition.id}`),
    })),
    ...urgentTasks.slice(0, 3).map((task: any) => ({
      key: `task-${task.id}`,
      title: task.title,
      description: task.description || task.voter_name || '今日待辦需要處理',
      meta: task.due_date ? `截止：${task.due_date}` : '未設定截止日',
      tag: task.priority === 'urgent' ? '緊急待辦' : '高優先',
      tone: task.priority === 'urgent' ? 'red' as const : 'amber' as const,
      onClick: () => navigate('/tasks?focus=today'),
    })),
    ...followUps.slice(0, 3).map((petition: any) => ({
      key: `follow-${petition.id}`,
      title: petition.voter_name || petition.case_number || `案件 #${petition.id}`,
      description: petition.content || '需要回訪或補充追蹤',
      meta: petition.case_number,
      tag: '待回訪',
      tone: 'blue' as const,
      onClick: () => navigate(petition.id ? `/petitions/${petition.id}` : '/petitions'),
    })),
  ]

  const scheduleItems: ActionQueueItem[] = todaySchedules.map((schedule: any) => ({
    key: schedule.id,
    title: schedule.title,
    description: schedule.location || schedule.note || '今日行程',
    meta: `${dayjs(schedule.start_time).format('HH:mm')}${schedule.end_time ? ` - ${dayjs(schedule.end_time).format('HH:mm')}` : ''}`,
    tag: schedule.schedule_type || '行程',
    tone: 'green' as const,
    onClick: () => navigate('/schedules'),
  }))

  const petitionItems: ActionQueueItem[] = recentPetitions.map((petition: any) => {
    const sla = getPetitionSla(petition.created_at, petition.status)
    // SLA 的 tone 比 urgency 更直觀：closed → slate；overdue → red；critical → amber；warning → amber；fresh → slate
    const slaTone = sla.level === 'overdue' ? 'red' as const
      : sla.level === 'critical' ? 'amber' as const
      : sla.level === 'warning' ? 'amber' as const
      : sla.level === 'closed' ? 'slate' as const
      : (petition.urgency === 'critical' ? 'red' as const : petition.urgency === 'urgent' ? 'amber' as const : 'slate' as const)
    const slaSuffix = sla.level === 'overdue' || sla.level === 'critical'
      ? ` · ${sla.label}` : ''
    return {
      key: petition.id,
      title: petition.case_number || `案件 #${petition.id}`,
      description: petition.content,
      meta: `${petition.voter_name || '匿名'} · ${formatDateTime(petition.created_at)}${slaSuffix}`,
      tag: STATUS_LABELS[petition.status] || petition.status,
      tone: slaTone,
      onClick: () => navigate(`/petitions/${petition.id}`),
    }
  })

  const healthItems: ActionQueueItem[] = [
    ...systemAlerts.map((alert, index) => ({
      key: `alert-${index}`,
      title: alert,
      description: '系統偵測到需要管理員確認的警示',
      tag: '系統警示',
      tone: 'amber' as const,
      onClick: () => navigate(canAccessReports ? '/reports' : '/petitions'),
    })),
    ...(backupStatus?.last_error ? [{
      key: 'backup-error',
      title: '最近一次自動備份失敗',
      description: backupStatus.last_error,
      meta: backupStatus.last_error_at ? dayjs(backupStatus.last_error_at).format('YYYY-MM-DD HH:mm') : undefined,
      tag: '備份',
      tone: 'red' as const,
      onClick: () => navigate('/admin/settings'),
    }] : []),
  ]

  const quickActions = [
    ...(canCreatePetition ? [
      <Button key="create-petition" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/petitions?action=new')}>
        新增陳情
      </Button>,
    ] : []),
    ...(canCreateVoter ? [
      <Button key="create-voter" icon={<PlusOutlined />} onClick={() => navigate('/voters?action=new')}>
        新增選民
      </Button>,
    ] : []),
    ...(canAccessCallBank ? [
      <Button key="call-bank" icon={<PhoneOutlined />} onClick={() => navigate('/voters/call-bank')}>
        電話拜訪
      </Button>,
    ] : []),
  ]

  if (loading) {
    return (
      <PageScaffold
        eyebrow="Today Command Center"
        title={`${dayjs().format('M月D日')} ${dayjs().format('dddd')}工作台`}
        description="把待分派、逾期、回訪、行程與系統健康集中在同一個入口，讓服務處一開工就能判斷今天先處理什麼。"
      >
        <div role="status" aria-live="polite" aria-label="工作台資料載入中">
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Col key={i} xs={12} md={8} xl={4}>
                <Card className="vss-metric-card">
                  <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 2, width: ['40%', '70%'] }} />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[12, 12]}>
            <Col xs={24} xl={14}>
              <Card>
                <Skeleton active title={{ width: '30%' }} paragraph={{ rows: 5 }} />
              </Card>
            </Col>
            <Col xs={24} xl={10}>
              <Card>
                <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 4 }} />
              </Card>
            </Col>
            <Col xs={24} lg={12} xl={8}>
              <Card>
                <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 4 }} />
              </Card>
            </Col>
            <Col xs={24} lg={12} xl={8}>
              <Card>
                <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 4 }} />
              </Card>
            </Col>
            <Col xs={24} lg={12} xl={8}>
              <Card>
                <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 4 }} />
              </Card>
            </Col>
          </Row>
        </div>
      </PageScaffold>
    )
  }

  return (
    <PageScaffold
      eyebrow="Today Command Center"
      title={`${dayjs().format('M月D日')} ${dayjs().format('dddd')}工作台`}
      description="把待分派、逾期、回訪、行程與系統健康集中在同一個入口，讓服務處一開工就能判斷今天先處理什麼。"
      actions={quickActions.length > 0 ? quickActions : undefined}
    >
      {systemAlerts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 14 }}
          message={`系統預警（${systemAlerts.length} 項）`}
          description={systemAlerts.join('、')}
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="待處理陳情"
            value={stats.pending ?? 0}
            helper="需要受理或分派"
            icon={<WarningOutlined />}
            tone={(stats.pending ?? 0) > 0 ? 'amber' : 'green'}
            onClick={() => navigate('/petitions?status=pending')}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="逾期陳情"
            value={stats.overdue ?? 0}
            helper="優先追蹤與回報"
            icon={<ExclamationCircleOutlined />}
            tone={(stats.overdue ?? 0) > 0 ? 'red' : 'green'}
            onClick={() => navigate(canAccessReports ? '/reports' : '/petitions')}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="今日待辦"
            value={todayTasks.length}
            helper={urgentTasks.length > 0 ? `${urgentTasks.length} 項高優先` : '目前節奏正常'}
            icon={<CheckCircleOutlined />}
            tone={urgentTasks.length > 0 ? 'amber' : 'blue'}
            onClick={() => navigate('/tasks?focus=today')}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="今日行程"
            value={todaySchedules.length}
            helper="含跨日行程"
            icon={<CalendarOutlined />}
            tone="purple"
            onClick={() => navigate('/schedules')}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="選民總數"
            value={stats.totalVoters ?? 0}
            helper="選民資料庫"
            icon={<TeamOutlined />}
            tone="green"
            onClick={() => navigate('/voters')}
          />
        </Col>
        <Col xs={12} md={8} xl={4}>
          <MetricCard
            label="待處理公文"
            value={stats.pendingDocs ?? 0}
            helper="需簽辦或歸檔"
            icon={<MailOutlined />}
            tone={(stats.pendingDocs ?? 0) > 0 ? 'purple' : 'slate'}
            onClick={() => navigate('/documents?status=pending')}
          />
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={14}>
          <ActionQueue
            title="今日焦點"
            subtitle={`${totalActionCount} 個訊號需要判斷優先序`}
            items={focusItems}
            emptyText="今天沒有高風險、待分派或緊急項目"
            emptyDescription="可以從回訪追蹤或資料整理開始建立今天的節奏。"
            emptyAction={canCreatePetition ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/petitions?action=new')}>
                新增第一筆陳情
              </Button>
            ) : undefined}
            extra={<Button type="link" onClick={() => navigate('/petitions')}>案件列表</Button>}
            limit={8}
          />
        </Col>
        <Col xs={24} xl={10}>
          <Card title="今日完成節奏" className="vss-action-queue">
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>待辦完成度</Text>
                  <Text type="secondary">{completedToday}/{todayTasks.length}</Text>
                </Space>
                <Progress percent={taskProgress} status={taskProgress === 100 && todayTasks.length > 0 ? 'success' : 'active'} />
              </div>
              <Row gutter={10}>
                <Col span={12}>
                  <Card size="small">
                    <Text type="secondary">待回訪</Text>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{followUps.length}</div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card size="small">
                    <Text type="secondary">未分派</Text>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{unassignedPetitions.length}</div>
                  </Card>
                </Col>
              </Row>
              <Button block icon={<ArrowRightOutlined />} onClick={() => navigate('/tasks?focus=today')}>
                前往今日待辦
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12} xl={8}>
          <ActionQueue
            title={<><CalendarOutlined /> 今日行程</>}
            subtitle="行程、諮詢與服務安排"
            items={scheduleItems}
            emptyText="今日尚無行程安排"
            emptyDescription="把選民拜訪、會議或活動加入行事曆，與團隊同步今天的去向。"
            emptyAction={(
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/schedules?action=new')}>
                新增今日行程
              </Button>
            )}
            extra={<Button type="link" onClick={() => navigate('/schedules')}>管理</Button>}
          />
        </Col>
        <Col xs={24} lg={12} xl={8}>
          <ActionQueue
            title={<><FileTextOutlined /> 最近陳情</>}
            subtitle="最新進件與狀態"
            items={petitionItems}
            emptyText="尚無陳情案件"
            emptyDescription="收到第一筆民眾陳情後會即時呈現於此。"
            emptyAction={canCreatePetition ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/petitions?action=new')}>
                建立首筆陳情
              </Button>
            ) : undefined}
            extra={<Button type="link" onClick={() => navigate('/petitions')}>查看全部</Button>}
          />
        </Col>
        <Col xs={24} lg={12} xl={8}>
          <Card title={<><SafetyCertificateOutlined /> 服務健康</>} className="vss-action-queue">
            {healthItems.length > 0 ? (
              <List
                dataSource={healthItems}
                renderItem={(item) => (
                  <List.Item className="vss-action-item vss-clickable" onClick={item.onClick}>
                    <Space direction="vertical" size={2}>
                      <Tag color={item.tone === 'red' ? 'red' : 'orange'}>{item.tag}</Tag>
                      <Text strong>{item.title}</Text>
                      {item.description && <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>}
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <EmptyState variant="compact" title="目前沒有系統警示" description="系統健康狀態正常，仍可進入後台查看備份與資料品質。" />
                {canAccessSettings && (
                  <Button block icon={<DatabaseOutlined />} onClick={() => navigate('/admin/settings')}>
                    查看備份與資料品質
                  </Button>
                )}
              </Space>
            )}
          </Card>
        </Col>

        {birthdayVoters.length > 0 && (
          <Col xs={24} lg={12}>
            <Card title="近期生日關懷">
              <List
                dataSource={birthdayVoters.slice(0, 6)}
                renderItem={(voter: any) => (
                  <List.Item className="vss-action-item vss-clickable" onClick={() => navigate(`/voters/${voter.id}`)}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <Tag color="orange">{voter.days_until === 0 ? '今天' : `${voter.days_until} 天後`}</Tag>
                        <Text strong>{voter.name}</Text>
                      </Space>
                      <Button type="text" size="small" icon={<ArrowRightOutlined />} />
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        )}

        <Suspense fallback={null}>
          <DashboardCharts
            statusData={statusData}
            monthlyData={monthlyData}
            birthdaySpan={birthdayVoters.length > 0 ? 12 : 24}
          />
        </Suspense>
      </Row>
    </PageScaffold>
  )
}
