import React, { useState, useEffect } from 'react'
import { Card, Spin, Empty, Row, Col, Progress } from 'antd'
import api from '../../../utils/api'
import { COLORS } from '../utils'

export default function AreaHeatmap({ year }: { year: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get(`/reports/area-heatmap?year=${year}`)
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year])
  const top = data.slice(0, 20)
  const maxCount = Math.max(...top.map(d => d.count), 1)
  return (
    <div>
      {loading ? <Spin /> : top.length === 0 ? <Empty /> : (
        <Row gutter={[8, 8]}>
          {top.map((d, i) => (
            <Col xs={12} sm={8} md={6} key={i}>
              <Card size="small" style={{ borderLeft: `4px solid ${COLORS[i % COLORS.length]}` }}>
                <div style={{ fontSize: 13, fontWeight: 'bold' }}>{d.district || '未指定'}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{d.city}</div>
                <Progress percent={Math.round(d.count/maxCount*100)} size="small" format={() => `${d.count}件`} strokeColor={COLORS[i % COLORS.length]} />
                <div style={{ fontSize: 11, color: d.active_count > 0 ? '#fa8c16' : '#999' }}>進行中：{d.active_count}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
