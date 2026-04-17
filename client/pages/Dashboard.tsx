import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, List, Tag, Typography, Button, Space, Alert, Spin, message } from 'antd'
import {
  FileTextOutlined, TeamOutlined, CalendarOutlined, MailOutlined,
  PlusOutlined, WarningOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, ArrowRightOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import api from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const STATUS_COLORS: Record<string, string> = {
  pending: '#faad14',
  processing: '#007AFF',
  referred: '#722ed1',
  replied: '#13c2c2',
  closed: '#52c41a',
  archived: '#8c8c8c',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  referred: '已轉介',
  replied: '已回覆',
  closed: '已結案',
  archived: '已歸檔',
}

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor'

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

  const mountedRef = React.useRef(true)
  useEffect(() => {
    mountedRef.current = true
    loadDashboard()
    return () => { mountedRef.current = false }
  }, [])

  const safeSet = (setter: (v: any) => void, v: any) => { if (mountedRef.current) setter(v) }

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const year = dayjs().year().toString()

      const [petitionsRes, statsRes, schedulesRes, pendingRes, processingRes, votersRes, docsRes, overdueRes, birthdaysRes] = await Promise.all([
        api.get('/petitions?pageSize=8&page=1'),
        api.get(`/petitions/stats?year=${year}`),
        api.get(`/schedules?start=${today} 00:00:00&end=${today} 23:59:59`),
        api.get('/petitions?status=pending&pageSize=1'),
        api.get('/petitions?status=processing&pageSize=1'),
        api.get('/voters?pageSize=1'),
        api.get('/documents?status=pending&pageSize=1'),
        api.get('/petitions/overdue-count'),
        api.get('/voters/birthdays?days=7').catch(() => ({ data: { data: [] } })),
      ])

      api.get('/tasks/today').then(r => safeSet(setTodayTasks, r.data.data || [])).catch(() => {})
      api.get('/petitions/follow-ups').then(r => safeSet(setFollowUps, r.data.data || [])).catch(() => {})
      api.get('/petitions?status=pending&assignee_id=null&pageSize=10').then(r => safeSet(setUnassignedPetitions, r.data.data || [])).catch(() => {})
      api.get('/reports/high-risk-petitions').then(r => safeSet(setHighRiskPetitions, r.data.data || [])).catch(() => {})
      api.get('/admin/alerts').then(r => {
        if (r.data.success && r.data.data?.length > 0) {
          const latest = r.data.data[0]
          const detail = typeof latest.detail === 'string'
            ? (() => { try { return JSON.parse(latest.detail) } catch { return {} } })()
            : (latest.detail || {})
          if (detail.alerts?.length > 0) safeSet(setSystemAlerts, detail.alerts)
        }
      }).catch(() => {})

      if (!mountedRef.current) return
      setRecentPetitions(petitionsRes.data.data || [])
      setPetitionStats(statsRes.data.data || {})
      setTodaySchedules(schedulesRes.data.data || [])
      setBirthdayVoters(birthdaysRes.data.data || [])
      setStats({
        pending: pendingRes.data.total ?? 0,
        processing: processingRes.data.total ?? 0,
        totalVoters: votersRes.data.total ?? 0,
        pendingDocs: docsRes.data.total ?? 0,
        overdue: overdueRes.data.data?.count ?? 0,
      })
    } catch (err: any) {
      if (mountedRef.current && (err?.response?.status === 500 || err?.code === 'ERR_NETWORK')) {
        setTimeout(() => { if (mountedRef.current) loadDashboard() }, 2000)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const monthlyData = (petitionStats.byMonth || []).map((item: any) => ({
    name: MONTH_NAMES[parseInt(item.month, 10) - 1] || item.month,
    數量: item.count || 0,
  }))

  const statusData = (petitionStats.byStatus || []).map((item: any) => ({
    name: STATUS_LABELS[item.status] || item.status,
    value: item.count,
    color: STATUS_COLORS[item.status] || '#8c8c8c',
  }))

  const urgentTasks = todayTasks.filter((t: any) => t.priority === 'urgent' || t.priority === 'high')
  const totalAlerts = urgentTasks.length + followUps.length + unassignedPetitions.length + highRiskPetitions.length

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>

  return (
    <div style={{ maxWidth: 1400 }}>
      {/* 頁面標題列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {dayjs().format('YYYY年M月D日')}
            <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 12 }}>
              {dayjs().format('dddd')}
            </Text>
          </Title>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/petitions?action=new')}>
            新增陳情
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => navigate('/voters?action=new')}>
            新增選民
          </Button>
        </Space>
      </div>

      {/* 系統預警 */}
      {systemAlerts.length > 0 && (
        <Alert
          type="warning"
          message={`系統預警（${systemAlerts.length} 項）`}
          description={systemAlerts.join('、')}
          showIcon closable
          style={{ marginBottom: 12 }}
        />
      )}

      {/* 統計卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card
            hoverable
            onClick={() => navigate('/petitions?status=pending')}
            style={{ cursor: 'pointer', borderTop: stats.pending > 0 ? '3px solid #faad14' : undefined }}
          >
            <Statistic
              title="待處理陳情"
              value={stats.pending ?? 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: stats.pending > 0 ? '#faad14' : '#52c41a', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card
            hoverable
            onClick={() => navigate('/petitions?status=processing')}
            style={{ cursor: 'pointer' }}
          >
            <Statistic
              title="處理中案件"
              value={stats.processing ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#007AFF', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card
            hoverable
            style={{ cursor: 'pointer', borderTop: stats.overdue > 0 ? '3px solid #ff4d4f' : undefined }}
            onClick={() => navigate('/reports')}
          >
            <Statistic
              title="逾期陳情"
              value={stats.overdue ?? 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: stats.overdue > 0 ? '#ff4d4f' : '#52c41a', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card hoverable onClick={() => navigate('/voters')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="選民總數"
              value={stats.totalVoters ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#52c41a', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card
            hoverable
            onClick={() => navigate('/documents?status=pending')}
            style={{ cursor: 'pointer', borderTop: stats.pendingDocs > 0 ? '3px solid #722ed1' : undefined }}
          >
            <Statistic
              title="待處理公文"
              value={stats.pendingDocs ?? 0}
              prefix={<MailOutlined />}
              valueStyle={{ color: stats.pendingDocs > 0 ? '#722ed1' : '#52c41a', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card hoverable onClick={() => navigate('/tasks')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="今日待辦"
              value={todayTasks.length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: urgentTasks.length > 0 ? '#fa8c16' : '#52c41a', fontSize: 28 }}
              suffix={urgentTasks.length > 0 ? <Text type="danger" style={{ fontSize: 12 }}>{urgentTasks.length}項緊急</Text> : undefined}
            />
          </Card>
        </Col>
      </Row>

      {/* 主要內容區 */}
      <Row gutter={[12, 12]}>
        {/* 左側：今日狀況 + 最近陳情 */}
        <Col xs={24} lg={14}>
          {/* 今日注意事項 */}
          {totalAlerts > 0 && (
            <Card
              title="⚠️ 需要關注"
              size="small"
              style={{ marginBottom: 12 }}
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{totalAlerts} 項</Text>}
            >
              <Row gutter={[8, 8]}>
                {urgentTasks.length > 0 && (
                  <Col xs={24} sm={12}>
                    <div style={{ padding: '8px 12px', background: '#fff2f0', borderRadius: 6, borderLeft: '3px solid #ff4d4f' }}>
                      <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>緊急待辦 {urgentTasks.length} 項</Text>
                      {urgentTasks.slice(0, 2).map((t: any) => (
                        <div key={t.id} style={{ fontSize: 12, color: '#666', marginTop: 2 }}>· {t.title}</div>
                      ))}
                      <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => navigate('/tasks')}>
                        查看全部 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Col>
                )}
                {followUps.length > 0 && (
                  <Col xs={24} sm={12}>
                    <div style={{ padding: '8px 12px', background: '#fff7e6', borderRadius: 6, borderLeft: '3px solid #fa8c16' }}>
                      <Text strong style={{ fontSize: 12, color: '#fa8c16' }}>待回訪 {followUps.length} 件</Text>
                      {followUps.slice(0, 2).map((p: any) => (
                        <div key={p.id} style={{ fontSize: 12, color: '#666', marginTop: 2 }}>· {p.voter_name || '匿名'}</div>
                      ))}
                      <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => navigate('/petitions')}>
                        查看全部 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Col>
                )}
                {unassignedPetitions.length > 0 && (
                  <Col xs={24} sm={12}>
                    <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 6, borderLeft: '3px solid #52c41a' }}>
                      <Text strong style={{ fontSize: 12, color: '#389e0d' }}>未分派陳情 {unassignedPetitions.length} 件</Text>
                      {unassignedPetitions.slice(0, 2).map((p: any) => (
                        <div key={p.id} style={{ fontSize: 12, color: '#666', marginTop: 2 }}>· {p.case_number} {p.voter_name || ''}</div>
                      ))}
                      <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => navigate('/petitions?status=pending')}>
                        立即分派 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Col>
                )}
                {highRiskPetitions.length > 0 && (
                  <Col xs={24} sm={12}>
                    <div style={{ padding: '8px 12px', background: '#f9f0ff', borderRadius: 6, borderLeft: '3px solid #722ed1' }}>
                      <Text strong style={{ fontSize: 12, color: '#722ed1' }}>高風險案件 {highRiskPetitions.length} 件</Text>
                      {highRiskPetitions.slice(0, 2).map((p: any) => (
                        <div key={p.id} style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                          · {p.voter_name || '匿名'} <Tag color="red" style={{ fontSize: 10 }}>{p.risk_type === 'overdue' ? '逾期' : '停滯'}</Tag>
                        </div>
                      ))}
                      <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => navigate('/reports')}>
                        查看報表 <ArrowRightOutlined />
                      </Button>
                    </div>
                  </Col>
                )}
              </Row>
            </Card>
          )}

          {/* 最近陳情 */}
          <Card
            title={<><FileTextOutlined /> 最近陳情</>}
            size="small"
            extra={<Button type="link" size="small" onClick={() => navigate('/petitions')}>查看全部</Button>}
          >
            {recentPetitions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <FileTextOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
                <div style={{ color: '#999', marginTop: 8 }}>尚無陳情案件</div>
                <Button type="primary" size="small" style={{ marginTop: 12 }} onClick={() => navigate('/petitions?action=new')}>
                  建立第一筆陳情
                </Button>
              </div>
            ) : (
              <List
                dataSource={recentPetitions}
                size="small"
                renderItem={(item: any) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '8px 0' }}
                    onClick={() => navigate(`/petitions/${item.id}`)}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={4} wrap>
                          <Text style={{ fontSize: 12 }}>{item.case_number}</Text>
                          <Tag
                            color={STATUS_COLORS[item.status]}
                            style={{ fontSize: 11, lineHeight: '18px', padding: '0 5px', margin: 0 }}
                          >
                            {STATUS_LABELS[item.status]}
                          </Tag>
                          {item.urgency === 'critical' && <Tag color="red" style={{ fontSize: 11, margin: 0 }}>特急</Tag>}
                          {item.urgency === 'urgent' && <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>急件</Tag>}
                          {item.voter_name && <Text type="secondary" style={{ fontSize: 11 }}>{item.voter_name}</Text>}
                        </Space>
                      }
                      description={
                        <Text ellipsis style={{ fontSize: 12, color: '#666' }}>{item.content}</Text>
                      }
                    />
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap', marginLeft: 8 }}>
                      {dayjs(item.created_at).format('M/D')}
                    </Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        {/* 右側：行程 + 生日 + 圖表 */}
        <Col xs={24} lg={10}>
          {/* 今日行程 */}
          <Card
            title={<><CalendarOutlined /> 今日行程</>}
            size="small"
            style={{ marginBottom: 12 }}
            extra={<Button type="link" size="small" onClick={() => navigate('/schedules')}>管理行程</Button>}
          >
            {todaySchedules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#bbb' }}>
                <CalendarOutlined style={{ fontSize: 24 }} />
                <div style={{ fontSize: 12, marginTop: 6 }}>今日無行程安排</div>
              </div>
            ) : (
              <List
                dataSource={todaySchedules}
                size="small"
                renderItem={(item: any) => (
                  <List.Item style={{ padding: '6px 0' }}>
                    <Space>
                      <Tag color="blue" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>
                        {dayjs(item.start_time).format('HH:mm')}
                      </Tag>
                      <div>
                        <Text style={{ fontSize: 13 }}>{item.title}</Text>
                        {item.location && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>📍 {item.location}</Text>}
                      </div>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>

          {/* 近期生日 */}
          {birthdayVoters.length > 0 && (
            <Card
              title="🎂 近期生日（7天內）"
              size="small"
              style={{ marginBottom: 12 }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                {birthdayVoters.slice(0, 5).map((b: any) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Space size={6}>
                      <Tag color="orange" style={{ margin: 0 }}>
                        {b.days_until === 0 ? '今天' : `${b.days_until}天後`}
                      </Tag>
                      <Text
                        style={{ fontSize: 13, cursor: 'pointer' }}
                        onClick={() => navigate(`/voters/${b.id}`)}
                      >
                        {b.name}
                      </Text>
                    </Space>
                    <Button
                      size="small"
                      type="text"
                      style={{ fontSize: 11, color: '#007AFF' }}
                      onClick={() => navigate(`/voters/${b.id}`)}
                    >
                      查看
                    </Button>
                  </div>
                ))}
                {birthdayVoters.length > 5 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>…共 {birthdayVoters.length} 人</Text>
                )}
              </Space>
            </Card>
          )}

          {/* 陳情狀態分佈 */}
          <Card title="陳情狀態分佈" size="small">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                    {statusData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#bbb' }}>
                <div style={{ fontSize: 12 }}>尚無陳情資料</div>
              </div>
            )}
          </Card>
        </Col>

        {/* 全寬：年度趨勢 */}
        <Col xs={24}>
          <Card title="本年度陳情趨勢" size="small">
            {monthlyData.some((d: any) => d.數量 > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="數量" fill="#007AFF" radius={[3, 3, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bbb' }}>
                <div style={{ fontSize: 12 }}>本年度尚無陳情紀錄</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
