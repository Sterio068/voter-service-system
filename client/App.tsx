import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ConfigProvider, theme as antTheme, Button, Result } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'
import MainLayout from './components/Layout/MainLayout'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import VoterListPage from './pages/voters/VoterListPage'
import VoterDetailPage from './pages/voters/VoterDetailPage'
import GroupListPage from './pages/groups/GroupListPage'
import GroupDetailPage from './pages/groups/GroupDetailPage'
import PetitionListPage from './pages/petitions/PetitionListPage'
import PetitionDetailPage from './pages/petitions/PetitionDetailPage'
import PetitionStatsPage from './pages/print/PetitionStatsPage'
import DocumentListPage from './pages/documents/DocumentListPage'
import SchedulePage from './pages/schedules/SchedulePage'
import TasksPage from './pages/tasks/TasksPage'
import ReportsPage from './pages/reports/ReportsPage'
import UserManagePage from './pages/admin/UserManagePage'
import AuditLogPage from './pages/admin/AuditLogPage'
import CategoryPage from './pages/admin/CategoryPage'
import SettingsPage from './pages/admin/SettingsPage'
import HandoverPage from './pages/admin/HandoverPage'
import HelpPage from './pages/HelpPage'
import CeremonyPage from './pages/ceremonies/CeremonyPage'
import VendorPage from './pages/ceremonies/VendorPage'
import ExpensePage from './pages/ceremonies/ExpensePage'
import ProposalsPage from './pages/proposals/ProposalsPage'

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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
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
            <Route path="voters/:id" element={<VoterDetailPage />} />
            <Route path="groups" element={<GroupListPage />} />
            <Route path="groups/:id" element={<GroupDetailPage />} />
            <Route path="petitions" element={<PetitionListPage />} />
            <Route path="petitions/stats" element={<PetitionStatsPage />} />
            <Route path="petitions/:id" element={<PetitionDetailPage />} />
            <Route path="documents" element={<DocumentListPage />} />
            <Route path="schedules" element={<SchedulePage />} />
            <Route path="ceremonies" element={<CeremonyPage />} />
            <Route path="vendors" element={<VendorPage />} />
            <Route path="expenses" element={<ExpensePage />} />
            <Route path="proposals" element={<ProposalsPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="admin/users" element={<UserManagePage />} />
            <Route path="admin/audit-logs" element={<AuditLogPage />} />
            <Route path="admin/categories" element={<CategoryPage />} />
            <Route path="admin/settings" element={<SettingsPage />} />
            <Route path="admin/handover" element={<HandoverPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ConfigProvider>
    </AppErrorBoundary>
  )
}
