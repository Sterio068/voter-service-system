import React, { useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, Space, Modal, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../utils/api'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoClicks, setLogoClicks] = useState(0)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPwd, setResetPwd] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  const handleLogoClick = () => {
    const next = logoClicks + 1
    setLogoClicks(next)
    if (next >= 5) {
      setLogoClicks(0)
      setResetOpen(true)
      setResetPwd('')
      setResetMsg('')
    }
  }

  const handleReset = async () => {
    const api = (window as any).electronAPI
    if (!api) { setResetMsg('此功能僅限桌面版使用'); return }
    const result = await api.resetFingerprint(resetPwd)
    if (result?.ok) {
      setResetMsg('✅ 指紋已重置，下次重新啟動後將重新綁定此電腦')
      setResetPwd('')
    } else {
      setResetMsg('❌ 密碼錯誤')
    }
  }

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', values)
      if (res.data.success) {
        setAuth(res.data.data.token, res.data.data.user)
        navigate('/')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || '登入失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Card style={{ width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <Space direction="vertical" style={{ width: '100%', textAlign: 'center', marginBottom: 24 }}>
          <div role="img" aria-label="選民服務系統 Logo" style={{ fontSize: 48, cursor: 'default', userSelect: 'none' }} onClick={handleLogoClick}>🗳️</div>
          <Title level={3} style={{ margin: 0 }}>選民服務系統</Title>
          <Text type="secondary">請登入以繼續</Text>
        </Space>

        {error && <Alert message={error} type="error" showIcon role="alert" style={{ marginBottom: 16 }} />}

        <Form onFinish={handleLogin} layout="vertical" size="large" aria-label="登入表單">
          <Form.Item name="username" label="帳號" rules={[{ required: true, message: '請輸入帳號' }]}>
            <Input prefix={<UserOutlined aria-hidden />} placeholder="帳號" autoFocus aria-label="帳號" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密碼" rules={[{ required: true, message: '請輸入密碼' }]}>
            <Input.Password prefix={<LockOutlined aria-hidden />} placeholder="密碼" aria-label="密碼" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登入
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            本系統資料儲存於本機，不對外傳輸
          </Text>
        </div>
      </Card>

      <Modal
        title="維護功能"
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        onOk={handleReset}
        okText="確認重置"
        cancelText="取消"
      >
        <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          重置機器指紋後，下次重新啟動時系統將重新綁定本機。
        </p>
        <Input.Password
          placeholder="請輸入維護密碼"
          value={resetPwd}
          onChange={e => { setResetPwd(e.target.value); setResetMsg('') }}
          onPressEnter={handleReset}
        />
        {resetMsg && (
          <div style={{ marginTop: 8, fontSize: 13 }}>{resetMsg}</div>
        )}
      </Modal>
    </div>
  )
}
