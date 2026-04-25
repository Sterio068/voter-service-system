import React, { useMemo, useState } from 'react'
import { Card, Col, Empty, Modal, Row, Space, Tag, Typography } from 'antd'
import { ClockCircleOutlined, BulbOutlined } from '@ant-design/icons'
import { HELP_SCENARIOS, type HelpScenario } from '../data/scenarios'
import { HELP_MODULES_BY_ID } from '../data/modules'

const { Title, Paragraph, Text } = Typography

type Props = {
  searchValue: string
}

function matchesSearch(s: HelpScenario, query: string): boolean {
  if (!query) return true
  const lower = query.toLowerCase()
  if (s.title.toLowerCase().includes(lower) || s.subtitle.toLowerCase().includes(lower)) return true
  return s.moduleIds.some(id => {
    const m = HELP_MODULES_BY_ID[id]
    return m && (
      m.title.toLowerCase().includes(lower) ||
      m.keywords.toLowerCase().includes(lower)
    )
  })
}

export default function HelpScenarios({ searchValue }: Props) {
  const [active, setActive] = useState<HelpScenario | null>(null)

  const filtered = useMemo(
    () => HELP_SCENARIOS.filter(s => matchesSearch(s, searchValue.trim())),
    [searchValue],
  )

  return (
    <section id="help-scenarios" style={{ marginBottom: 32, scrollMarginTop: 24 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <BulbOutlined style={{ color: '#FF9500' }} />
        常見情境食譜
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        跨模組工作流，照著做就完成。點任一張卡片展開細節步驟。
      </Paragraph>

      {filtered.length === 0 ? (
        <Empty
          description={`沒有符合「${searchValue}」的情境，試試直接搜尋下方的模組索引。`}
          style={{ padding: '24px 0' }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(s => (
            <Col key={s.id} xs={24} sm={12} lg={8}>
              <Card
                hoverable
                onClick={() => setActive(s)}
                style={{ borderRadius: 12, height: '100%' }}
                styles={{ body: { padding: 18 } }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: `${s.color}1a`,
                      color: s.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      flex: '0 0 42px',
                    }}
                  >
                    {s.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 15, lineHeight: 1.3, display: 'block' }}>
                      {s.title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                      {s.subtitle}
                    </Text>
                  </div>
                </div>

                <Space size={4} wrap style={{ marginTop: 14 }}>
                  <Tag icon={<ClockCircleOutlined />} color="blue" style={{ marginInlineEnd: 0 }}>
                    {s.estimatedMin} 分鐘
                  </Tag>
                  {s.moduleIds.slice(0, 3).map(id => {
                    const m = HELP_MODULES_BY_ID[id]
                    if (!m) return null
                    return (
                      <Tag key={id} color={m.color} style={{ marginInlineEnd: 0 }}>
                        {m.title}
                      </Tag>
                    )
                  })}
                  {s.moduleIds.length > 3 && (
                    <Tag style={{ marginInlineEnd: 0 }}>+{s.moduleIds.length - 3}</Tag>
                  )}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        open={!!active}
        title={active && (
          <Space>
            <span style={{ color: active.color }}>{active.icon}</span>
            {active.title}
          </Space>
        )}
        onCancel={() => setActive(null)}
        footer={null}
        width={680}
        destroyOnHidden
      >
        {active && (
          <div style={{ paddingTop: 4 }}>
            <Paragraph type="secondary">{active.subtitle}</Paragraph>
            <Space size={4} wrap style={{ marginBottom: 16 }}>
              <Tag icon={<ClockCircleOutlined />} color="blue">{active.estimatedMin} 分鐘</Tag>
              {active.moduleIds.map(id => {
                const m = HELP_MODULES_BY_ID[id]
                if (!m) return null
                return <Tag key={id} color={m.color}>{m.title}</Tag>
              })}
            </Space>
            {active.body()}
          </div>
        )}
      </Modal>
    </section>
  )
}
