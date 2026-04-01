import React, { useState, useEffect } from 'react'
import { Table, Tag, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import api from '../../../utils/api'
import dayjs from 'dayjs'

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  processing: 'blue',
  waiting_external: 'purple',
  waiting_applicant: 'cyan',
  replied: 'green',
  closed: 'default',
  cancelled: 'red',
}
const STATUS_LABELS: Record<string, string> = {
  pending: '待處理',
  processing: '處理中',
  waiting_external: '待外部回覆',
  waiting_applicant: '待民眾補件',
  replied: '已回覆',
  closed: '已結案',
  cancelled: '已取消',
}

interface Props {
  voterId: number
  voterData?: any
}

export default function PetitionTab({ voterId }: Props) {
  const navigate = useNavigate()
  const [petitions, setPetitions] = useState<any[]>([])

  const loadPetitions = async () => {
    try {
      const res = await api.get(`/petitions?voter_id=${voterId}&pageSize=50`)
      setPetitions(res.data.data || [])
    } catch {}
  }

  useEffect(() => {
    if (voterId) loadPetitions()
  }, [voterId])

  const petitionColumns = [
    { title: '案號', dataIndex: 'case_number', render: (n: string, r: any) =>
      <Button type="link" size="small" onClick={() => navigate(`/petitions/${r.id}`)}>{n}</Button> },
    { title: '陳情類別', dataIndex: 'category' },
    { title: '狀態', dataIndex: 'status', render: (s: string) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag> },
    { title: '日期', dataIndex: 'petition_date', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
  ]

  return (
    <Table
      columns={petitionColumns}
      dataSource={petitions}
      rowKey="id"
      size="small"
      pagination={{ pageSize: 10 }}
    />
  )
}
