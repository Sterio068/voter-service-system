import React from 'react'
import { Card, Space, Typography } from 'antd'

const { Text } = Typography

interface WorkspaceToolbarProps {
  title?: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function WorkspaceToolbar({
  title,
  description,
  meta,
  actions,
  children,
  className,
}: WorkspaceToolbarProps) {
  const hasHeader = title || description || meta || actions
  const classNames = ['vss-workspace-toolbar', className].filter(Boolean).join(' ')

  return (
    <Card className={classNames}>
      {hasHeader && (
        <div className="vss-toolbar-head">
          <div>
            {title && <Text className="vss-toolbar-title">{title}</Text>}
            {description && <Text className="vss-toolbar-description">{description}</Text>}
          </div>
          {(meta || actions) && (
            <Space wrap size={8} className="vss-toolbar-meta">
              {meta}
              {actions}
            </Space>
          )}
        </div>
      )}
      <div className="vss-toolbar-body">{children}</div>
    </Card>
  )
}
