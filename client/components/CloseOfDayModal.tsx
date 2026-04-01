import React, { useState } from 'react'
import { Modal, Button, List, Tag, Typography, Space, Spin } from 'antd'
import { CheckSquareOutlined } from '@ant-design/icons'
import api from '../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface CloseOfDaySummary {
  incomplete_tasks: any[]
  no_result_contacts: any[]
  incomplete_petitions: any[]
  today_stats: { new_petitions: number; closed: number; contacts: number }
}

export default function CloseOfDayModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<CloseOfDaySummary | null>(null)

  const loadSummary = async () => {
    setLoading(true)
    const today = dayjs().format('YYYY-MM-DD')
    try {
      const [tasks, contacts, petitions, weeklyRes] = await Promise.allSettled([
        api.get(`/tasks?status=pending,in_progress&pageSize=20`),
        api.get(`/contact-records?page=1&pageSize=20`),
        api.get(`/petitions?page=1&pageSize=10&start_date=${today}&end_date=${today}`),
        api.get(`/reports/weekly?start_date=${today}`),
      ])
      setSummary({
        incomplete_tasks: (tasks.status === 'fulfilled' ? tasks.value.data.data : []).filter((t: any) => {
          const d = t.due_date
          return d && d <= today
        }).slice(0, 5),
        no_result_contacts: (contacts.status === 'fulfilled' ? contacts.value.data.data : []).filter((c: any) => !c.result_type && c.contact_date === today).slice(0, 5),
        incomplete_petitions: (petitions.status === 'fulfilled' ? petitions.value.data.data : []).filter((p: any) => !p.category).slice(0, 5),
        today_stats: weeklyRes.status === 'fulfilled' ? { new_petitions: weeklyRes.value.data.data.new_petitions, closed: weeklyRes.value.data.data.closed, contacts: weeklyRes.value.data.data.contacts } : { new_petitions: 0, closed: 0, contacts: 0 }
      })
    } catch {}
    setLoading(false)
  }

  const handleOpen = () => {
    setOpen(true)
    loadSummary()
  }

  return (
    <>
      <Button icon={<CheckSquareOutlined />} onClick={handleOpen} style={{ marginLeft: 8 }}>
        下班收尾
      </Button>
      <Modal title="🌙 下班前收尾" open={open} onCancel={() => setOpen(false)} footer={null} width={560}>
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : summary && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: 12 }}>
              <Text strong>今日成果 🎉</Text>
              <Space size={16} style={{ marginTop: 8, display: 'block' }}>
                <Tag color="green">新案 {summary.today_stats.new_petitions} 件</Tag>
                <Tag color="blue">結案 {summary.today_stats.closed} 件</Tag>
                <Tag color="purple">聯絡 {summary.today_stats.contacts} 人次</Tag>
              </Space>
            </div>
            {summary.incomplete_tasks.length > 0 && (
              <div>
                <Text strong style={{ color: '#ff4d4f' }}>⚠️ 未完成的今日待辦 ({summary.incomplete_tasks.length})</Text>
                <List size="small" dataSource={summary.incomplete_tasks} renderItem={(t: any) => (
                  <List.Item><Text style={{ fontSize: 12 }}>{t.title}</Text></List.Item>
                )} />
              </div>
            )}
            {summary.no_result_contacts.length > 0 && (
              <div>
                <Text strong style={{ color: '#fa8c16' }}>📞 今日未填寫結果的聯絡記錄 ({summary.no_result_contacts.length})</Text>
                <List size="small" dataSource={summary.no_result_contacts} renderItem={(c: any) => (
                  <List.Item><Text style={{ fontSize: 12 }}>{c.voter_name} — {c.content?.slice(0,20)}</Text></List.Item>
                )} />
              </div>
            )}
            {summary.incomplete_tasks.length === 0 && summary.no_result_contacts.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#52c41a' }}>
                <Title level={4}>✅ 今日工作全部完成！</Title>
                <Text type="secondary">可以放心下班了</Text>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
