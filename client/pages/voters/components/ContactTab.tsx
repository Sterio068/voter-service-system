import React, { useState, useEffect } from 'react'
import { Table, Empty, Button, Drawer, Form, Input, Select, DatePicker, Space, Tag, message } from 'antd'
import api from '../../../utils/api'
import dayjs from 'dayjs'

const { Option } = Select

const RESULT_TYPE_LABELS: Record<string, string> = {
  no_answer: '未接',
  contacted: '已聯絡',
  pending_reply: '待回覆',
  unreachable: '無法聯絡',
  completed: '已完成',
}
const RESULT_TYPE_COLORS: Record<string, string> = {
  no_answer: 'orange',
  contacted: 'blue',
  pending_reply: 'purple',
  unreachable: 'red',
  completed: 'green',
}

interface Props {
  voterId: number
  voterData?: any
}

export default function ContactTab({ voterId, voterData: voter }: Props) {
  const [contacts, setContacts] = useState<any[]>([])
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [contactForm] = Form.useForm()

  const loadContacts = async () => {
    try {
      const res = await api.get(`/voters/${voterId}/contacts`)
      setContacts(res.data.data || [])
    } catch {}
  }

  useEffect(() => {
    if (voterId) loadContacts()
  }, [voterId])

  const handleAddContact = async (values: any) => {
    setSavingContact(true)
    try {
      const payload = {
        ...values,
        contact_date: values.contact_date ? dayjs(values.contact_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        follow_up_date: values.follow_up_date ? dayjs(values.follow_up_date).format('YYYY-MM-DD') : undefined,
      }
      await api.post(`/voters/${voterId}/contacts`, payload)

      // Auto-create follow-up task if needed
      const needsFollowUp = ['pending_reply', 'no_answer', 'unreachable'].includes(values.result_type)
      if (needsFollowUp && values.follow_up_date) {
        await api.post('/tasks', {
          title: `追蹤聯絡：${voter?.name}`,
          related_voter_id: voterId,
          due_date: dayjs(values.follow_up_date).format('YYYY-MM-DD'),
          priority: 'normal',
        }).catch(() => {}) // non-blocking
        message.success('聯絡記錄已新增，追蹤待辦已自動建立')
      } else {
        message.success('聯絡記錄已新增')
      }

      setContactDrawerOpen(false)
      contactForm.resetFields()
      loadContacts()
    } catch (err: any) {
      message.error(err.response?.data?.error || '新增失敗')
    } finally {
      setSavingContact(false)
    }
  }

  const contactColumns = [
    { title: '日期', dataIndex: 'contact_date', width: 110, render: (d: string) => d ? dayjs(d).format('YYYY-MM-DD') : '—' },
    { title: '方式', dataIndex: 'contact_method', width: 80 },
    { title: '聯絡結果', dataIndex: 'result_type', width: 100, render: (v: string) =>
      v ? <Tag color={RESULT_TYPE_COLORS[v]}>{RESULT_TYPE_LABELS[v] || v}</Tag> : '—' },
    { title: '追蹤日期', dataIndex: 'follow_up_date', width: 110, render: (d: string) => d || '—' },
    { title: '摘要', dataIndex: 'summary', ellipsis: true },
    { title: '承辦人', dataIndex: 'user_name', width: 80 },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button type="primary" size="small" onClick={() => setContactDrawerOpen(true)}>新增聯絡</Button>
      </div>
      <Table
        columns={contactColumns}
        dataSource={contacts}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="尚無聯絡記錄" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />

      <Drawer
        title="新增聯絡記錄"
        open={contactDrawerOpen}
        onClose={() => { setContactDrawerOpen(false); contactForm.resetFields() }}
        width={480}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setContactDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={savingContact} onClick={() => contactForm.submit()}>儲存</Button>
          </Space>
        }
      >
        <Form form={contactForm} layout="vertical" onFinish={handleAddContact}>
          <Form.Item name="contact_date" label="聯絡日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="contact_method" label="聯絡方式">
            <Select allowClear>
              <Option value="phone">電話</Option>
              <Option value="line">LINE</Option>
              <Option value="visit">拜訪</Option>
              <Option value="email">電子郵件</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="result_type" label="聯絡結果">
            <Select allowClear>
              <Option value="no_answer">未接</Option>
              <Option value="contacted">已聯絡</Option>
              <Option value="pending_reply">待回覆</Option>
              <Option value="unreachable">無法聯絡</Option>
              <Option value="completed">已完成</Option>
            </Select>
          </Form.Item>
          <Form.Item name="follow_up_date" label="追蹤日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
