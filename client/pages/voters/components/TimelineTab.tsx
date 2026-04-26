import React, { useEffect, useState } from 'react'
import { Timeline, Skeleton, Tag, Typography, Space } from 'antd'
import {
  FileTextOutlined,
  PhoneOutlined,
  CalendarOutlined,
  GiftOutlined,
  CheckSquareOutlined,
  BellOutlined,
  AlertOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import EmptyState from '../../../components/ui/EmptyState'
import dayjs from 'dayjs'

const { Text, Paragraph } = Typography

export interface TimelineEvent {
  type: 'petition' | 'contact' | 'schedule' | 'ceremony' | 'task' | 'note'
  date: string
  title: string
  description?: string | null
  status?: string | null
  icon?: string | null
  link?: string | null
  reference_id: number
}

interface Props {
  voterId: number
}

const TYPE_LABEL: Record<TimelineEvent['type'], string> = {
  petition: '陳情',
  contact: '聯絡',
  schedule: '行程',
  ceremony: '禮儀',
  task: '待辦',
  note: '通知',
}

const TYPE_COLOR: Record<TimelineEvent['type'], string> = {
  petition: 'red',
  contact: 'blue',
  schedule: 'purple',
  ceremony: 'magenta',
  task: 'green',
  note: 'gold',
}

function renderIcon(type: TimelineEvent['type'], iconHint?: string | null): React.ReactNode {
  if (iconHint === 'alert') return <AlertOutlined style={{ color: '#ff4d4f' }} />
  switch (type) {
    case 'petition':
      return <FileTextOutlined style={{ color: '#ff4d4f' }} />
    case 'contact':
      return <PhoneOutlined style={{ color: '#1677ff' }} />
    case 'schedule':
      return <CalendarOutlined style={{ color: '#722ed1' }} />
    case 'ceremony':
      return <GiftOutlined style={{ color: '#eb2f96' }} />
    case 'task':
      return <CheckSquareOutlined style={{ color: '#52c41a' }} />
    case 'note':
      return <BellOutlined style={{ color: '#faad14' }} />
    default:
      return null
  }
}

function formatDate(raw: string): string {
  if (!raw) return ''
  const parsed = dayjs(raw)
  if (!parsed.isValid()) return raw
  return raw.length <= 10 ? parsed.format('YYYY-MM-DD') : parsed.format('YYYY-MM-DD HH:mm')
}

export default function TimelineTab({ voterId }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .get(`/voters/${voterId}/timeline`)
      .then((res) => {
        if (cancelled) return
        const data = Array.isArray(res.data?.data) ? (res.data.data as TimelineEvent[]) : []
        setEvents(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.response?.data?.error || '載入時間軸失敗')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [voterId])

  if (loading) {
    return <Skeleton active paragraph={{ rows: 5 }} />
  }

  if (error) {
    return <EmptyState title="無法載入時間軸" description={error} />
  }

  if (events.length === 0) {
    return <EmptyState title="尚無互動紀錄" description="此選民目前尚未建立陳情、聯絡、行程或其他互動紀錄。" />
  }

  const items = events.map((event, index) => ({
    color: TYPE_COLOR[event.type] || 'gray',
    dot: renderIcon(event.type, event.icon),
    children: (
      <div
        key={`${event.type}-${event.reference_id}-${index}`}
        onClick={event.link ? () => navigate(event.link as string) : undefined}
        onKeyDown={
          event.link
            ? (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(event.link as string)
                }
              }
            : undefined
        }
        role={event.link ? 'link' : undefined}
        tabIndex={event.link ? 0 : undefined}
        aria-label={event.link ? `查看${TYPE_LABEL[event.type] || event.type}：${event.title}` : undefined}
        style={{
          cursor: event.link ? 'pointer' : 'default',
          padding: '4px 8px',
          borderRadius: 6,
          transition: 'background-color 150ms ease',
        }}
      >
        <Space size={8} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDate(event.date)}
          </Text>
          <Tag color={TYPE_COLOR[event.type] || 'default'} style={{ marginRight: 0 }}>
            {TYPE_LABEL[event.type] || event.type}
          </Tag>
          <Text strong>{event.title}</Text>
          {event.status ? (
            <Tag style={{ marginRight: 0 }}>{event.status}</Tag>
          ) : null}
        </Space>
        {event.description ? (
          <Paragraph
            type="secondary"
            ellipsis={{ rows: 2, expandable: false }}
            style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}
          >
            {event.description}
          </Paragraph>
        ) : null}
      </div>
    ),
  }))

  return (
    <div role="region" aria-label="活動時間軸" style={{ paddingTop: 8 }}>
      <Timeline mode="left" items={items} />
    </div>
  )
}
