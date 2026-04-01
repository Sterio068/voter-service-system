import React, { useState, useEffect } from 'react'
import { Button, Card, Typography, Space, Divider, Result, Spin, Tag, message } from 'antd'
import { PhoneOutlined, CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined, StopOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

// Call-bank mode: extremely simplified interface for volunteer phone canvassing
// Shows one voter at a time, only allows basic call outcome recording

export default function CallBankPage() {
  const [currentVoter, setCurrentVoter] = useState<any>(null)
  const [voterQueue, setVoterQueue] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionCount, setSessionCount] = useState(0)
  const [sessionResults, setSessionResults] = useState({ answered: 0, no_answer: 0, support: 0, oppose: 0 })

  useEffect(() => { loadQueue() }, [])

  const loadQueue = async () => {
    setLoading(true)
    try {
      // Load voters that haven't been contacted recently
      const r = await api.get('/reports/no-contact-voters?days=30&pageSize=20')
      const d = r.data
      if (d.success) {
        setVoterQueue(d.data || [])
        if (d.data?.length > 0) setCurrentVoter(d.data[0])
      }
    } catch { message.error('載入選民清單失敗') }
    setLoading(false)
  }

  const recordOutcome = async (outcome: 'answered_support' | 'answered_oppose' | 'answered_neutral' | 'no_answer' | 'busy') => {
    if (!currentVoter) return

    const outcomeMap: Record<string, { result_type: string; content: string }> = {
      answered_support: { result_type: 'resolved', content: '電話拜票：接通，表示支持' },
      answered_oppose: { result_type: 'resolved', content: '電話拜票：接通，表示不支持' },
      answered_neutral: { result_type: 'resolved', content: '電話拜票：接通，態度中立' },
      no_answer: { result_type: 'no_answer', content: '電話拜票：未接聽' },
      busy: { result_type: 'no_answer', content: '電話拜票：忙線中' },
    }

    const { result_type, content } = outcomeMap[outcome]

    try {
      await api.post('/contact-records', {
        voter_id: currentVoter.id,
        contact_type: 'phone',
        content,
        result_type,
        contact_date: new Date().toISOString().slice(0, 10),
      })
    } catch {}

    // Update session stats
    setSessionCount(c => c + 1)
    setSessionResults(r => ({
      ...r,
      answered: outcome.startsWith('answered') ? r.answered + 1 : r.answered,
      no_answer: outcome === 'no_answer' || outcome === 'busy' ? r.no_answer + 1 : r.no_answer,
      support: outcome === 'answered_support' ? r.support + 1 : r.support,
      oppose: outcome === 'answered_oppose' ? r.oppose + 1 : r.oppose,
    }))

    // Load next voter
    const remaining = voterQueue.filter(v => v.id !== currentVoter.id)
    setVoterQueue(remaining)
    setCurrentVoter(remaining[0] || null)
    if (remaining.length < 3) loadQueue() // preload more
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      {/* Session stats header */}
      <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff' }}>
        <Space split={<Divider type="vertical" />}>
          <Text>本次撥打：<strong>{sessionCount}</strong></Text>
          <Text>接通：<strong style={{ color: '#52c41a' }}>{sessionResults.answered}</strong></Text>
          <Text>未接：<strong style={{ color: '#faad14' }}>{sessionResults.no_answer}</strong></Text>
          <Text>支持：<strong style={{ color: '#1890ff' }}>{sessionResults.support}</strong></Text>
        </Space>
      </Card>

      {currentVoter ? (
        <Card>
          {/* Show ONLY essential info - no browsing capability */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Title level={3}>{currentVoter.voter_name || currentVoter.name}</Title>
            <Text type="secondary">{currentVoter.addr_district || ''}</Text>
            {currentVoter.support_level && (
              <div><Tag color={currentVoter.support_level >= 4 ? 'blue' : 'default'}>支持度 {currentVoter.support_level}</Tag></div>
            )}
          </div>

          <Divider>請選擇通話結果</Divider>

          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Button block size="large" type="primary" icon={<CheckCircleOutlined />}
              onClick={() => recordOutcome('answered_support')} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              ✅ 接通 — 表示支持
            </Button>
            <Button block size="large" icon={<QuestionCircleOutlined />}
              onClick={() => recordOutcome('answered_neutral')}>
              😐 接通 — 態度中立
            </Button>
            <Button block size="large" danger icon={<CloseCircleOutlined />}
              onClick={() => recordOutcome('answered_oppose')}>
              ❌ 接通 — 不支持
            </Button>
            <Button block size="large" onClick={() => recordOutcome('no_answer')} style={{ background: '#faad14', borderColor: '#faad14', color: '#fff' }}>
              📵 未接聽
            </Button>
            <Button block onClick={() => recordOutcome('busy')}>
              忙線中，下次再試
            </Button>
          </Space>

          <Divider />
          <Text type="secondary" style={{ fontSize: 12 }}>剩餘 {voterQueue.length} 位待撥 · 此模式無法查詢完整選民資料</Text>
        </Card>
      ) : (
        <Result icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          title="本批次完成！" subTitle={`共撥打 ${sessionCount} 通，接通 ${sessionResults.answered} 通`}
          extra={<Button type="primary" onClick={loadQueue}>載入下一批</Button>} />
      )}
    </div>
  )
}
