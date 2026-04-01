import React, { useState, useEffect } from 'react'
import { Table, Tag, Typography, Empty } from 'antd'
import api from '../../../utils/api'
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS } from '../../../utils/constants'
import dayjs from 'dayjs'

const { Text } = Typography

interface Props {
  voterId: number
  voterData?: any
}

export default function TaskTab({ voterId }: Props) {
  const [voterTasks, setVoterTasks] = useState<any[]>([])

  useEffect(() => {
    if (voterId) {
      api.get(`/tasks?voter_id=${voterId}&pageSize=50`).then(r => setVoterTasks(r.data.data || [])).catch(() => {})
    }
  }, [voterId])

  const columns = [
    { title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: string) => <Tag color={TASK_PRIORITY_COLORS[v]}>{TASK_PRIORITY_LABELS[v] || v}</Tag> },
    { title: '標題', dataIndex: 'title' },
    { title: '截止日', dataIndex: 'due_date', width: 110,
      render: (v: string) => {
        if (!v) return '—'
        const isOverdue = dayjs(v).isBefore(dayjs(), 'day')
        return <Text type={isOverdue ? 'danger' : undefined}>{v}</Text>
      }
    },
    { title: '承辦人', dataIndex: 'assignee_name', width: 100, render: (v: string) => v || '—' },
    { title: '狀態', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={TASK_STATUS_COLORS[v]}>{TASK_STATUS_LABELS[v] || v}</Tag> },
  ]

  return (
    <Table
      rowKey="id"
      size="small"
      dataSource={voterTasks}
      pagination={{ pageSize: 10 }}
      locale={{ emptyText: <Empty description="尚無待辦事項" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      columns={columns}
    />
  )
}
