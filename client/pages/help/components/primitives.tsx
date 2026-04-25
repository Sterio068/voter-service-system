import React from 'react'
import { Steps, Typography } from 'antd'

const { Title } = Typography

export function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ color: '#007AFF' }}>{icon}</span>
        {title}
      </Title>
      {children}
    </div>
  )
}

export function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Title level={4} style={{ marginBottom: 8 }}>{title}</Title>
      {children}
    </div>
  )
}

export function StepCard({ steps }: { steps: { title: string; desc?: React.ReactNode }[] }) {
  return (
    <Steps
      direction="vertical"
      size="small"
      current={-1}
      style={{ marginTop: 8 }}
      items={steps.map(s => ({ title: s.title, description: s.desc }))}
    />
  )
}

export type HelpCategory = 'basics' | 'advanced' | 'integrations' | 'admin'

export const CATEGORY_META: Record<HelpCategory, { label: string; color: string; description: string }> = {
  basics: {
    label: '基礎模組',
    color: '#34C759',
    description: '日常最常用的選民、陳情、行程、待辦等核心功能',
  },
  advanced: {
    label: '進階業務',
    color: '#5AC8FA',
    description: '團體、禮儀、廠商、收支、活動、問卷等延伸應用',
  },
  integrations: {
    label: 'AI 與整合',
    color: '#FF9500',
    description: 'AI 助理、Google 日曆等外部整合與自動化',
  },
  admin: {
    label: '管理與部署',
    color: '#8E8E93',
    description: '系統設定、備份、員工交接、區網、外網存取',
  },
}
