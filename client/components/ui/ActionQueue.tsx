import React from 'react'
import { Button, Card, List, Space, Tag, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import EmptyState from './EmptyState'

const { Text } = Typography

type ActionTone = 'red' | 'amber' | 'blue' | 'green' | 'purple' | 'slate'

const TAG_COLOR: Record<ActionTone, string> = {
  red: 'red',
  amber: 'orange',
  blue: 'blue',
  green: 'green',
  purple: 'purple',
  slate: 'default',
}

export interface ActionQueueItem {
  key: React.Key
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  tag?: React.ReactNode
  tone?: ActionTone
  onClick?: () => void
}

interface ActionQueueProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  items: ActionQueueItem[]
  emptyText?: React.ReactNode
  extra?: React.ReactNode
  limit?: number
}

export default function ActionQueue({
  title,
  subtitle,
  items,
  emptyText = '目前沒有待處理項目',
  extra,
  limit = 6,
}: ActionQueueProps) {
  const visibleItems = items.slice(0, limit)

  return (
    <Card
      className="vss-action-queue"
      title={
        <div>
          <div>{title}</div>
          {subtitle && <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>}
        </div>
      }
      extra={extra}
    >
      {visibleItems.length === 0 ? (
        <EmptyState variant="compact" title={emptyText} />
      ) : (
        <List
          dataSource={visibleItems}
          renderItem={(item) => (
            <List.Item
              className={`vss-action-item${item.onClick ? ' vss-clickable' : ''}`}
              onClick={item.onClick}
            >
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <Space size={6} wrap>
                    {item.tag && <Tag color={TAG_COLOR[item.tone || 'slate']}>{item.tag}</Tag>}
                    <Text strong className="vss-action-title">{item.title}</Text>
                  </Space>
                  {item.description && (
                    <div className="vss-action-description">{item.description}</div>
                  )}
                  {item.meta && <Text className="vss-action-meta">{item.meta}</Text>}
                </div>
                {item.onClick && (
                  <Button type="text" size="small" icon={<ArrowRightOutlined />} />
                )}
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}
