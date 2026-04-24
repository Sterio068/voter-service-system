import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ConfigProvider, theme as antTheme, Button, Result, Spin } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import MainLayout from './components/Layout/MainLayout'
import type { UserRole } from '../shared/types'
import { canAccessFeature, type AppFeature } from './utils/permissions'

const LoginPage = React.lazy(() => import('./pages/LoginPage'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const VoterListPage = React.lazy(() => import('./pages/voters/VoterListPage'))
const VoterDetailPage = React.lazy(() => import('./pages/voters/VoterDetailPage'))
const VoterMergePage = React.lazy(() => import('./pages/voters/VoterMergePage'))
const CallBankPage = React.lazy(() => import('./pages/voters/CallBankPage'))
const GroupListPage = React.lazy(() => import('./pages/groups/GroupListPage'))
const GroupDetailPage = React.lazy(() => import('./pages/groups/GroupDetailPage'))
const PetitionListPage = React.lazy(() => import('./pages/petitions/PetitionListPage'))
const PetitionDetailPage = React.lazy(() => import('./pages/petitions/PetitionDetailPage'))
const PetitionStatsPage = React.lazy(() => import('./pages/print/PetitionStatsPage'))
const PrintVoterListPage = React.lazy(() => import('./pages/print/PrintVoterListPage'))
const PrintLabelPage = React.lazy(() => import('./pages/print/PrintLabelPage'))
const DocumentListPage = React.lazy(() => import('./pages/documents/DocumentListPage'))
const SchedulePage = React.lazy(() => import('./pages/schedules/SchedulePage'))
const TasksPage = React.lazy(() => import('./pages/tasks/TasksPage'))
const EventsPage = React.lazy(() => import('./pages/events/EventsPage'))
const SurveysPage = React.lazy(() => import('./pages/surveys/SurveysPage'))
const NotificationsPage = React.lazy(() => import('./pages/notifications/NotificationsPage'))
const ReportsPage = React.lazy(() => import('./pages/reports/ReportsPage'))
const UserManagePage = React.lazy(() => import('./pages/admin/UserManagePage'))
const AuditLogPage = React.lazy(() => import('./pages/admin/AuditLogPage'))
const CategoryPage = React.lazy(() => import('./pages/admin/CategoryPage'))
const SettingsPage = React.lazy(() => import('./pages/admin/SettingsPage'))
const HandoverPage = React.lazy(() => import('./pages/admin/HandoverPage'))
const DailyLogPage = React.lazy(() => import('./pages/admin/DailyLogPage'))
const HelpPage = React.lazy(() => import('./pages/HelpPage'))
const CeremonyPage = React.lazy(() => import('./pages/ceremonies/CeremonyPage'))
const VendorPage = React.lazy(() => import('./pages/ceremonies/VendorPage'))
const ExpensePage = React.lazy(() => import('./pages/ceremonies/ExpensePage'))
const ProposalsPage = React.lazy(() => import('./pages/proposals/ProposalsPage'))

// Global error reporting
window.onerror = (message, source, lineno, colno, error) => {
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(message), source: String(source), stack: error?.stack?.slice(0, 1000), url: window.location.pathname })
  }).catch(() => {})
}
window.onunhandledrejection = (event) => {
  fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(event.reason), source: 'unhandledRejection', url: window.location.pathname })
  }).catch(() => {})
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: any) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: error.message, stack: error.stack?.slice(0, 1000), source: 'ErrorBoundary', url: window.location.pathname })
    }).catch(() => {})
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Result
            status="error"
            title="應用程式發生錯誤"
            subTitle={this.state.error?.message}
            extra={
              <Button onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}>
                重新整理
              </Button>
            }
          />
        </div>
      )
    }
    return this.props.children
  }
}

function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <Result
        status="404"
        title="404"
        subTitle="頁面不存在或您沒有存取權限"
        extra={<Button type="primary" onClick={() => navigate('/')}>回到首頁</Button>}
      />
    </div>
  )
}

function RouteFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spin size="large" />
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function ForbiddenPage() {
  const navigate = useNavigate()
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <Result
        status="403"
        title="權限不足"
        subTitle="您目前沒有存取這個頁面的權限。"
        extra={<Button type="primary" onClick={() => navigate('/')}>回到首頁</Button>}
      />
    </div>
  )
}

function RequireFeatureAccess({
  feature,
  children,
}: {
  feature: AppFeature
  children: React.ReactNode
}) {
  const role = useAuthStore((s) => s.user?.role as UserRole | undefined)
  if (!canAccessFeature(role, feature)) return <ForbiddenPage />
  return <>{children}</>
}

export default function App() {
  const isDark = useThemeStore((s) => s.isDark)

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    document.body.style.backgroundColor = isDark ? '#000000' : '#f5f5f7'
    document.body.style.color = isDark ? '#f5f5f7' : '#1d1d1f'
  }, [isDark])

  return (
    <AppErrorBoundary>
      <ConfigProvider
        locale={zhTW}
        theme={{
          algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#007AFF',
            colorInfo: '#007AFF',
            borderRadius: 8,
            borderRadiusLG: 12,
            borderRadiusSM: 6,
            colorBgLayout: '#f5f5f7',
            colorBgContainer: '#ffffff',
            colorTextBase: '#1d1d1f',
            colorTextSecondary: '#6e6e73',
            colorBorderSecondary: 'rgba(0,0,0,0.08)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang TC", "Microsoft JhengHei", sans-serif',
            fontSize: 13,
            lineHeight: 1.5,
            boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
            boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.10)',
          },
          components: {
            Card: {
              borderRadiusLG: 12,
              paddingLG: 16,
            },
            Button: {
              borderRadius: 8,
              fontWeight: 500,
            },
            Input: {
              borderRadius: 8,
            },
            Select: {
              borderRadius: 8,
            },
            Table: {
              borderRadius: 12,
            },
          },
        }}
      >
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <MainLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="voters" element={<VoterListPage />} />
              <Route path="call-bank" element={<Navigate to="/voters/call-bank" replace />} />
              <Route path="merge" element={<Navigate to="/voters/merge" replace />} />
              <Route path="voters/merge" element={withFeatureAccess('voterMerge', <VoterMergePage />)} />
              <Route path="voters/call-bank" element={withFeatureAccess('callBank', <CallBankPage />)} />
              <Route path="voters/:id" element={<VoterDetailPage />} />
              <Route path="groups" element={<GroupListPage />} />
              <Route path="groups/:id" element={<GroupDetailPage />} />
              <Route path="petitions" element={<PetitionListPage />} />
              <Route path="petitions/stats" element={withFeatureAccess('petitionStats', <PetitionStatsPage />)} />
              <Route path="petitions/:id" element={<PetitionDetailPage />} />
              <Route path="documents" element={<DocumentListPage />} />
              <Route path="schedules" element={<SchedulePage />} />
              <Route path="ceremonies" element={<CeremonyPage />} />
              <Route path="vendors" element={<VendorPage />} />
              <Route path="expenses" element={withFeatureAccess('expenses', <ExpensePage />)} />
              <Route path="proposals" element={<ProposalsPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="surveys" element={withFeatureAccess('surveys', <SurveysPage />)} />
              <Route path="notifications" element={withFeatureAccess('notifications', <NotificationsPage />)} />
              <Route path="reports" element={withFeatureAccess('reports', <ReportsPage />)} />
              <Route path="print/voters" element={withFeatureAccess('printVoters', <PrintVoterListPage />)} />
              <Route path="print/labels" element={withFeatureAccess('printLabels', <PrintLabelPage />)} />
              <Route path="admin/users" element={withFeatureAccess('adminUsers', <UserManagePage />)} />
              <Route path="admin/audit-logs" element={withFeatureAccess('auditLogs', <AuditLogPage />)} />
              <Route path="admin/categories" element={withFeatureAccess('categories', <CategoryPage />)} />
              <Route path="admin/settings" element={withFeatureAccess('settings', <SettingsPage />)} />
              <Route path="admin/handover" element={withFeatureAccess('handover', <HandoverPage />)} />
              <Route path="admin/daily-log" element={withFeatureAccess('dailyLogs', <DailyLogPage />)} />
              <Route path="help" element={<HelpPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      </ConfigProvider>
    </AppErrorBoundary>
  )
}

function withFeatureAccess(feature: AppFeature, element: React.ReactNode) {
  return <RequireFeatureAccess feature={feature}>{element}</RequireFeatureAccess>
}
