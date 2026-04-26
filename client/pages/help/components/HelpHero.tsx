import React from 'react'
import { Button, Input, Space, Typography } from 'antd'
import {
  SearchOutlined, RocketOutlined, TeamOutlined, SettingOutlined,
} from '@ant-design/icons'

const { Title, Paragraph } = Typography

type RoleTrack = {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  /** Anchor id to scroll to */
  anchor: string
  color: string
}

const ROLE_TRACKS: RoleTrack[] = [
  {
    id: 'newbie',
    label: '我是新手',
    description: '5 分鐘認識首頁與基本操作',
    icon: <RocketOutlined />,
    anchor: 'help-quickstart',
    color: '#34C759',
  },
  {
    id: 'staff',
    label: '我是助理／主管',
    description: '常見情境食譜，跨模組工作流',
    icon: <TeamOutlined />,
    anchor: 'help-scenarios',
    color: '#007AFF',
  },
  {
    id: 'admin',
    label: '我是管理員',
    description: '帳號、設定、備份、Google、AI、Tailscale',
    icon: <SettingOutlined />,
    anchor: 'help-modules-admin',
    color: '#8E8E93',
  },
]

type Props = {
  searchValue: string
  onSearchChange: (v: string) => void
}

function scrollToAnchor(anchor: string) {
  const el = document.getElementById(anchor)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export default function HelpHero({ searchValue, onSearchChange }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        marginBottom: 32,
        padding: '40px 36px',
        borderRadius: 20,
        background: 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 60%, #34C759 100%)',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Decorative dots */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: -60,
          top: -60,
          width: 240,
          height: 240,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: 60,
          bottom: -40,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 720 }}>
        <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>
          選民服務系統 — 使用指南
        </Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15, marginBottom: 20 }}>
          找不到功能？直接搜尋；新手不知從哪開始？選擇下方角色路徑，5 分鐘上手。
        </Paragraph>

        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined aria-hidden style={{ color: '#bfbfbf' }} />}
          placeholder="搜尋模組、情境、關鍵字（例如：陳情、Google、備份）"
          aria-label="搜尋使用說明模組或情境"
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            maxWidth: 560,
            background: 'rgba(255,255,255,0.96)',
            borderRadius: 10,
            boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          }}
        />

        <Space wrap size={[12, 12]} style={{ marginTop: 24 }}>
          {ROLE_TRACKS.map(t => (
            <Button
              key={t.id}
              size="large"
              icon={t.icon}
              onClick={() => scrollToAnchor(t.anchor)}
              style={{
                background: 'rgba(255,255,255,0.96)',
                color: t.color,
                fontWeight: 600,
                border: 'none',
                borderRadius: 12,
                padding: '8px 20px',
                height: 'auto',
                lineHeight: 1.3,
                textAlign: 'left',
                boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
              }}
            >
              <span style={{ display: 'block', fontSize: 14 }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: 11, color: '#8e8e93', fontWeight: 400 }}>
                {t.description}
              </span>
            </Button>
          ))}
        </Space>
      </div>
    </div>
  )
}
