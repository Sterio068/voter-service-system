import React from 'react'
import { Tag } from 'antd'

const PETITION_STATUS_ICONS: Record<string, string> = {
  waiting_external: '⏳',
  waiting_applicant: '👤',
}

const PETITION_STATUS_COLORS: Record<string, string> = {
  pending: 'orange', processing: 'blue', waiting_external: 'cyan',
  waiting_applicant: 'purple', replied: 'green', closed: 'default', cancelled: 'red',
}
const PETITION_STATUS_LABELS: Record<string, string> = {
  pending: '待處理', processing: '處理中', waiting_external: '待外部回覆',
  waiting_applicant: '待陳情人回覆', replied: '已回覆', closed: '已結案', cancelled: '已取消',
}
const DOC_STATUS_COLORS: Record<string, string> = {
  pending: 'orange', processing: 'blue', completed: 'green', archived: 'default',
}
const DOC_STATUS_LABELS: Record<string, string> = {
  pending: '待辦', processing: '處理中', completed: '已完成', archived: '已歸檔',
}
const URGENCY_COLORS: Record<string, string> = {
  normal: 'default', urgent: 'orange', critical: 'red',
}
const URGENCY_LABELS: Record<string, string> = {
  normal: '一般', urgent: '緊急', critical: '非常緊急',
}

interface Props {
  type: 'petition_status' | 'doc_status' | 'urgency'
  value: string
}
export default function StatusTag({ type, value }: Props) {
  if (type === 'petition_status') {
    const icon = PETITION_STATUS_ICONS[value] || ''
    return <Tag color={PETITION_STATUS_COLORS[value] || 'default'}>{icon}{PETITION_STATUS_LABELS[value] || value}</Tag>
  }
  if (type === 'doc_status') {
    return <Tag color={DOC_STATUS_COLORS[value] || 'default'}>{DOC_STATUS_LABELS[value] || value}</Tag>
  }
  if (type === 'urgency') {
    return <Tag color={URGENCY_COLORS[value] || 'default'}>{URGENCY_LABELS[value] || value}</Tag>
  }
  return <Tag>{value}</Tag>
}
