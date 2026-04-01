import React, { useState, useEffect } from 'react'
import { Modal, Input, List, Tag, Typography, Space, Spin, Tabs, Badge } from 'antd'
import { SearchOutlined, UserOutlined, FileTextOutlined, CalendarOutlined, CheckSquareOutlined, FileOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useDebounce } from '../hooks/useDebounce'

const { Text } = Typography

interface SearchResult {
  type: 'voter' | 'petition' | 'task' | 'document' | 'schedule'
  id: number
  title: string
  subtitle: string
  path: string
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  voter: <UserOutlined />,
  petition: <FileTextOutlined />,
  task: <CheckSquareOutlined />,
  document: <FileOutlined />,
  schedule: <CalendarOutlined />,
}
const TYPE_COLOR: Record<string, string> = {
  voter: 'blue', petition: 'green', task: 'orange', document: 'cyan', schedule: 'purple',
}
const TYPE_LABEL: Record<string, string> = {
  voter: '選民', petition: '陳情', task: '待辦', document: '文件', schedule: '行程',
}
const TYPE_PATH: Record<string, (item: any) => string> = {
  voter: (item) => `/voters/${item.id}`,
  petition: (item) => `/petitions/${item.id}`,
  task: () => `/tasks`,
  document: () => `/documents`,
  schedule: () => `/schedules`,
}

function mapUnifiedResult(item: any): SearchResult {
  return {
    type: item.type,
    id: item.id,
    title: item.title || item.name || `#${item.id}`,
    subtitle: item.subtitle || item.description || '',
    path: TYPE_PATH[item.type]?.(item) || '/',
  }
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 300)

  // Listen for Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 1) { setResults([]); return }
    setLoading(true)

    // Try unified search endpoint first, fall back to legacy behavior
    api.get(`/search?q=${encodeURIComponent(debouncedQuery)}&types=voter,petition,task,document`)
      .then(res => {
        const unified: SearchResult[] = (res.data.data || []).map(mapUnifiedResult)
        setResults(unified)
      })
      .catch(() => {
        // Fallback: legacy separate calls
        Promise.allSettled([
          api.get(`/voters?search=${encodeURIComponent(debouncedQuery)}&pageSize=5`),
          api.get(`/petitions?search=${encodeURIComponent(debouncedQuery)}&pageSize=5`),
        ]).then(([votersRes, petitionsRes]) => {
          const combined: SearchResult[] = []
          if (votersRes.status === 'fulfilled') {
            (votersRes.value.data.data || []).forEach((v: any) => combined.push({
              type: 'voter', id: v.id, title: v.name,
              subtitle: v.mobile || v.household_district || '',
              path: `/voters/${v.id}`,
            }))
          }
          if (petitionsRes.status === 'fulfilled') {
            (petitionsRes.value.data.data || []).forEach((p: any) => combined.push({
              type: 'petition', id: p.id,
              title: p.case_number || `陳情#${p.id}`,
              subtitle: `${p.voter_name || '匿名'} — ${p.content?.slice(0, 20) || ''}`,
              path: `/petitions`,
            }))
          }
          setResults(combined)
        })
      })
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  const handleSelect = (item: SearchResult) => {
    navigate(item.path)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const handleClose = () => {
    setOpen(false)
    setQuery('')
    setResults([])
    setActiveTab('all')
  }

  const resultsByType = (type: string) =>
    type === 'all' ? results : results.filter(r => r.type === type)

  const countByType = (type: string) => resultsByType(type).length

  // Up to 5 per type in "all" tab
  const allTabResults = (() => {
    const seen: Record<string, number> = {}
    return results.filter(r => {
      seen[r.type] = (seen[r.type] || 0) + 1
      return seen[r.type] <= 5
    })
  })()

  const renderResultList = (items: SearchResult[]) => (
    <List
      style={{ marginTop: 8 }}
      dataSource={items}
      renderItem={item => (
        <List.Item
          style={{ cursor: 'pointer', padding: '8px 4px', borderRadius: 4 }}
          onClick={() => handleSelect(item)}
          onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Space>
            <Tag color={TYPE_COLOR[item.type]} icon={TYPE_ICON[item.type]}>{TYPE_LABEL[item.type] || item.type}</Tag>
            <div>
              <Text strong style={{ fontSize: 13 }}>{item.title}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>{item.subtitle}</Text>
            </div>
          </Space>
        </List.Item>
      )}
    />
  )

  const tabItems = [
    { key: 'all', label: <Badge count={results.length} size="small" offset={[6, 0]}>全部</Badge> },
    { key: 'voter', label: <Badge count={countByType('voter')} size="small" offset={[6, 0]}>選民</Badge> },
    { key: 'petition', label: <Badge count={countByType('petition')} size="small" offset={[6, 0]}>陳情</Badge> },
    { key: 'task', label: <Badge count={countByType('task')} size="small" offset={[6, 0]}>待辦</Badge> },
    { key: 'document', label: <Badge count={countByType('document')} size="small" offset={[6, 0]}>文件</Badge> },
  ]

  const currentResults = activeTab === 'all' ? allTabResults : resultsByType(activeTab)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          background: '#f5f5f5',
          border: '1px solid transparent',
          borderRadius: 8,
          padding: '5px 12px',
          minWidth: 220,
          transition: 'background 0.15s, border-color 0.15s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = '#ebebeb'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = '#d9d9d9'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = '#f5f5f5'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'
        }}
      >
        <SearchOutlined style={{ color: '#8c8c8c', fontSize: 14 }} />
        <span style={{ color: '#aaa', fontSize: 13, flex: 1 }}>搜尋...</span>
        <kbd style={{
          fontSize: 10, background: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: 4, padding: '1px 6px',
          color: '#aaa', lineHeight: '16px',
          boxShadow: '0 1px 0 rgba(0,0,0,.08)',
          fontFamily: 'system-ui',
        }}>⌘K</kbd>
      </div>
      <Modal
        open={open}
        onCancel={handleClose}
        footer={null}
        width={600}
        title={null}
        closable={false}
        styles={{
          body: { padding: 0 },
          content: { padding: 0, borderRadius: 12, overflow: 'hidden' },
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Input
            autoFocus
            size="large"
            placeholder="搜尋選民、陳情案號、待辦、文件..."
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            variant="borderless"
            value={query}
            onChange={e => setQuery(e.target.value)}
            suffix={query.length === 0 && <kbd style={{ fontSize: 10, background: '#f5f5f5', border: '1px solid #e8e8e8', borderRadius: 4, padding: '1px 6px', color: '#ccc' }}>ESC</kbd>}
            onKeyDown={e => { if (e.key === 'Escape') handleClose() }}
            style={{ fontSize: 15 }}
          />
        </div>
        <div style={{ padding: '0 4px' }}>
          {loading && <div style={{ textAlign: 'center', padding: 24 }}><Spin size="small" /></div>}
          {!loading && results.length > 0 && (
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              size="small"
              style={{ padding: '0 12px' }}
              items={tabItems.map(tab => ({
                ...tab,
                children: currentResults.length > 0
                  ? renderResultList(currentResults)
                  : <div style={{ textAlign: 'center', padding: 24, color: '#bbb' }}>此類別無結果</div>,
              }))}
            />
          )}
          {!loading && query.length > 0 && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#bbb' }}>
              <SearchOutlined style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
              找不到「{query}」的相關結果
            </div>
          )}
          {query.length === 0 && (
            <div style={{ padding: '16px 20px 20px', color: '#bbb', fontSize: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 500, color: '#999' }}>快捷搜尋範圍</div>
              <Space wrap size={6}>
                {[['選民資料','blue'],['陳情案件','green'],['待辦事項','orange'],['公文紀錄','cyan']].map(([label, color]) => (
                  <Tag key={label} color={color} style={{ margin: 0 }}>{label}</Tag>
                ))}
              </Space>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
