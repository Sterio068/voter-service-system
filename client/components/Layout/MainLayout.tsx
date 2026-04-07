import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Dropdown, Avatar, Typography, Badge, Space, Button, Tooltip, Modal, Table, Drawer } from 'antd'
import {
  DashboardOutlined, TeamOutlined, FileTextOutlined, MailOutlined,
  CalendarOutlined, SettingOutlined, UserOutlined, LogoutOutlined,
  BellOutlined, AuditOutlined, TagsOutlined, AppstoreOutlined,
  BarChartOutlined, SunOutlined, MoonOutlined, CheckSquareOutlined,
  QuestionOutlined, SwapOutlined, GroupOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  MenuOutlined, CloseOutlined, BookOutlined, GiftOutlined, ShopOutlined, DollarOutlined, ProfileOutlined
} from '@ant-design/icons'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import FirstRunWizard from '../FirstRunWizard'
import ScheduleReminder from '../ScheduleReminder'
import GlobalSearch from '../GlobalSearch'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import api from '../../utils/api'
import type { MenuProps } from 'antd'

const { Header, Sider, Content, Footer } = Layout
const { Text } = Typography

const ROLE_LABELS: Record<string, string> = {
  admin: '管理員',
  supervisor: '主管',
  assistant: '助理',
  volunteer: '志工',
}

// ─── macOS-style nav item ───────────────────────────────────
interface NavItemProps {
  icon: React.ReactNode
  label: string
  path: string
  collapsed?: boolean
  badge?: number
}

function NavItem({ icon, label, path, collapsed, badge }: NavItemProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path + '/') &&
     !/^[a-zA-Z]/.test(location.pathname.slice(path.length + 1)))

  return (
    <Tooltip title={collapsed ? label : ''} placement="right">
      <div
        className={`mac-nav-item${isActive ? ' active' : ''}`}
        onClick={() => navigate(path)}
        style={collapsed ? { justifyContent: 'center', padding: '0 6px' } : {}}
      >
        <span className="mac-nav-icon">{icon}</span>
        {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
        {!collapsed && badge != null && badge > 0 && (
          <span style={{
            background: '#ff3b30', color: '#fff', fontSize: 10, fontWeight: 600,
            borderRadius: 10, minWidth: 16, height: 16, lineHeight: '16px',
            textAlign: 'center', padding: '0 4px',
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </div>
    </Tooltip>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) return <div style={{ height: 12 }} />
  return <div className="mac-section-label">{label}</div>
}

// ─── Main component ─────────────────────────────────────────
export default function MainLayout() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { isDark, toggle: toggleTheme } = useThemeStore()
  const [collapsed, setCollapsed] = useState(false)
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [officeName, setOfficeName] = useState('服務處')
  const [pendingCount, setPendingCount] = useState(0)
  const [showWizard, setShowWizard] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimeoutMinutesRef = React.useRef<number>(30)

  const shortcutList = [
    { key: 'Ctrl + N', description: '新增陳情' },
    { key: 'Ctrl + V', description: '新增選民' },
    { key: 'Ctrl + T', description: '新增待辦' },
    { key: 'Ctrl + Shift + D', description: '今日待辦' },
    { key: 'Ctrl + B', description: '今日行程' },
    { key: 'Ctrl + K', description: '全站搜尋' },
    { key: '?', description: '快捷鍵說明' },
  ]

  useKeyboardShortcuts([
    { key: 'n', ctrl: true, description: '新增陳情', action: () => navigate('/petitions?action=new') },
    { key: 'v', ctrl: true, description: '新增選民', action: () => navigate('/voters?action=new') },
    { key: 't', ctrl: true, description: '新增待辦', action: () => navigate('/tasks?action=new') },
    { key: 'd', ctrl: true, shift: true, description: '今日待辦', action: () => navigate('/tasks?focus=today') },
    { key: 'b', ctrl: true, description: '今日行程', action: () => navigate('/schedules') },
    { key: '?', ctrl: false, description: '快捷鍵說明', action: () => setShortcutHelpOpen(true) },
  ])

  const resetIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => { logout(); navigate('/login') },
      idleTimeoutMinutesRef.current * 60 * 1000)
  }, [logout, navigate])

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    const handler = () => resetIdleTimer()
    events.forEach(e => window.addEventListener(e, handler, { passive: true }))
    resetIdleTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, handler))
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [resetIdleTimer])

  useEffect(() => {
    Promise.all([
      api.get('/admin/settings').catch(() => null),
      api.get('/petitions?status=pending&pageSize=1').catch(() => null),
    ]).then(([settingsRes, petitionsRes]) => {
      if (settingsRes) {
        const s = settingsRes.data.data || {}
        if (s.office_name) setOfficeName(s.office_name)
        if (s.first_run === 'true') setShowWizard(true)
        if (s.idle_timeout) {
          idleTimeoutMinutesRef.current = Math.max(5, parseInt(s.idle_timeout) || 30)
          resetIdleTimer()
        }
      }
      if (petitionsRes) {
        setPendingCount(petitionsRes.data.total || 0)
      }
    })
  }, [])

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    logout()
    navigate('/login')
  }

  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor'

  const sidebarBg = isDark
    ? 'rgba(28,28,30,0.92)'
    : 'rgba(246,246,246,0.88)'
  const sidebarBorder = isDark
    ? '1px solid rgba(255,255,255,0.07)'
    : '1px solid rgba(0,0,0,0.09)'
  const headerBg = isDark ? 'rgba(30,30,32,0.95)' : 'rgba(255,255,255,0.9)'
  const headerBorder = isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)'

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '登出',
      danger: true,
      onClick: handleLogout,
    },
  ]

  const navItems = (
    <>
      <NavItem icon={<DashboardOutlined />} label="儀表板" path="/" collapsed={collapsed} />
      <SectionLabel label="陳情" collapsed={collapsed} />
      <NavItem icon={<FileTextOutlined />} label="案件列表" path="/petitions" collapsed={collapsed} badge={pendingCount} />
      <NavItem icon={<BarChartOutlined />} label="統計報表" path="/petitions/stats" collapsed={collapsed} />
      <SectionLabel label="選民" collapsed={collapsed} />
      <NavItem icon={<TeamOutlined />} label="選民資料" path="/voters" collapsed={collapsed} />
      <NavItem icon={<GroupOutlined />} label="團體管理" path="/groups" collapsed={collapsed} />
      <SectionLabel label="日常" collapsed={collapsed} />
      <NavItem icon={<MailOutlined />} label="公文管理" path="/documents" collapsed={collapsed} />
      <NavItem icon={<CalendarOutlined />} label="行程管理" path="/schedules" collapsed={collapsed} />
      <NavItem icon={<GiftOutlined />} label="禮儀記錄" path="/ceremonies" collapsed={collapsed} />
      <NavItem icon={<ShopOutlined />} label="廠商管理" path="/vendors" collapsed={collapsed} />
      <NavItem icon={<DollarOutlined />} label="收支統計" path="/expenses" collapsed={collapsed} />
      <NavItem icon={<ProfileOutlined />} label="提案追蹤" path="/proposals" collapsed={collapsed} />
      <NavItem icon={<CheckSquareOutlined />} label="待辦事項" path="/tasks" collapsed={collapsed} />
      {isAdminOrSupervisor && (
        <>
          <SectionLabel label="管理" collapsed={collapsed} />
          <NavItem icon={<BarChartOutlined />} label="進階報表" path="/reports" collapsed={collapsed} />
          {user?.role === 'admin' && <NavItem icon={<UserOutlined />} label="帳號維護" path="/admin/users" collapsed={collapsed} />}
          {user?.role === 'admin' && <NavItem icon={<AuditOutlined />} label="操作紀錄" path="/admin/audit-logs" collapsed={collapsed} />}
          <NavItem icon={<TagsOutlined />} label="類別管理" path="/admin/categories" collapsed={collapsed} />
          <NavItem icon={<AppstoreOutlined />} label="系統設定" path="/admin/settings" collapsed={collapsed} />
          <NavItem icon={<SwapOutlined />} label="員工交接" path="/admin/handover" collapsed={collapsed} />
        </>
      )}
      <SectionLabel label="說明" collapsed={collapsed} />
      <NavItem icon={<BookOutlined />} label="使用說明" path="/help" collapsed={collapsed} />
    </>
  )

  if (isMobile) {
    return (
      <>
      <Layout style={{ minHeight: '100vh', background: isDark ? '#18191c' : '#f5f5f7', flexDirection: 'column' }}>
        {/* Mobile Header */}
        <Header style={{
          background: headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderBottom: headerBorder, padding: '0 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 52, position: 'sticky', top: 0, zIndex: 99,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg,#007AFF,#5ac8fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>服</div>
            <Text style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#f5f5f7' : '#1d1d1f' }}>{officeName}</Text>
          </div>
          <Space size={4}>
            <Badge count={pendingCount} overflowCount={99} size="small">
              <Button type="text" icon={<BellOutlined style={{ fontSize: 15 }} />}
                onClick={() => navigate('/petitions?status=pending')} style={{ borderRadius: 8 }} />
            </Badge>
            <Button type="text" icon={<MenuOutlined style={{ fontSize: 16 }} />}
              onClick={() => setMobileMenuOpen(true)} style={{ borderRadius: 8 }} />
          </Space>
        </Header>

        {/* Content */}
        <Content style={{
          padding: '12px 10px',
          paddingBottom: 70,
          overflow: 'auto',
          flex: 1,
          background: isDark ? '#18191c' : '#f5f5f7',
        }}>
          <Outlet />
        </Content>

        {/* Bottom nav bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
          background: headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderTop: headerBorder, display: 'flex', alignItems: 'stretch',
          zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {[
            { path: '/', icon: <DashboardOutlined />, label: '儀表板' },
            { path: '/petitions', icon: <FileTextOutlined />, label: '陳情', badge: pendingCount },
            { path: '/voters', icon: <TeamOutlined />, label: '選民' },
            { path: '/schedules', icon: <CalendarOutlined />, label: '行程' },
            { path: '/tasks', icon: <CheckSquareOutlined />, label: '待辦' },
          ].map(item => {
            const location = window.location
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <div key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: isActive ? '#007AFF' : (isDark ? '#8e8e93' : '#6c6c70'),
                  gap: 2, fontSize: 10, fontWeight: isActive ? 600 : 400,
                  position: 'relative',
                }}>
                <Badge count={item.badge} overflowCount={99} size="small" offset={[6, -2]}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                </Badge>
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>
      </Layout>

      {/* Mobile full menu drawer */}
      <Drawer
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#007AFF,#5ac8fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>服</div>
          <span>{officeName}</span>
        </div>}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="left"
        width={240}
        styles={{ body: { padding: '8px 0', background: isDark ? 'rgba(28,28,30,0.98)' : '#fff' }, header: { background: isDark ? 'rgba(28,28,30,0.98)' : '#fff' } }}
        extra={
          <Space>
            <Button type="text" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <Avatar icon={<UserOutlined />} size={28} style={{ background: 'linear-gradient(135deg,#007AFF,#5ac8fa)', cursor: 'pointer' }} />
            </Dropdown>
          </Space>
        }
      >
        <div onClick={() => setMobileMenuOpen(false)}>
          {navItems}
        </div>
      </Drawer>

      <FirstRunWizard open={showWizard} onFinish={() => { setShowWizard(false); api.get('/admin/settings').then(r => { if (r.data.data?.office_name) setOfficeName(r.data.data.office_name) }).catch(() => {}) }} />
      <ScheduleReminder />
      </>
    )
  }

  return (
    <>
    <Layout style={{ minHeight: '100vh', background: isDark ? '#18191c' : '#f5f5f7', display: 'flex', flexDirection: 'row' }}>

      {/* ── macOS Sidebar ── */}
      <div style={{
        width: collapsed ? 56 : 210,
        minWidth: collapsed ? 56 : 210,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        background: sidebarBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRight: sidebarBorder,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        zIndex: 100,
      }}>
        {/* Sidebar header — office name */}
        <div style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 0 0 14px' : '0 14px',
          borderBottom: sidebarBorder,
          flexShrink: 0,
        }}>
          {collapsed ? (
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg,#007AFF,#5ac8fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 13,
            }}>服</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: 'linear-gradient(135deg,#007AFF,#5ac8fa)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 13,
              }}>服</div>
              <Text style={{
                fontSize: 13, fontWeight: 600,
                color: isDark ? '#f5f5f7' : '#1d1d1f',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{officeName}</Text>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, paddingBottom: 12 }}>
          {navItems}
        </div>

        {/* Sidebar footer — collapse toggle */}
        <div style={{
          borderTop: sidebarBorder,
          padding: '8px 6px',
          flexShrink: 0,
        }}>
          <div
            className="mac-nav-item"
            onClick={() => setCollapsed(c => !c)}
            style={collapsed ? { justifyContent: 'center', padding: '0 6px' } : {}}
          >
            <span className="mac-nav-icon" style={{ opacity: 0.5 }}>
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            {!collapsed && <Text style={{ fontSize: 12, color: '#8e8e93' }}>收合</Text>}
          </div>
        </div>
      </div>

      {/* ── Right side ── */}
      <Layout style={{ background: 'transparent', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Header style={{
          background: headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: headerBorder,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          <Space size={4}>
            <GlobalSearch />
            <Tooltip title={isDark ? '日間模式' : '夜間模式'}>
              <Button
                type="text"
                icon={isDark
                  ? <SunOutlined style={{ color: '#ff9f0a', fontSize: 15 }} />
                  : <MoonOutlined style={{ fontSize: 15 }} />}
                onClick={toggleTheme}
                style={{ borderRadius: 8 }}
              />
            </Tooltip>
            <Tooltip title="快捷鍵 (?)">
              <Button
                type="text"
                icon={<QuestionOutlined style={{ fontSize: 14 }} />}
                onClick={() => setShortcutHelpOpen(true)}
                style={{ borderRadius: 8 }}
              />
            </Tooltip>
            <Badge count={pendingCount} overflowCount={99} size="small">
              <Tooltip title="待處理陳情">
                <Button
                  type="text"
                  icon={<BellOutlined style={{ fontSize: 15 }} />}
                  onClick={() => navigate('/petitions?status=pending')}
                  style={{ borderRadius: 8 }}
                />
              </Tooltip>
            </Badge>

            <div style={{ width: 1, height: 20, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 4px' }} />

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <Avatar
                  icon={<UserOutlined />}
                  size={26}
                  style={{ background: 'linear-gradient(135deg,#007AFF,#5ac8fa)', flexShrink: 0 }}
                />
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? '#f5f5f7' : '#1d1d1f' }}>{user?.name}</div>
                  <div style={{ fontSize: 10, color: '#8e8e93' }}>{ROLE_LABELS[user?.role || ''] || user?.role}</div>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        {/* Content */}
        <Content style={{
          padding: 16,
          overflow: 'auto',
          minHeight: 'calc(100vh - 52px)',
          background: isDark ? '#18191c' : '#f5f5f7',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>

    <FirstRunWizard
      open={showWizard}
      onFinish={() => {
        setShowWizard(false)
        api.get('/admin/settings').then(r => {
          if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
        }).catch(() => {})
      }}
    />
    <ScheduleReminder />

    <Modal
      title="鍵盤快捷鍵"
      open={shortcutHelpOpen}
      onCancel={() => setShortcutHelpOpen(false)}
      footer={<Button onClick={() => setShortcutHelpOpen(false)}>關閉</Button>}
      width={380}
    >
      <Table
        size="small"
        dataSource={shortcutList}
        rowKey="key"
        pagination={false}
        showHeader={false}
        columns={[
          {
            dataIndex: 'key', width: 160,
            render: (k: string) => (
              <kbd style={{
                background: isDark ? '#2c2c2e' : '#f5f5f7',
                border: `1px solid ${isDark ? '#3a3a3c' : '#d1d1d6'}`,
                borderRadius: 6, padding: '2px 8px',
                fontFamily: '-apple-system, monospace', fontSize: 12,
                color: isDark ? '#ebebf5' : '#1d1d1f',
                boxShadow: '0 1px 0 rgba(0,0,0,.1)',
              }}>{k}</kbd>
            ),
          },
          { dataIndex: 'description', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
        ]}
      />
    </Modal>
    </>
  )
}
