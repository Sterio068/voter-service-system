import React, { useState, useEffect } from 'react'
import {
  Card, Button, Space, Typography, Modal, Form, Input, DatePicker,
  Select, message, Tag, Drawer, Row, Col, InputNumber, Table, Empty
} from 'antd'
import { PlusOutlined, PrinterOutlined } from '@ant-design/icons'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import zhTW from '@fullcalendar/core/locales/zh-tw'
import api from '../../utils/api'
import { SCHEDULE_TYPE_COLORS as TYPE_COLORS, SCHEDULE_TYPE_LABELS as TYPE_LABELS } from '../../utils/constants'
import dayjs from 'dayjs'
import { useThemeStore } from '../../stores/themeStore'

const { Title } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form] = Form.useForm()
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printDays, setPrintDays] = useState(7)
  const [printStartDate, setPrintStartDate] = useState(dayjs())
  const [officeName, setOfficeName] = useState('選民服務系統')
  const [consultOpen, setConsultOpen] = useState(false)
  const { isDark } = useThemeStore()

  // F-3: Dark mode calendar CSS
  useEffect(() => {
    const calEl = document.querySelector('.fc')
    if (calEl) {
      if (isDark) calEl.classList.add('fc-dark')
      else calEl.classList.remove('fc-dark')
    }
  }, [isDark])

  useEffect(() => {
    fetchSchedules()
    api.get('/admin/settings').then(r => {
      if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
    }).catch(() => {})
  }, [])

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/schedules')
      setSchedules(res.data.data || [])
    } catch { message.error('載入行程失敗') }
  }

  const handleSave = async (values: any) => {
    try {
      const [start, end] = values.time_range
      await api.post('/schedules', {
        title: values.title,
        start_time: dayjs(start).format('YYYY-MM-DD HH:mm:00'),
        end_time: dayjs(end).format('YYYY-MM-DD HH:mm:00'),
        schedule_type: values.schedule_type,
        location: values.location,
        note: values.note,
        status: 'scheduled',
      })
      message.success('行程已建立')
      setDrawerOpen(false); form.resetFields(); fetchSchedules()
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.error(err.response.data.error)
      } else {
        message.error('建立失敗')
      }
    }
  }

  const handleEventClick = (info: any) => {
    const schedule = schedules.find(s => s.id === parseInt(info.event.id))
    setSelectedEvent(schedule)
    setDetailOpen(true)
  }

  const handleDateSelect = (info: any) => {
    form.setFieldsValue({
      time_range: [dayjs(info.start), dayjs(info.end)]
    })
    setDrawerOpen(true)
  }

  const handleCreatePetitionFromConsultation = async (consult: any) => {
    try {
      await api.post('/petitions', {
        voter_id: consult.voter_id || undefined,
        content: consult.issue_summary || `法律諮詢案件 ${consult.appointment_date || dayjs(consult.start_time).format('YYYY-MM-DD')}`,
        petition_date: consult.appointment_date || dayjs(consult.start_time).format('YYYY-MM-DD'),
        channel: '法律諮詢',
        status: 'pending',
        urgency: 'normal',
      })
      message.success('已從諮詢建立陳情案件')
    } catch { message.error('建立失敗') }
  }

  const handleDeleteSchedule = async () => {
    if (!selectedEvent) return
    try {
      await api.delete(`/schedules/${selectedEvent.id}`)
      message.success('行程已刪除')
      setDetailOpen(false)
      fetchSchedules()
    } catch { message.error('刪除失敗') }
  }

  const handlePrint = () => {
    const startDate = printStartDate.startOf('day')
    const endDate = startDate.add(printDays - 1, 'day').endOf('day')

    const filtered = schedules
      .filter(s => {
        const sStart = dayjs(s.start_time)
        return sStart.isAfter(startDate.subtract(1, 'ms')) && sStart.isBefore(endDate)
      })
      .sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())

    // Group by date
    const byDate: Record<string, any[]> = {}
    for (let i = 0; i < printDays; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD')
      byDate[date] = []
    }
    filtered.forEach(s => {
      const date = dayjs(s.start_time).format('YYYY-MM-DD')
      if (byDate[date]) byDate[date].push(s)
    })

    const dayRows = Object.entries(byDate).map(([date, items]) => {
      const weekDay = ['日','一','二','三','四','五','六'][dayjs(date).day()]
      const daySection = `
        <tr class="day-header">
          <td colspan="4">${date}（${weekDay}）</td>
        </tr>
        ${items.length === 0
          ? `<tr class="empty-row"><td colspan="4">（無行程）</td></tr>`
          : items.map(s => `
            <tr>
              <td style="width:100px">${dayjs(s.start_time).format('HH:mm')}${s.end_time ? ' – ' + dayjs(s.end_time).format('HH:mm') : ''}</td>
              <td style="width:70px">${TYPE_LABELS[s.schedule_type] || s.schedule_type || '其他'}</td>
              <td>${s.title}</td>
              <td style="width:120px">${s.location || '—'}</td>
            </tr>`).join('')
        }`
      return daySection
    }).join('')

    const w = window.open('', '_blank')
    if (!w) return message.error('無法開啟列印視窗')
    w.document.write(`<!DOCTYPE html><html lang="zh-TW"><head>
<meta charset="UTF-8"><title>${officeName} 行程表</title>
<style>
  body { font-family:'微軟正黑體','Noto Sans TC',sans-serif; font-size:10pt; margin:10mm 15mm; }
  h2 { text-align:center; margin-bottom:4px; }
  .meta { text-align:center; color:#666; font-size:9pt; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:4px 8px; border:1px solid #ddd; font-size:10pt; vertical-align:top; }
  tr.day-header td { background:#1677ff; color:#fff; font-weight:bold; font-size:11pt; padding:6px 8px; }
  tr.empty-row td { color:#999; text-align:center; font-style:italic; }
  @media print {
    @page { size: A4 portrait; margin: 10mm 15mm; }
    tr.day-header { break-before: auto; }
  }
</style></head><body>
<h2>📅 ${officeName} 行程表</h2>
<p class="meta">${startDate.format('YYYY年MM月DD日')} 起　共 ${printDays} 天　（列印日期：${dayjs().format('YYYY-MM-DD')}）</p>
<table>
  <thead>
    <tr style="background:#f5f5f5">
      <th style="width:100px">時間</th>
      <th style="width:70px">類型</th>
      <th>標題</th>
      <th style="width:120px">地點</th>
    </tr>
  </thead>
  <tbody>${dayRows}</tbody>
</table>
</body></html>`)
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
    setTimeout(() => { if (!w.closed) { w.focus(); w.print() } }, 500)
    setPrintModalOpen(false)
  }

  const calendarEvents = schedules.map(s => ({
    id: String(s.id),
    title: s.title,
    start: s.start_time,
    end: s.end_time,
    backgroundColor: TYPE_COLORS[s.schedule_type || 'other'],
    borderColor: TYPE_COLORS[s.schedule_type || 'other'],
  }))

  const todayConsults = schedules.filter(s =>
    s.schedule_type === 'consultation' &&
    dayjs(s.start_time).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD')
  )

  return (
    <div>
      <style>{`
        .fc-dark { background: #1f1f1f; color: #ccc; }
        .fc-dark .fc-toolbar-title { color: #ccc; }
        .fc-dark .fc-col-header-cell { background: #2a2a2a; color: #ccc; }
        .fc-dark .fc-daygrid-day { background: #1a1a1a; }
        .fc-dark .fc-daygrid-day-number { color: #aaa; }
        .fc-dark td, .fc-dark th { border-color: #333 !important; }
        .fc-dark .fc-button { background: #333; border-color: #444; color: #ccc; }
        .fc-dark .fc-button:hover { background: #444; }
        .fc-dark .fc-button-primary:not(:disabled).fc-button-active { background: #007AFF; border-color: #007AFF; }
      `}</style>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>📅 行程管理</Title>
        <Space>
          <Button onClick={() => setConsultOpen(true)}>今日諮詢</Button>
          <Button icon={<PrinterOutlined />} onClick={() => { setPrintStartDate(dayjs()); setPrintModalOpen(true) }}>列印行程</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>新增行程</Button>
        </Space>
      </div>

      <Card>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={zhTW}
          events={calendarEvents}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          height="auto"
          aspectRatio={1.8}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        />
      </Card>

      {/* 列印行程 Modal */}
      <Modal
        title="列印行程表"
        open={printModalOpen}
        onCancel={() => setPrintModalOpen(false)}
        onOk={handlePrint}
        okText="列印"
        width={400}
      >
        <div style={{ padding: '16px 0' }}>
          <Row gutter={[0, 16]}>
            <Col span={24}>
              <Space>
                <span>開始日期：</span>
                <DatePicker
                  value={printStartDate}
                  onChange={d => d && setPrintStartDate(d)}
                  allowClear={false}
                />
              </Space>
            </Col>
            <Col span={24}>
              <Space>
                <span>列印天數：</span>
                <InputNumber
                  min={1}
                  max={90}
                  value={printDays}
                  onChange={v => setPrintDays(v || 7)}
                  addonAfter="天"
                  style={{ width: 140 }}
                />
              </Space>
            </Col>
            <Col span={24}>
              <Space size={4}>
                {[7, 14, 30].map(d => (
                  <Button key={d} size="small" type={printDays === d ? 'primary' : 'default'} onClick={() => setPrintDays(d)}>
                    {d}天
                  </Button>
                ))}
              </Space>
            </Col>
          </Row>
          <div style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
            列印範圍：{printStartDate.format('YYYY-MM-DD')} 至 {printStartDate.add(printDays - 1, 'day').format('YYYY-MM-DD')}
          </div>
        </div>
      </Modal>

      {/* 新增行程 */}
      <Drawer title="新增行程" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}
        destroyOnClose
        footer={<Space><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>儲存</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="行程標題" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="time_range" label="時間" rules={[{ required: true }]}>
            <RangePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" minuteStep={15} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="schedule_type" label="行程類型">
                <Select allowClear>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <Option key={v} value={v}>{l}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="地點"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="備註"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>

      {/* 今日法律諮詢 */}
      <Modal title={`今日法律諮詢（${todayConsults.length} 件）`}
        open={consultOpen} onCancel={() => setConsultOpen(false)} footer={null}>
        {todayConsults.length === 0 ? (
          <Empty description="今日無諮詢排程" />
        ) : (
          <Table size="small" pagination={false} dataSource={todayConsults} rowKey="id"
            columns={[
              { title: '時間', dataIndex: 'start_time', width: 90, render: (v: string) => dayjs(v).format('HH:mm') },
              { title: '標題', dataIndex: 'title' },
              { title: '地點', dataIndex: 'location', render: (v: string) => v || '—' },
              { title: '備註', dataIndex: 'note', render: (v: string) => v || '—' },
              { title: '', width: 60, render: (_: any, r: any) => (
                <Button size="small" type="link" onClick={() => handleCreatePetitionFromConsultation(r)}>立案</Button>
              )},
            ]}
          />
        )}
      </Modal>

      {/* 行程詳情 */}
      <Modal title="行程詳情" open={detailOpen} onCancel={() => setDetailOpen(false)}
        footer={[
          <Button key="delete" danger onClick={handleDeleteSchedule}>刪除</Button>,
          <Button key="close" onClick={() => setDetailOpen(false)}>關閉</Button>,
        ]}>
        {selectedEvent && (
          <div>
            <p><strong>標題：</strong>{selectedEvent.title}</p>
            <p><strong>開始：</strong>{dayjs(selectedEvent.start_time).format('YYYY-MM-DD HH:mm')}</p>
            {selectedEvent.end_time && <p><strong>結束：</strong>{dayjs(selectedEvent.end_time).format('YYYY-MM-DD HH:mm')}</p>}
            {selectedEvent.schedule_type && <p><strong>類型：</strong><Tag>{TYPE_LABELS[selectedEvent.schedule_type]}</Tag></p>}
            {selectedEvent.location && <p><strong>地點：</strong>{selectedEvent.location}</p>}
            {selectedEvent.note && <p><strong>備註：</strong>{selectedEvent.note}</p>}
            <p><strong>狀態：</strong>{selectedEvent.status}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
