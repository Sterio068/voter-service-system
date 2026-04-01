import React, { useState, useEffect } from 'react'
import { Table } from 'antd'
import api from '../../../utils/api'

export default function SatisfactionRanking({ year }: { year: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get(`/reports/satisfaction-ranking?year=${year}`)
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [year])
  return (
    <Table dataSource={data} rowKey="name" loading={loading} size="small" pagination={false}
      columns={[
        { title: '承辦人', dataIndex: 'name' },
        { title: '已評分案件', dataIndex: 'rated_count', width: 100 },
        { title: '總案件', dataIndex: 'total', width: 80 },
        { title: '平均滿意度', dataIndex: 'avg_rating', width: 120,
          render: (v: number) => <span>{'⭐'.repeat(Math.round(v || 0))} {v?.toFixed(1)}</span> },
      ]}
    />
  )
}
