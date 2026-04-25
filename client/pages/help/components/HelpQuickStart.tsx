import React from 'react'
import { Card, Steps, Typography } from 'antd'
import { RocketOutlined } from '@ant-design/icons'
import { QUICK_START_STEPS } from '../data/quickstart'

const { Title, Paragraph } = Typography

export default function HelpQuickStart() {
  return (
    <section id="help-quickstart" style={{ marginBottom: 32, scrollMarginTop: 24 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <RocketOutlined style={{ color: '#34C759' }} />
        5 分鐘新手導覽
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        第一次打開系統？跟著以下 6 步走完，就能掌握日常 80% 的操作。
      </Paragraph>

      <Card
        size="small"
        styles={{
          body: {
            padding: '24px 28px',
            background: 'linear-gradient(180deg, #f0fff4 0%, #fafffb 100%)',
          },
        }}
        style={{ borderRadius: 16, border: '1px solid #d9f7be' }}
      >
        <Steps
          direction="vertical"
          current={-1}
          items={QUICK_START_STEPS.map((s, i) => ({
            title: <strong>{`Step ${i + 1}：${s.title}`}</strong>,
            description: s.description,
          }))}
        />
      </Card>
    </section>
  )
}
