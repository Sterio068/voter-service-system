import React, { useState, useEffect } from 'react'
import { Table, Progress } from 'antd'
import api from '../../../utils/api'

export default function VoterActivity() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setLoading(true)
    api.get('/reports/voter-activity')
      .then(r => setData(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const maxScore = Math.max(...data.map(d => Number(d.activity_score) || 0), 1)
  return (
    <Table dataSource={data} rowKey="id" loading={loading} size="small"
      columns={[
        { title: '姓名', dataIndex: 'name', width: 100 },
        { title: '手機', dataIndex: 'mobile', width: 120 },
        { title: '陳情次數', dataIndex: 'petition_count', width: 90 },
        { title: '聯絡次數', dataIndex: 'contact_count', width: 90 },
        { title: '最後聯絡', dataIndex: 'last_contact', width: 110, render: (v: string) => v || '—' },
        { title: '活躍度', dataIndex: 'activity_score', width: 130,
          render: (v: number) => <Progress percent={Math.round(v/maxScore*100)} size="small" format={() => `${v}分`} /> },
      ]}
    />
  )
}
