// Staff handover page - transfer all cases when employee leaves

import React, { useState, useEffect } from 'react'
import { Card, Select, Button, Table, Statistic, Row, Col, Modal, Alert, message } from 'antd'
import { SwapOutlined, WarningOutlined } from '@ant-design/icons'
import api from '../../utils/api'

export default function HandoverPage() {
  const [users, setUsers] = useState<any[]>([])
  const [sourceUser, setSourceUser] = useState<number | null>(null)
  const [targetUser, setTargetUser] = useState<number | null>(null)
  const [preview, setPreview] = useState<{ petitions: number; tasks: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    const r = await api.get('/admin/users')
    if (r.data.success) setUsers(r.data.data || r.data.users || [])
  }

  const loadPreview = async (userId: number) => {
    // Count open petitions and tasks for this user
    const [p, t] = await Promise.all([
      api.get(`/petitions?assignee_id=${userId}&pageSize=1`),
      api.get(`/tasks?assignee_id=${userId}&pageSize=1`),
    ])
    setPreview({ petitions: p.data.total || 0, tasks: t.data.total || 0 })
  }

  const handleTransfer = async () => {
    if (!sourceUser || !targetUser) return
    setLoading(true)
    try {
      const r = await api.post(`/admin/users/${sourceUser}/transfer`, { transfer_to_user_id: targetUser })
      const d = r.data
      if (d.success) {
        message.success(`交接完成：${d.data?.petitions_transferred || 0} 件陳情、${d.data?.tasks_transferred || 0} 件待辦已轉移`)
        setConfirmOpen(false)
        setPreview(null)
        setSourceUser(null)
      } else {
        message.error(d.error?.message || d.error || '交接失敗')
      }
    } catch { message.error('交接失敗') }
    setLoading(false)
  }

  return (
    <div style={{ padding: 24 }}>
      <Card title="員工離職交接" extra={<WarningOutlined style={{ color: '#ff4d4f' }} />}>
        <Alert message="此功能將批量轉移員工的未結案件與待辦事項，請謹慎操作" type="warning" showIcon style={{ marginBottom: 16 }} />
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={10}>
            <div style={{ marginBottom: 8 }}>離職員工</div>
            <Select placeholder="選擇離職員工" style={{ width: '100%' }} onChange={(v) => { setSourceUser(v); loadPreview(v) }} options={users.map(u => ({ value: u.id, label: u.name }))} />
          </Col>
          <Col span={4} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <SwapOutlined style={{ fontSize: 24, color: '#1890ff', paddingBottom: 8 }} />
          </Col>
          <Col span={10}>
            <div style={{ marginBottom: 8 }}>繼承員工</div>
            <Select placeholder="選擇繼承員工" style={{ width: '100%' }} onChange={setTargetUser} options={users.filter(u => u.id !== sourceUser).map(u => ({ value: u.id, label: u.name }))} />
          </Col>
        </Row>
        {preview && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}><Statistic title="待轉移陳情（未結案）" value={preview.petitions} suffix="件" /></Col>
            <Col span={12}><Statistic title="待轉移待辦" value={preview.tasks} suffix="件" /></Col>
          </Row>
        )}
        <Button type="primary" danger disabled={!sourceUser || !targetUser} onClick={() => setConfirmOpen(true)}>執行交接</Button>
      </Card>
      <Modal title="確認交接" open={confirmOpen} onOk={handleTransfer} onCancel={() => setConfirmOpen(false)} confirmLoading={loading} okText="確認執行" okButtonProps={{ danger: true }}>
        <p>確定要將所有未結案件從 <strong>{users.find(u => u.id === sourceUser)?.name}</strong> 轉移給 <strong>{users.find(u => u.id === targetUser)?.name}</strong> 嗎？</p>
        <p>此操作會轉移 {preview?.petitions} 件陳情 和 {preview?.tasks} 件待辦，無法復原。</p>
      </Modal>
    </div>
  )
}
