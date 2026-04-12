import React, { useState, useEffect } from 'react'
import {
  Card, Typography, DatePicker, Button, Form, Input, Space, message,
  Descriptions, Divider, Empty, Spin, Popconfirm, List, Tag
} from 'antd'
import { SaveOutlined, DeleteOutlined, CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

export default function DailyLogPage() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [log, setLog] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [form] = Form.useForm()

  const fetchLog = async (d: string) => {
    setLoading(true)
    try {
      const res = await api.get(`/daily-logs/${d}`)
      const data = res.data.data
      setLog(data)
      form.setFieldsValue(data)
    } catch { message.error('載入失敗') }
    finally { setLoading(false) }
  }

  const fetchRecent = async () => {
    try {
      const res = await api.get('/daily-logs')
      setRecentLogs(res.data.data || [])
    } catch {}
  }

  useEffect(() => { fetchLog(date); fetchRecent() }, [])

  const handleDateChange = (d: string) => {
    setDate(d)
    fetchLog(d)
  }

  const handleSave = async (values: any) => {
    setSaving(true)
    try {
      await api.put(`/daily-logs/${date}`, values)
      message.success('日誌已儲存')
      fetchRecent()
    } catch { message.error('儲存失敗') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/daily-logs/${date}`)
      message.success('日誌已刪除')
      setLog(null)
      form.resetFields()
      fetchRecent()
    } catch (err: any) { message.error(err.response?.data?.error || '刪除失敗') }
  }

  const prevDay = () => handleDateChange(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))
  const nextDay = () => handleDateChange(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📋 每日工作日誌</Title>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左側：日誌編輯 */}
        <Card style={{ flex: 1 }}>
          <Space style={{ marginBottom: 16 }}>
            <Button icon={<LeftOutlined />} onClick={prevDay} />
            <DatePicker
              value={dayjs(date)}
              onChange={d => d && handleDateChange(d.format('YYYY-MM-DD'))}
              allowClear={false}
              format="YYYY-MM-DD"
            />
            <Button icon={<RightOutlined />} onClick={nextDay} disabled={date >= dayjs().format('YYYY-MM-DD')} />
            <Tag icon={<CalendarOutlined />} color={date === dayjs().format('YYYY-MM-DD') ? 'blue' : 'default'}>
              {date === dayjs().format('YYYY-MM-DD') ? '今天' : dayjs(date).format('MM/DD dddd')}
            </Tag>
          </Space>

          {loading ? <Spin /> : (
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Form.Item name="new_cases_summary" label="新增案件摘要">
                <TextArea rows={2} placeholder="今日新增陳情、陳情件數等..." />
              </Form.Item>
              <Form.Item name="completed_summary" label="完成事項">
                <TextArea rows={2} placeholder="今日結案、聯絡人次等..." />
              </Form.Item>
              <Form.Item name="highlights" label="重要事項/亮點">
                <TextArea rows={3} placeholder="今日重要事件、突破、成果..." />
              </Form.Item>
              <Form.Item name="pending_handover" label="待交接事項">
                <TextArea rows={3} placeholder="尚未完成、需移交他人處理的事項..." />
              </Form.Item>
              <Form.Item name="director_note" label="主任備註">
                <TextArea rows={2} placeholder="主任/督導補充說明..." />
              </Form.Item>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Space>
                  <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>
                    儲存日誌
                  </Button>
                </Space>
                {log?.id && (
                  <Popconfirm title="確定刪除此日誌？" onConfirm={handleDelete}>
                    <Button danger icon={<DeleteOutlined />}>刪除</Button>
                  </Popconfirm>
                )}
              </div>
            </Form>
          )}
        </Card>

        {/* 右側：最近日誌列表 */}
        <Card title="最近日誌" style={{ width: 260 }}>
          {recentLogs.length === 0
            ? <Empty description="尚無記錄" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            : <List
                size="small"
                dataSource={recentLogs}
                renderItem={(item: any) => (
                  <List.Item
                    style={{ cursor: 'pointer', padding: '6px 0' }}
                    onClick={() => handleDateChange(item.log_date)}
                  >
                    <Space direction="vertical" size={0}>
                      <Text strong style={{ color: item.log_date === date ? '#1677ff' : undefined }}>
                        {item.log_date}
                      </Text>
                      {item.highlights && (
                        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                          {item.highlights.slice(0, 30)}
                        </Text>
                      )}
                      {item.updated_by_name && (
                        <Text type="secondary" style={{ fontSize: 11 }}>by {item.updated_by_name}</Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
          }
        </Card>
      </div>
    </div>
  )
}
