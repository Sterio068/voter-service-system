import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Typography, Modal, Select, message, Alert, Descriptions } from 'antd'
import { MergeCellsOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

export default function VoterMergePage() {
  const [duplicates, setDuplicates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [selectedPair, setSelectedPair] = useState<any>(null)
  const [preview, setPreview] = useState<any>(null)
  const [targetId, setTargetId] = useState<number | null>(null)
  const [merging, setMerging] = useState(false)

  useEffect(() => { fetchDuplicates() }, [])

  const fetchDuplicates = async () => {
    setLoading(true)
    try { const r = await api.get('/voters/duplicates'); setDuplicates(r.data.data || []) }
    catch { message.error('載入失敗') }
    setLoading(false)
  }

  const openMerge = async (pair: any) => {
    setSelectedPair(pair)
    setTargetId(pair.id1)
    // Get preview
    try {
      const sourceId = pair.id1 === targetId ? pair.id2 : pair.id1
      const r = await api.post(`/voters/${pair.id1}/merge`, { merge_from_id: pair.id2 }, { params: { preview: 'true' } })
      setPreview(r.data.preview)
    } catch {}
    setMergeOpen(true)
  }

  const handleMerge = async () => {
    if (!selectedPair || !targetId) return
    const sourceId = targetId === selectedPair.id1 ? selectedPair.id2 : selectedPair.id1
    setMerging(true)
    try {
      await api.post(`/voters/${targetId}/merge`, { merge_from_id: sourceId })
      message.success('合併完成')
      setMergeOpen(false)
      fetchDuplicates()
    } catch (err: any) { message.error(err.response?.data?.error || '合併失敗') }
    setMerging(false)
  }

  const confColor = { high: 'red', medium: 'orange', low: 'default' }

  const columns = [
    { title: '相似度', dataIndex: 'confidence', width: 80, render: (v: string) => <Tag color={(confColor as any)[v]}>{v === 'high' ? '高' : '中'}</Tag> },
    { title: '重複原因', dataIndex: 'reason', width: 120 },
    { title: '選民 A', render: (_: any, r: any) => `#${r.id1} ${r.name1}` },
    { title: '選民 B', render: (_: any, r: any) => `#${r.id2} ${r.name2}` },
    { title: '操作', width: 80, render: (_: any, r: any) => (
      <Button size="small" icon={<MergeCellsOutlined />} onClick={() => openMerge(r)}>合併</Button>
    )},
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>🔀 選民合併</Title>
        <Button onClick={fetchDuplicates}>重新掃描</Button>
      </div>
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
            {preview && (
              <Descriptions size="small" bordered>
                <Descriptions.Item label="將轉移陳情">{preview.petitions} 件</Descriptions.Item>
                <Descriptions.Item label="將轉移聯絡記錄">{preview.contacts} 筆</Descriptions.Item>
                <Descriptions.Item label="將轉移待辦">{preview.tasks} 項</Descriptions.Item>
              </Descriptions>
            )}
          </Space>
        )}
      </Modal>
    </div>
  )
}
