import React, { useState, useEffect } from 'react'
import { Card, Descriptions, Tag, Space, Typography, Row, Col, Statistic, Empty } from 'antd'
import { StarFilled } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'
import api from '../../../utils/api'
import dayjs from 'dayjs'

const { Text } = Typography

const TAG_COLORS: Record<string, string> = {
  '樁腳': 'red', '志工': 'blue', '捐款者': 'gold', '支持者': 'green', '意見領袖': 'purple'
}

interface Props {
  voterId: number
  voterData?: any
}

export default function EngagementTab({ voterId, voterData: voter }: Props) {
  const [engagement, setEngagement] = useState<any>(null)
  const [activityHistory, setActivityHistory] = useState<any[]>([])
  const [referrer, setReferrer] = useState<any>(null)
  const [referredVoters, setReferredVoters] = useState<any[]>([])
  const [householdMembers, setHouseholdMembers] = useState<any[]>([])
  const [timeline, setTimeline] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])

  useEffect(() => {
    if (!voterId) return

    api.get(`/voters/${voterId}/engagement`).then(r => setEngagement(r.data.data)).catch(() => {})
    api.get(`/voters/${voterId}/activity-history`).then(r => setActivityHistory(r.data.data || [])).catch(() => {})
    api.get(`/voters/${voterId}/contacts`).then(r => setContacts(r.data.data || [])).catch(() => {})

    // Load timeline
    Promise.allSettled([
      api.get(`/contact-records?voter_id=${voterId}&pageSize=50`),
      api.get(`/petitions?voter_id=${voterId}&pageSize=50`),
    ]).then(([contactsRes, petitionsRes]) => {
      const items: any[] = []
      if (contactsRes.status === 'fulfilled') {
        (contactsRes.value.data.data || []).forEach((c: any) => items.push({
          ...c, _type: 'contact', _date: c.contact_date,
          _title: `${c.contact_type === 'phone' ? '📞' : c.contact_type === 'visit' ? '🚶' : '💬'} ${c.content?.slice(0, 30) || c.summary?.slice(0, 30) || ''}`
        }))
      }
      if (petitionsRes.status === 'fulfilled') {
        (petitionsRes.value.data.data || []).forEach((p: any) => items.push({
          ...p, _type: 'petition', _date: p.petition_date,
          _title: `📋 ${p.case_number} ${p.content?.slice(0, 20)}`
        }))
      }
      items.sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime())
      setTimeline(items)
    })

    // Relationship graph data
    if (voter?.referrer_id) {
      api.get(`/voters/${voter.referrer_id}`).then(r => setReferrer(r.data.data)).catch(() => {})
    } else {
      setReferrer(null)
    }
    api.get(`/voters?referrer_id=${voterId}&pageSize=20`).then(r => setReferredVoters(r.data.data || [])).catch(() => {})
    if (voter?.household_key) {
      api.get(`/voters?household_key=${encodeURIComponent(voter.household_key)}&pageSize=10`)
        .then(r => setHouseholdMembers(r.data.data || []))
        .catch(() => {
          if (voter?.household_address) {
            api.get(`/voters?search=${encodeURIComponent(voter.household_address)}&pageSize=10`)
              .then(r2 => setHouseholdMembers(r2.data.data || []))
              .catch(() => {})
          }
        })
    } else if (voter?.household_address) {
      api.get(`/voters?search=${encodeURIComponent(voter.household_address)}&pageSize=10`)
        .then(r => setHouseholdMembers(r.data.data || []))
        .catch(() => {})
    }
  }, [voterId])

  if (!voter) return null

  return (
    <div>
      {engagement ? (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="支持度" value={engagement.support_level ?? '-'} suffix="/ 5"
              prefix={<StarFilled style={{ color: '#faad14' }} />} />
          </Col>
          <Col span={6}>
            <Statistic title="活躍分數" value={engagement.score ?? '-'} />
          </Col>
          <Col span={6}>
            <Statistic title="核心支持者" value={engagement.is_key_supporter ? '是' : '否'} />
          </Col>
          <Col span={6}>
            <Statistic title="志工" value={engagement.is_volunteer ? '是' : '否'} />
          </Col>
        </Row>
      ) : <Empty description="尚無經營資料" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginBottom: 16 }} />}

      <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="標籤">
          <Space wrap>{(voter.tags || []).length > 0 ? (voter.tags || []).map((t: string) => <Tag key={t} color={TAG_COLORS[t] || 'blue'}>{t}</Tag>) : '—'}</Space>
        </Descriptions.Item>
        <Descriptions.Item label="最後聯絡日">
          {contacts.length > 0 ? dayjs(contacts[0].contact_date).format('YYYY-MM-DD') : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="介紹人" span={2}>
          {voter.referrer_name || '—'}
        </Descriptions.Item>
      </Descriptions>

      {/* Activity history timeline */}
      <Card title="互動時間軸" size="small" style={{ marginBottom: 16 }}>
        {timeline.length === 0 ? <Empty description="尚無互動記錄" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <div style={{ maxHeight: 300, overflowY: 'auto', paddingLeft: 8 }}>
            {timeline.map((item) => (
              <div key={`${item._type}-${item.id}`} style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}>
                <div style={{ width: 2, background: '#e8e8e8', position: 'absolute', left: 12, top: 20, bottom: -16 }} />
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: item._type === 'contact' ? '#007AFF' : '#52c41a', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'white' }}>{item._type === 'contact' ? '聯' : '案'}</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#999' }}>{item._date}</div>
                  <div style={{ fontSize: 13 }}>{item._title}</div>
                  {item._type === 'contact' && item.result_type && (
                    <Tag style={{ fontSize: 10, marginTop: 2 }}>{item.result_type}</Tag>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Activity score history chart */}
      {activityHistory.length > 0 && (
        <Card title="活躍分數趨勢" size="small" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={activityHistory} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Line type="monotone" dataKey="score" stroke="#007AFF" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* E-3: Relationship network */}
      {(referrer || referredVoters.length > 0 || householdMembers.filter((v: any) => v.id !== voter.id).length > 0) && (
        <Card title="關係網絡" size="small">
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {referrer && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>介紹人：</Text>
                <Link to={`/voters/${referrer.id}`}>{referrer.name}</Link>
                {referrer.mobile && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>({referrer.mobile})</Text>}
              </div>
            )}
            {referredVoters.length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>介紹的選民（{referredVoters.length}人）：</Text>
                <div style={{ marginTop: 4 }}>
                  {referredVoters.map((v: any) => (
                    <Tag key={v.id} style={{ marginBottom: 4 }}>
                      <Link to={`/voters/${v.id}`}>{v.name}</Link>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {householdMembers.filter((v: any) => v.id !== voter.id).length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  同住家人（{householdMembers.filter((v: any) => v.id !== voter.id).length}人）：
                </Text>
                <div style={{ marginTop: 4 }}>
                  {householdMembers.filter((v: any) => v.id !== voter.id).map((v: any) => (
                    <Tag key={v.id} color="blue" style={{ marginBottom: 4 }}>
                      <Link to={`/voters/${v.id}`}>{v.name}</Link>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Space>
        </Card>
      )}
    </div>
  )
}
