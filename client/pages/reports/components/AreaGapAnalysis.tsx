import React, { useState, useEffect } from 'react'
import { Table, Alert, Progress, Space } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'

export default function AreaGapAnalysis() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get('/reports/area-gap')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <Alert type="info" showIcon message="選區經營缺口分析 — 聯絡率越低，代表該區需要加強經營。點擊列可查看該區選民。" style={{ marginBottom: 12 }} />
      <Table
        dataSource={data} rowKey="district" loading={loading} size="small"
        onRow={(record) => ({ onClick: () => navigate(`/voters?addr_district=${encodeURIComponent(record.district)}`) })}
        rowClassName={() => 'cursor-pointer'}
        columns={[
          { title: '鄉鎮區', dataIndex: 'district' },
          { title: '已建檔選民', dataIndex: 'total_voters', width: 100 },
          { title: '近90天聯絡', dataIndex: 'contacted_90d', width: 110 },
          { title: '陳情次數', dataIndex: 'petition_count', width: 90 },
          { title: '活動參與', dataIndex: 'event_participants', width: 90 },
          { title: '聯絡率', dataIndex: 'contact_rate', width: 160,
            sorter: (a: any, b: any) => (a.contact_rate || 0) - (b.contact_rate || 0),
            defaultSortOrder: 'ascend' as const,
            render: (v: number) => (
              <Space size={4}>
                <Progress percent={v || 0} size="small" style={{ width: 100 }}
                  strokeColor={v < 10 ? '#ff4d4f' : v < 30 ? '#fa8c16' : '#52c41a'} />
                <span>{v || 0}%</span>
              </Space>
            )},
        ]}
        pagination={{ pageSize: 20 }}
      />
    </div>
  )
}
