import React from 'react'
import { Space, Typography } from 'antd'

const { Text, Title } = Typography

interface PageScaffoldProps {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  maxWidth?: number | string
  titleLevel?: 1 | 2 | 3 | 4 | 5
  variant?: 'hero' | 'compact'
}

export default function PageScaffold({
  eyebrow,
  title,
  description,
  actions,
  children,
  maxWidth = 1440,
  titleLevel = 3,
  variant = 'hero',
}: PageScaffoldProps) {
  return (
    <div className="vss-page-scaffold" style={{ maxWidth }}>
      <div className={`vss-page-hero vss-page-hero-${variant}`}>
        <div>
          {eyebrow && <Text className="vss-page-kicker">{eyebrow}</Text>}
          <Title level={titleLevel} className="vss-page-title">{title}</Title>
          {description && <Text className="vss-page-description">{description}</Text>}
        </div>
        {actions && (
          <Space wrap size={8} className="vss-page-actions">
            {actions}
          </Space>
        )}
      </div>
      {children}
    </div>
  )
}
