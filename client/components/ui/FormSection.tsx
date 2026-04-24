import React from 'react'
import { Typography } from 'antd'

const { Text } = Typography

interface FormSectionProps {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  compact?: boolean
}

export default function FormSection({
  title,
  description,
  children,
  compact = false,
}: FormSectionProps) {
  return (
    <section className={`vss-form-section ${compact ? 'vss-form-section-compact' : ''}`}>
      <div className="vss-form-section-head">
        <Text className="vss-form-section-title">{title}</Text>
        {description && <Text className="vss-form-section-description">{description}</Text>}
      </div>
      <div className="vss-form-section-body">{children}</div>
    </section>
  )
}
