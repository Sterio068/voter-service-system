import React, { useState } from 'react'
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd'
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
          <div style={{ fontSize: 48 }}>🗳️</div>
          <Title level={3} style={{ margin: 0 }}>選民服務系統</Title>
          <Text type="secondary">請登入以繼續</Text>
        </Space>

        {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

        <Form onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '請輸入帳號' }]}>
            <Input prefix={<UserOutlined />} placeholder="帳號" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '請輸入密碼' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密碼" />
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
    </div>
  )
}
