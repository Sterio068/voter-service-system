import React, { useState, useEffect } from 'react'
import { Card, Descriptions, Tag, Button, Space, Typography, Modal, Checkbox } from 'antd'
import { StarFilled } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import dayjs from 'dayjs'

const { Text } = Typography

const TAG_COLORS: Record<string, string> = {
  '樁腳': 'red', '志工': 'blue', '捐款者': 'gold', '支持者': 'green', '意見領袖': 'purple'
}

const COMMON_TOPICS = ['交通', '環境', '教育', '長照', '都更', '農業', '就業', '社福', '公共安全', '地方建設']

interface Props {
  voterId: number
  voterData?: any
}

export default function BasicTab({ voterId, voterData: voter }: Props) {
  const navigate = useNavigate()
  const [topics, setTopics] = useState<string[]>([])
  const [topicEditOpen, setTopicEditOpen] = useState(false)
  const [topicInput, setTopicInput] = useState<string[]>([])
  const [savingTopics, setSavingTopics] = useState(false)
  const [householdVoters, setHouseholdVoters] = useState<any[]>([])

  useEffect(() => {
    if (!voterId) return
    api.get(`/voters/${voterId}/topics`).then(r => setTopics(r.data.data || [])).catch(() => {})
    if (voter?.household_address) {
      api.get(`/voters?search=${encodeURIComponent(voter.household_address)}&pageSize=10`)
        .then(r => {
          const others = (r.data.data || []).filter((v: any) => v.id !== voterId)
          setHouseholdVoters(others)
        }).catch(() => {})
    }
  }, [voterId, voter?.household_address])

  const handleSaveTopics = async () => {
    setSavingTopics(true)
    try {
      await api.put(`/voters/${voterId}/topics`, { topics: topicInput })
      setTopics(topicInput)
      setTopicEditOpen(false)
    } catch {}
    finally { setSavingTopics(false) }
  }

  if (!voter) return null

  return (
    <div>
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="姓名">{voter.name}</Descriptions.Item>
        <Descriptions.Item label="性別">{voter.gender || '-'}</Descriptions.Item>
        <Descriptions.Item label="出生日期">{voter.birth_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="手機">{voter.mobile || '-'}</Descriptions.Item>
        <Descriptions.Item label="市話">{voter.phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="LINE ID">{voter.line_id || '-'}</Descriptions.Item>
        <Descriptions.Item label="電子郵件">{voter.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="選區">{voter.election_area || '-'}</Descriptions.Item>
        <Descriptions.Item label="戶籍地址" span={2}>
          {[voter.household_city, voter.household_district, voter.household_village, voter.household_address].filter(Boolean).join(' ') || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="通訊地址" span={2}>{voter.mailing_address || '-'}</Descriptions.Item>
        <Descriptions.Item label="職業">{voter.occupation || '-'}</Descriptions.Item>
        <Descriptions.Item label="服務單位">{voter.company || '-'}</Descriptions.Item>
        <Descriptions.Item label="職稱">{voter.job_title || '-'}</Descriptions.Item>
        <Descriptions.Item label="頭銜">{voter.title || '-'}</Descriptions.Item>
        <Descriptions.Item label="支持度">
          <Space size={2}>
            {[1,2,3,4,5].map(n => (
              <StarFilled key={n} style={{ fontSize: 14, color: n <= (voter.support_level || 0) ? '#faad14' : '#e8e8e8' }} />
            ))}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="標籤">
          <Space wrap>{(voter.tags || []).map((t: string) => <Tag key={t} color={TAG_COLORS[t]}>{t}</Tag>)}</Space>
        </Descriptions.Item>
        <Descriptions.Item label="備註" span={2}>{voter.note || '-'}</Descriptions.Item>
        <Descriptions.Item label="建立時間">{dayjs(voter.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        <Descriptions.Item label="更新時間">{dayjs(voter.updated_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
      </Descriptions>

      {/* 關注議題 */}
      <Card title="🏷️ 關注議題" size="small" style={{ marginTop: 16 }}
        extra={<Button size="small" onClick={() => { setTopicInput(topics); setTopicEditOpen(true) }}>編輯</Button>}>
        {topics.length > 0
          ? <Space wrap>{topics.map(t => <Tag key={t} color="blue">{t}</Tag>)}</Space>
          : <Text type="secondary">尚未設定</Text>}
      </Card>

      {/* 同住家人 */}
      {householdVoters.length > 0 && (
        <Card title="🏠 同住家人" size="small" style={{ marginTop: 16 }}>
          <Space wrap>
            {householdVoters.map(v => (
              <Tag key={v.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/voters/${v.id}`)}>
                {v.name}
              </Tag>
            ))}
          </Space>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            共 {householdVoters.length} 位選民登記於相同地址
          </div>
        </Card>
      )}

      {/* 議題編輯 Modal */}
      <Modal
        title="編輯關注議題"
        open={topicEditOpen}
        onCancel={() => setTopicEditOpen(false)}
        onOk={handleSaveTopics}
        confirmLoading={savingTopics}
        okText="儲存"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">選擇或輸入關注議題：</Text>
        </div>
        <Checkbox.Group
          options={COMMON_TOPICS}
          value={topicInput}
          onChange={vals => setTopicInput(vals as string[])}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        />
      </Modal>
    </div>
  )
}
