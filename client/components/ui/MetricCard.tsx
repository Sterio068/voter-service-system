import React from 'react'
import { Card, Space, Typography } from 'antd'

const { Text } = Typography

type MetricTone = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'

const TONE_CLASS: Record<MetricTone, string> = {
  blue: 'vss-metric-blue',
  green: 'vss-metric-green',
  amber: 'vss-metric-amber',
  red: 'vss-metric-red',
  purple: 'vss-metric-purple',
  slate: 'vss-metric-slate',
}

interface MetricCardProps {
  label: React.ReactNode
  value: React.ReactNode
  helper?: React.ReactNode
  icon?: React.ReactNode
  tone?: MetricTone
  onClick?: () => void
}

export default function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = 'slate',
  onClick,
}: MetricCardProps) {
  return (
    <Card
      hoverable={Boolean(onClick)}
      onClick={onClick}
      className={`vss-metric-card ${TONE_CLASS[tone]}${onClick ? ' vss-clickable' : ''}`}
    >
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Text className="vss-metric-label">{label}</Text>
          <div className="vss-metric-value">{value}</div>
          {helper && <Text className="vss-metric-helper">{helper}</Text>}
        </div>
        {icon && <div className="vss-metric-icon">{icon}</div>}
      </Space>
    </Card>
  )
}
