import React, { useState, useEffect } from 'react'
import { Card, Row, Col, Alert, Space, Tag, Typography, Progress, Spin, Empty } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'

const { Text } = Typography

export default function AssigneeLoadIndex() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    setLoading(true)
    api.get('/reports/assignee-load')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const loadColor = (idx: number) => idx >= 80 ? '#ff4d4f' : idx >= 50 ? '#fa8c16' : '#52c41a'
  return (
    <div>
      <Alert type="info" showIcon message="負載指數以當前最高負載者為 100% 基準，進行相對比較。點擊卡片查看該人員待辦。" style={{ marginBottom: 12 }} />
      {loading ? <Spin /> : data.length === 0 ? <Empty /> : (
        <Row gutter={[8, 8]}>
          {data.map((u: any) => (
            <Col xs={24} sm={12} md={8} key={u.id}>
              <Card size="small" style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks?assignee_id=${u.id}`)}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>{u.name}</Text>
                  <Space size={4}>
                    <Tag color="blue">{u.open_petitions} 陳情</Tag>
                    <Tag color="purple">{u.open_tasks} 待辦</Tag>
                  </Space>
                </Space>
                <Progress
                  percent={u.load_index}
                  strokeColor={loadColor(u.load_index)}
                  format={p => `${p}%`}
                  style={{ marginTop: 6 }}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
