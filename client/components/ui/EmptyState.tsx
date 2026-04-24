import React from 'react'
import { Empty, Typography } from 'antd'

const { Text } = Typography

interface EmptyStateProps {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: 'default' | 'search' | 'compact'
}

export default function EmptyState({
  title = '尚無資料',
  description,
  action,
  variant = 'default',
}: EmptyStateProps) {
  return (
    <div className={`vss-empty-state vss-empty-state-${variant}`}>
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false}>
        <Text className="vss-empty-title">{title}</Text>
        {description && <Text className="vss-empty-description">{description}</Text>}
        {action && <div className="vss-empty-action">{action}</div>}
      </Empty>
    </div>
  )
}
