import React, { useMemo, useState } from 'react'
import { Button, Card, Collapse, Empty, Space, Tag, Typography } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { CATEGORY_META, type HelpCategory } from './primitives'
import { HELP_MODULES, type HelpModule } from '../data/modules'

const { Title, Paragraph, Text } = Typography
const { Panel } = Collapse

type Props = {
  searchValue: string
}

const CATEGORIES: (HelpCategory | 'all')[] = ['all', 'basics', 'advanced', 'integrations', 'admin']
const CATEGORY_LABEL: Record<HelpCategory | 'all', string> = {
  all: '全部',
  basics: CATEGORY_META.basics.label,
  advanced: CATEGORY_META.advanced.label,
  integrations: CATEGORY_META.integrations.label,
  admin: CATEGORY_META.admin.label,
}

function matchesSearch(m: HelpModule, query: string): boolean {
  if (!query) return true
  const lower = query.toLowerCase()
  return (
    m.title.toLowerCase().includes(lower) ||
    m.summary.toLowerCase().includes(lower) ||
    m.keywords.toLowerCase().includes(lower)
  )
}

export default function HelpModuleList({ searchValue }: Props) {
  const [category, setCategory] = useState<HelpCategory | 'all'>('all')
  const [openKeys, setOpenKeys] = useState<string[]>([])

  // When searching, expand all matched panels automatically.
  const isSearching = searchValue.trim().length > 0

  const filtered = useMemo(() => {
    return HELP_MODULES.filter(m => {
      if (!matchesSearch(m, searchValue.trim())) return false
      if (category !== 'all' && m.category !== category) return false
      return true
    })
  }, [searchValue, category])

  const grouped = useMemo(() => {
    const buckets: Record<HelpCategory, HelpModule[]> = {
      basics: [], advanced: [], integrations: [], admin: [],
    }
    filtered.forEach(m => buckets[m.category].push(m))
    return buckets
  }, [filtered])

  const activeKeys = isSearching ? filtered.map(m => m.id) : openKeys

  return (
    <section id="help-modules" style={{ marginBottom: 32, scrollMarginTop: 24 }}>
      <Title level={3} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <AppstoreOutlined style={{ color: '#007AFF' }} />
        模組索引
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        所有模組的詳細操作說明。可依分類篩選或在頂部搜尋過濾。
      </Paragraph>

      <Space wrap style={{ marginBottom: 18 }}>
        {CATEGORIES.map(c => (
          <Button
            key={c}
            size="small"
            type={category === c ? 'primary' : 'default'}
            onClick={() => setCategory(c)}
            shape="round"
          >
            {CATEGORY_LABEL[c]}
            {c !== 'all' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>
                ({HELP_MODULES.filter(m => m.category === c).length})
              </span>
            )}
          </Button>
        ))}
      </Space>

      {filtered.length === 0 ? (
        <Empty description={`沒有符合「${searchValue}」的模組`} style={{ padding: '24px 0' }} />
      ) : (
        (Object.keys(CATEGORY_META) as HelpCategory[]).map(catKey => {
          const list = grouped[catKey]
          if (!list.length) return null

          // Add anchor for admin category track
          const sectionId = catKey === 'admin' ? 'help-modules-admin' : undefined

          return (
            <div key={catKey} id={sectionId} style={{ marginBottom: 22, scrollMarginTop: 24 }}>
              <div style={{ marginBottom: 8 }}>
                <Tag color={CATEGORY_META[catKey].color} style={{ marginInlineEnd: 8 }}>
                  {CATEGORY_META[catKey].label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {CATEGORY_META[catKey].description}
                </Text>
              </div>

              <Card
                size="small"
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: '4px 8px' } }}
              >
                <Collapse
                  bordered={false}
                  ghost
                  expandIconPosition="end"
                  activeKey={activeKeys}
                  onChange={(keys) => {
                    if (!isSearching) {
                      setOpenKeys(Array.isArray(keys) ? keys as string[] : [keys as string])
                    }
                  }}
                >
                  {list.map(m => (
                    <Panel
                      key={m.id}
                      header={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: `${m.color}1a`,
                              color: m.color,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 16,
                              flex: '0 0 32px',
                            }}
                          >
                            {m.icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text strong style={{ fontSize: 15 }}>{m.title}</Text>
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>{m.summary}</Text>
                            </div>
                          </div>
                        </div>
                      }
                    >
                      <div style={{ paddingLeft: 4, paddingRight: 4 }}>{m.content()}</div>
                    </Panel>
                  ))}
                </Collapse>
              </Card>
            </div>
          )
        })
      )}
    </section>
  )
}
