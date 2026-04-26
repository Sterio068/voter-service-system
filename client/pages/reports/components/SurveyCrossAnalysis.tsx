import React, { useState, useEffect } from 'react'
import { Table, Select, Space, Typography, Tag, Empty } from 'antd'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import api from '../../../utils/api'

const { Title, Text } = Typography

export default function SurveyCrossAnalysis() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/reports/survey-cross')
      .then(r => { setSurveys(r.data.data?.surveys || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setLoading(true)
    api.get(`/reports/survey-cross?survey_id=${selectedId}`)
      .then(r => setDetail(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedId])

  const chartData = (detail?.byDistrict || []).map((d: any) => ({ district: d.district, 回應數: d.count }))

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Text>選擇問卷：</Text>
        <Select
          placeholder="請選擇問卷"
          style={{ width: 260 }}
          value={selectedId || undefined}
          onChange={setSelectedId}
          loading={loading && surveys.length === 0}
          allowClear
          onClear={() => setSelectedId(null)}
        >
          {surveys.map(s => (
            <Select.Option key={s.id} value={s.id}>
              {s.title} ({s.response_count} 份)
            </Select.Option>
          ))}
        </Select>
      </Space>
      {surveys.length === 0 && !loading && <Empty description="尚無問卷資料" />}
      {!selectedId && surveys.length > 0 && (
        <Table
          dataSource={surveys} rowKey="id" size="small"
          columns={[
            { title: '問卷名稱', dataIndex: 'title' },
            { title: '建立時間', dataIndex: 'created_at', width: 150 },
            { title: '回應份數', dataIndex: 'response_count', width: 90, render: (v: number) => <Tag color="blue">{v}</Tag> },
          ]}
          pagination={false}
        />
      )}
      {selectedId && detail && (
        chartData.length === 0
          ? <Empty description="此問卷尚無回應資料" />
          : (
            <>
              <Title level={5}>{detail.survey?.title} — 選區分佈</Title>
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="district" width={100} />
                  <Tooltip />
                  <Bar dataKey="回應數" fill="#007AFF">
                    <LabelList dataKey="回應數" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )
      )}
    </div>
  )
}
