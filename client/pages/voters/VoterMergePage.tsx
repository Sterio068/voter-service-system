import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Typography, Modal, Select, message, Alert, Descriptions } from 'antd'
import { MergeCellsOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import PageScaffold from '../../components/ui/PageScaffold'

const { Text } = Typography

type DuplicatePair = {
  id1: number
  id2: number
  name1: string
  name2: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

type MergePreview = {
  petitions: number
  contacts: number
  tasks: number
  engagements: number
  activity_history: number
  event_participants: number
  survey_responses: number
  notification_recipients: number
  group_members: number
  referrers: number
  source_name: string
  target_name: string
}

const previewItems: Array<{
  key: keyof MergePreview
  label: string
  unit: string
}> = [
  { key: 'petitions', label: '將轉移陳情', unit: '件' },
  { key: 'contacts', label: '將轉移聯絡記錄', unit: '筆' },
  { key: 'tasks', label: '將轉移待辦', unit: '項' },
  { key: 'engagements', label: '將整併參與度', unit: '筆' },
  { key: 'activity_history', label: '將轉移活躍歷程', unit: '筆' },
  { key: 'event_participants', label: '將轉移活動參與', unit: '筆' },
  { key: 'survey_responses', label: '將轉移問卷回覆', unit: '筆' },
  { key: 'notification_recipients', label: '將轉移通知收件', unit: '筆' },
  { key: 'group_members', label: '將轉移團體成員', unit: '筆' },
  { key: 'referrers', label: '將轉移轉介紹關聯', unit: '筆' },
]

export default function VoterMergePage() {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [selectedPair, setSelectedPair] = useState<DuplicatePair | null>(null)
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [merging, setMerging] = useState(false)

  useEffect(() => { fetchDuplicates() }, [])

  useEffect(() => {
    if (!mergeOpen || !selectedPair || !targetId) return
    void fetchPreview(selectedPair, targetId)
  }, [mergeOpen, selectedPair, targetId])

  const fetchDuplicates = async () => {
    setLoading(true)
    try { const r = await api.get('/voters/duplicates'); setDuplicates(r.data.data || []) }
    catch { message.error('載入失敗') }
    setLoading(false)
  }

  const fetchPreview = async (pair: DuplicatePair, nextTargetId: number) => {
    const sourceId = nextTargetId === pair.id1 ? pair.id2 : pair.id1
    setPreviewLoading(true)
    try {
      const r = await api.post(`/voters/${nextTargetId}/merge`, { merge_from_id: sourceId }, { params: { preview: 'true' } })
      setPreview(r.data.preview)
    } catch {
      setPreview(null)
      message.error('無法載入合併預覽')
    } finally {
      setPreviewLoading(false)
    }
  }

  const openMerge = async (pair: DuplicatePair) => {
    setSelectedPair(pair)
    setPreview(null)
    setTargetId(pair.id1)
    setMergeOpen(true)
  }

  const handleMerge = async () => {
    if (!selectedPair || !targetId) return
    const sourceId = targetId === selectedPair.id1 ? selectedPair.id2 : selectedPair.id1
    setMerging(true)
    try {
      const response = await api.post(`/voters/${targetId}/merge`, { merge_from_id: sourceId })
      const transferred = response.data?.transferred as Partial<MergePreview> | undefined
      const summary = transferred
        ? previewItems
            .filter((item) => Number(transferred[item.key] || 0) > 0)
            .slice(0, 4)
            .map((item) => `${item.label.replace('將', '').replace('整併', '')}${transferred[item.key] || 0}${item.unit}`)
            .join('、')
        : ''
      message.success(summary ? `合併完成：${summary}` : '合併完成')
      setMergeOpen(false)
      setPreview(null)
      setSelectedPair(null)
      fetchDuplicates()
    } catch (err: any) { message.error(err.response?.data?.error || '合併失敗') }
    setMerging(false)
  }

  const confColor = { high: 'red', medium: 'orange', low: 'default' }

  const columns = [
    { title: '相似度', dataIndex: 'confidence', width: 80, render: (v: string) => <Tag color={(confColor as any)[v]}>{v === 'high' ? '高' : '中'}</Tag> },
    { title: '重複原因', dataIndex: 'reason', width: 120 },
    { title: '選民 A', render: (_: unknown, r: DuplicatePair) => `#${r.id1} ${r.name1}` },
    { title: '選民 B', render: (_: unknown, r: DuplicatePair) => `#${r.id2} ${r.name2}` },
    { title: '操作', width: 80, render: (_: unknown, r: DuplicatePair) => (
      <Button size="small" icon={<MergeCellsOutlined />} onClick={() => openMerge(r)}>合併</Button>
    )},
  ]

  return (
    <PageScaffold
      eyebrow="Data Hygiene"
      title="選民合併"
      titleLevel={4}
      variant="compact"
      description="掃描疑似重複選民，合併互動紀錄並降低資料碎片。"
      actions={<Button onClick={fetchDuplicates}>重新掃描</Button>}
    >
      <Alert type="warning" showIcon message={`發現 ${duplicates.length} 組疑似重複選民`} style={{ marginBottom: 16 }} />
      <Card>
        <Table columns={columns} dataSource={duplicates} rowKey={(r) => `${r.id1}-${r.id2}`} loading={loading} size="small" />
      </Card>
      <Modal title="合併選民" open={mergeOpen} onCancel={() => setMergeOpen(false)}
        onOk={handleMerge} okText="確認合併" confirmLoading={merging} okButtonProps={{ danger: true }}>
        {selectedPair && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="info" message="請選擇「保留」的主選民，另一位的資料將合併至主選民後刪除。" />
            <div>
              <Text strong>保留為主選民：</Text>
              <Select value={targetId} onChange={setTargetId} style={{ width: '100%', marginTop: 8 }}>
                <Select.Option value={selectedPair.id1}>#{selectedPair.id1} {selectedPair.name1}</Select.Option>
                <Select.Option value={selectedPair.id2}>#{selectedPair.id2} {selectedPair.name2}</Select.Option>
              </Select>
            </div>
            <Alert
              type="warning"
              showIcon
              message={targetId === selectedPair.id1
                ? `將保留 #${selectedPair.id1} ${selectedPair.name1}`
                : `將保留 #${selectedPair.id2} ${selectedPair.name2}`}
              description={targetId === selectedPair.id1
                ? `#${selectedPair.id2} ${selectedPair.name2} 的互動資料會整併進主選民。`
                : `#${selectedPair.id1} ${selectedPair.name1} 的互動資料會整併進主選民。`}
            />
            {previewLoading ? (
              <Descriptions size="small" bordered column={2} />
            ) : preview && (
              <Descriptions size="small" bordered column={2}>
                {previewItems.map((item) => (
                  <Descriptions.Item key={item.key} label={item.label}>
                    {preview[item.key]} {item.unit}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
          </Space>
        )}
      </Modal>
    </PageScaffold>
  )
}
