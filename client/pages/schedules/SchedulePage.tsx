import React, { useState, useEffect, useRef } from 'react'
import {
  Card, Button, Space, Typography, Modal, Form, Input, DatePicker,
  Select, message, Tag, Drawer, Row, Col, InputNumber, Table, Empty,
  Divider, Tabs, Statistic, Popconfirm, Alert, Checkbox, TimePicker
} from 'antd'
import { PlusOutlined, PrinterOutlined, FileWordOutlined, GiftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Document, Packer, Paragraph, Table as DocxTable, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle, PageNumber, Footer, Header, convertInchesToTwip } from 'docx'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import zhTW from '@fullcalendar/core/locales/zh-tw'
import api from '../../utils/api'
import { useDataSync } from '../../hooks/useDataSync'
import { SCHEDULE_TYPE_COLORS as TYPE_COLORS, SCHEDULE_TYPE_LABELS as TYPE_LABELS, CEREMONY_SCHEDULE_TYPES, CEREMONY_TYPE_LABELS } from '../../utils/constants'
import dayjs from 'dayjs'
import { useThemeStore } from '../../stores/themeStore'

const { Title, Text } = Typography
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
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [slotMgrOpen, setSlotMgrOpen] = useState(false)
  const [slotDate, setSlotDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [slots, setSlots] = useState<any[]>([])
  const [slotForm] = Form.useForm()
  const [addingSlot, setAddingSlot] = useState(false)
  const { isDark } = useThemeStore()

  // 團體相關 state
  const [groupList, setGroupList] = useState<any[]>([])

  // 動態行程類型（從 DB 載入）
  const [scheduleTypes, setScheduleTypes] = useState<{ code: string; name: string; color: string }[]>([])

  // 禮儀相關 state
  const [drawerScheduleType, setDrawerScheduleType] = useState<string>('')
  const [ceremonyItems, setCeremonyItems] = useState<any[]>([])
  const [giftCategories, setGiftCategories] = useState<any[]>([])
  const [vendorList, setVendorList] = useState<any[]>([])
  const [detailCeremonies, setDetailCeremonies] = useState<any[]>([])
  const [editingCeremony, setEditingCeremony] = useState<any>(null)
  const [ceremonyModalOpen, setCeremonyModalOpen] = useState(false)
  const [ceremonyForm] = Form.useForm()
  const [editingCeremonyItems, setEditingCeremonyItems] = useState<any[]>([])
  const isCeremonyType = CEREMONY_SCHEDULE_TYPES.includes(drawerScheduleType)
  const isPublicMemorial = drawerScheduleType === 'public_memorial'

  // 動態查詢顏色/名稱（DB > constants 靜態備援）
  const getTypeColor = (code: string) => scheduleTypes.find(t => t.code === code)?.color || TYPE_COLORS[code] || '#8c8c8c'
  const getTypeLabel = (code: string) => scheduleTypes.find(t => t.code === code)?.name || TYPE_LABELS[code] || code

  // F-3: Dark mode calendar CSS
  useEffect(() => {
    const calEl = document.querySelector('.fc')
    if (calEl) {
      if (isDark) calEl.classList.add('fc-dark')
      else calEl.classList.remove('fc-dark')
    }
  }, [isDark])

  // CRITICAL-006: 行程類型切換時清除不相關的子表單欄位
  useEffect(() => {
    if (!isCeremonyType) {
      form.setFieldsValue({
        ceremony_type: undefined, recipient_name: undefined,
        recipient_relation: undefined, event_date: undefined,
        is_joint: false, joint_note: undefined, ceremony_note: undefined,
      })
      setCeremonyItems([])
    }
    if (!isPublicMemorial) {
      form.setFieldsValue({
        family_ceremony_time: undefined, public_ceremony_time: undefined,
        mourning_hall_location: undefined, public_ceremony_location: undefined,
        deceased_age: undefined,
      })
    }
  }, [drawerScheduleType])

  // 跨機器即時同步
  useDataSync((events) => {
    const relevant = events.some(e => ['schedule', 'ceremony'].includes(e.target_type))
    if (relevant) fetchSchedules()
  }, [])

  useEffect(() => {
    fetchSchedules()
    api.get('/admin/settings').then(r => {
      if (r.data.data?.office_name) setOfficeName(r.data.data.office_name)
    }).catch(() => {})
    api.get('/gift-categories').then(r => setGiftCategories(r.data.data || [])).catch(() => {})
    api.get('/vendors?active=1&pageSize=200').then(r => setVendorList(r.data.data || [])).catch(() => {})
    api.get('/groups?pageSize=500').then(r => setGroupList(r.data.data || [])).catch(() => {})
    api.get('/admin/categories?type=schedule_type').then(r => {
      const types = (r.data.data || []).filter((t: any) => t.is_active !== 0)
      setScheduleTypes(types.map((t: any) => ({ code: t.code || t.name, name: t.name, color: t.color || '#8c8c8c' })))
    }).catch(() => {})
  }, [])

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/schedules')
      setSchedules(res.data.data || [])
    } catch { message.error('載入行程失敗') }
  }

  const fetchSlots = async (d: string) => {
    try {
      const res = await api.get(`/consultations/slots/manage?date=${d}`)
      setSlots(res.data.data || [])
    } catch {}
  }

  const handleAddSlot = async (values: any) => {
    setAddingSlot(true)
    try {
      await api.post('/consultations/slots', { slot_date: slotDate, slot_time: values.slot_time, max_capacity: values.max_capacity ?? 3, note: values.note })
      message.success('時段已新增')
      slotForm.resetFields()
      fetchSlots(slotDate)
    } catch (err: any) { message.error(err.response?.data?.error || '新增失敗') }
    finally { setAddingSlot(false) }
  }

  const handleDeleteSlot = async (id: number) => {
    try {
      await api.delete(`/consultations/slots/${id}`)
      message.success('時段已刪除')
      fetchSlots(slotDate)
    } catch (err: any) { message.error(err.response?.data?.error || '刪除失敗') }
  }

  const openEditDrawer = (schedule: any) => {
    setDetailOpen(false)
    setEditingScheduleId(schedule.id)
    let relatedGroupIds: number[] = []
    try { relatedGroupIds = JSON.parse(schedule.related_group_ids || '[]') } catch {}
    let fi: any = {}
    try { fi = JSON.parse(schedule.funeral_info || '{}') } catch {}
    form.setFieldsValue({
      title: schedule.title,
      time_range: [dayjs(schedule.start_time), schedule.end_time ? dayjs(schedule.end_time) : dayjs(schedule.start_time).add(1, 'hour')],
      schedule_type: schedule.schedule_type,
      location: schedule.location,
      note: schedule.note,
      related_group_ids: relatedGroupIds,
      family_ceremony_time: fi.family_ceremony_time ? dayjs(fi.family_ceremony_time, 'HH:mm') : undefined,
      public_ceremony_time: fi.public_ceremony_time ? dayjs(fi.public_ceremony_time, 'HH:mm') : undefined,
      mourning_hall_location: fi.mourning_hall_location,
      public_ceremony_location: fi.public_ceremony_location,
      deceased_age: fi.deceased_age,
    })
    setDrawerScheduleType(schedule.schedule_type || '')
    setDrawerOpen(true)
  }

  const handleSave = async (values: any) => {
    try {
      const [start, end] = values.time_range
      const funeralInfo = values.schedule_type === 'public_memorial' ? JSON.stringify({
        family_ceremony_time: values.family_ceremony_time ? dayjs(values.family_ceremony_time).format('HH:mm') : null,
        public_ceremony_time: values.public_ceremony_time ? dayjs(values.public_ceremony_time).format('HH:mm') : null,
        mourning_hall_location: values.mourning_hall_location || null,
        public_ceremony_location: values.public_ceremony_location || null,
        deceased_age: values.deceased_age || null,
      }) : null
      const payload = {
        title: values.title,
        start_time: dayjs(start).format('YYYY-MM-DD HH:mm:00'),
        end_time: dayjs(end).format('YYYY-MM-DD HH:mm:00'),
        schedule_type: values.schedule_type,
        location: values.location,
        note: values.note,
        funeral_info: funeralInfo,
        related_group_ids: values.related_group_ids?.length ? JSON.stringify(values.related_group_ids) : null,
      }
      if (editingScheduleId) {
        // 編輯模式
        await api.put(`/schedules/${editingScheduleId}`, payload)
        message.success('行程已更新')
      } else {
        // 新增模式
        const res = await api.post('/schedules', { ...payload, status: 'scheduled' })
        const newScheduleId = res.data?.id || res.data?.data?.id
        if (CEREMONY_SCHEDULE_TYPES.includes(values.schedule_type) && values.recipient_name?.trim() && newScheduleId) {
          await api.post('/ceremonies', {
            schedule_id: newScheduleId,
            ceremony_type: values.ceremony_type || values.schedule_type,
            recipient_name: values.recipient_name,
            recipient_relation: values.recipient_relation,
            event_date: values.event_date ? dayjs(values.event_date).format('YYYY-MM-DD') : dayjs(start).format('YYYY-MM-DD'),
            event_location: values.location,
            is_joint: values.is_joint ? 1 : 0,
            joint_note: values.joint_note,
            note: values.ceremony_note,
            status: 'planned',
            items: ceremonyItems,
          })
        }
        message.success('行程已建立')
      }
      setDrawerOpen(false); setEditingScheduleId(null); form.resetFields(); setCeremonyItems([]); setDrawerScheduleType(''); fetchSchedules()
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
    setDetailCeremonies([])
    setDetailOpen(true)
    api.get(`/ceremonies/by-schedule/${info.event.id}`)
      .then(r => setDetailCeremonies(r.data.data || []))
      .catch(() => {})
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
              <td style="width:70px">${getTypeLabel(s.schedule_type) || '其他'}</td>
              <td>${s.title}</td>
              <td style="width:120px">${s.location || '—'}</td>
            </tr>`).join('')
        }`
      return daySection
    }).join('')

    const html = `<!DOCTYPE html><html lang="zh-TW"><head>
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
</body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return message.error('無法開啟列印視窗') }
    doc.open(); doc.write(html); doc.close()
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => { document.body.removeChild(iframe) }, 1000)
    setPrintModalOpen(false)
  }

  const handleExportWord = async () => {
    const startDate = printStartDate.startOf('day')
    const endDate = startDate.add(printDays - 1, 'day').endOf('day')

    const filtered = schedules
      .filter(s => {
        const sStart = dayjs(s.start_time)
        return sStart.isAfter(startDate.subtract(1, 'ms')) && sStart.isBefore(endDate)
      })
      .sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())

    const byDate: Record<string, any[]> = {}
    for (let i = 0; i < printDays; i++) {
      const date = startDate.add(i, 'day').format('YYYY-MM-DD')
      byDate[date] = []
    }
    filtered.forEach(s => {
      const date = dayjs(s.start_time).format('YYYY-MM-DD')
      if (byDate[date]) byDate[date].push(s)
    })

    const WEEK = ['日','一','二','三','四','五','六']
    const ACCENT = '1677FF'
    const ACCENT_LIGHT = 'EBF3FF'
    const WEEKEND_BG = 'FFF7ED'
    const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' }
    const cellBorders = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

    const colWidths = [
      { size: 16, type: WidthType.PERCENTAGE },
      { size: 12, type: WidthType.PERCENTAGE },
      { size: 46, type: WidthType.PERCENTAGE },
      { size: 26, type: WidthType.PERCENTAGE },
    ]

    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          { text: '時間', w: colWidths[0] },
          { text: '類型', w: colWidths[1] },
          { text: '行程標題', w: colWidths[2] },
          { text: '地點', w: colWidths[3] },
        ].map(({ text, w }) =>
          new TableCell({
            width: w,
            shading: { type: ShadingType.SOLID, color: ACCENT, fill: ACCENT },
            borders: cellBorders,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20, font: '微軟正黑體' })],
              alignment: AlignmentType.CENTER,
            })],
          })
        ),
      }),
    ]

    let rowIndex = 0
    for (const [date, items] of Object.entries(byDate)) {
      const d = dayjs(date)
      const weekDay = WEEK[d.day()]
      const isWeekend = d.day() === 0 || d.day() === 6
      const dayBg = isWeekend ? WEEKEND_BG : ACCENT_LIGHT

      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 4,
              shading: { type: ShadingType.SOLID, color: dayBg, fill: dayBg },
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 160, right: 160 },
              children: [new Paragraph({
                children: [
                  new TextRun({ text: `${d.format('MM月DD日')}`, bold: true, size: 22, color: isWeekend ? 'CC4400' : '1677FF', font: '微軟正黑體' }),
                  new TextRun({ text: `（${weekDay}）`, bold: true, size: 22, color: isWeekend ? 'CC4400' : '444444', font: '微軟正黑體' }),
                  new TextRun({ text: `　${d.format('YYYY')}年`, size: 18, color: '888888', font: '微軟正黑體' }),
                  new TextRun({ text: items.length > 0 ? `　共 ${items.length} 項` : '', size: 18, color: '888888', font: '微軟正黑體' }),
                ],
              })],
            }),
          ],
        })
      )

      if (items.length === 0) {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                columnSpan: 4,
                borders: cellBorders,
                margins: { top: 40, bottom: 40, left: 120, right: 120 },
                children: [new Paragraph({
                  children: [new TextRun({ text: '無行程安排', color: 'AAAAAA', italics: true, size: 18, font: '微軟正黑體' })],
                  alignment: AlignmentType.CENTER,
                })],
              }),
            ],
          })
        )
      } else {
        for (const s of items) {
          rowIndex++
          const rowBg = rowIndex % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
          const timeStr = dayjs(s.start_time).format('HH:mm') + (s.end_time ? '\n– ' + dayjs(s.end_time).format('HH:mm') : '')
          tableRows.push(
            new TableRow({
              children: [
                new TableCell({
                  width: colWidths[0],
                  shading: { type: ShadingType.SOLID, color: rowBg, fill: rowBg },
                  borders: cellBorders,
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: timeStr, size: 18, font: 'Courier New' })], alignment: AlignmentType.CENTER })],
                }),
                new TableCell({
                  width: colWidths[1],
                  shading: { type: ShadingType.SOLID, color: rowBg, fill: rowBg },
                  borders: cellBorders,
                  margins: { top: 60, bottom: 60, left: 80, right: 80 },
                  children: [new Paragraph({ children: [new TextRun({ text: getTypeLabel(s.schedule_type) || '其他', size: 18, font: '微軟正黑體', color: '444444' })], alignment: AlignmentType.CENTER })],
                }),
                new TableCell({
                  width: colWidths[2],
                  shading: { type: ShadingType.SOLID, color: rowBg, fill: rowBg },
                  borders: cellBorders,
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [
                    new Paragraph({ children: [new TextRun({ text: s.title, size: 19, bold: true, font: '微軟正黑體' })] }),
                    ...(s.note ? [new Paragraph({ children: [new TextRun({ text: s.note, size: 16, color: '888888', font: '微軟正黑體' })] })] : []),
                  ],
                }),
                new TableCell({
                  width: colWidths[3],
                  shading: { type: ShadingType.SOLID, color: rowBg, fill: rowBg },
                  borders: cellBorders,
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: s.location || '—', size: 18, font: '微軟正黑體', color: s.location ? '222222' : 'AAAAAA' })] })],
                }),
              ],
            })
          )
        }
      }
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: '微軟正黑體', size: 20 } } },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: convertInchesToTwip(0.7), bottom: convertInchesToTwip(0.7), left: convertInchesToTwip(0.8), right: convertInchesToTwip(0.8) },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({ text: officeName, bold: true, size: 18, color: '1677FF', font: '微軟正黑體' }),
                new TextRun({ text: '　行程表　', size: 18, color: '444444', font: '微軟正黑體' }),
                new TextRun({ text: `${startDate.format('YYYY.MM.DD')} – ${startDate.add(printDays - 1, 'day').format('YYYY.MM.DD')}`, size: 16, color: '888888', font: '微軟正黑體' }),
              ],
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } },
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `列印日期：${dayjs().format('YYYY-MM-DD')}　　第 `, size: 16, color: '888888', font: '微軟正黑體' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '888888' }),
                new TextRun({ text: ' 頁', size: 16, color: '888888', font: '微軟正黑體' }),
              ],
              alignment: AlignmentType.RIGHT,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' } },
            })],
          }),
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: `📅 ${officeName}`, bold: true, size: 36, color: '1677FF', font: '微軟正黑體' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: '行　程　表', bold: true, size: 48, color: '222222', font: '微軟正黑體' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${startDate.format('YYYY 年 MM 月 DD 日')}`, size: 22, color: '444444', font: '微軟正黑體' }),
              new TextRun({ text: '　起　', size: 20, color: '888888', font: '微軟正黑體' }),
              new TextRun({ text: `共 ${printDays} 天`, size: 22, color: '444444', font: '微軟正黑體' }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new DocxTable({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),
        ],
      }],
    })

    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${officeName}-行程表-${startDate.format('YYYYMMDD')}.docx`
    a.click()
    URL.revokeObjectURL(url)
    setPrintModalOpen(false)
  }

  const filteredSchedules = schedules.filter(s => {
    if (searchKeyword && !s.title?.includes(searchKeyword) && !s.location?.includes(searchKeyword) && !s.note?.includes(searchKeyword)) return false
    if (filterType && s.schedule_type !== filterType) return false
    if (filterStatus && s.status !== filterStatus) return false
    return true
  })

  const calendarEvents = filteredSchedules.map(s => ({
    id: String(s.id),
    title: s.title,
    start: s.start_time,
    end: s.end_time,
    backgroundColor: getTypeColor(s.schedule_type || 'other'),
    borderColor: getTypeColor(s.schedule_type || 'other'),
  }))

  const todayConsults = filteredSchedules.filter(s =>
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
          <Button onClick={() => { setSlotDate(dayjs().format('YYYY-MM-DD')); fetchSlots(dayjs().format('YYYY-MM-DD')); setSlotMgrOpen(true) }}>諮詢時段</Button>
          <Button icon={<PrinterOutlined />} onClick={() => { setPrintStartDate(dayjs()); setPrintModalOpen(true) }}>列印行程</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDrawerOpen(true) }}>新增行程</Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap>
          <Input.Search
            placeholder="搜尋行程標題、地點、備註"
            allowClear
            style={{ width: 220 }}
            value={searchKeyword}
            onChange={e => { if (!e.target.value) setSearchKeyword('') }}
            onSearch={v => setSearchKeyword(v)}
          />
          <Select placeholder="類型篩選" allowClear style={{ width: 130 }} value={filterType || undefined} onChange={v => setFilterType(v || '')}>
            {scheduleTypes.map(t => <Option key={t.code} value={t.code}>{t.name}</Option>)}
          </Select>
          <Select placeholder="狀態篩選" allowClear style={{ width: 110 }} value={filterStatus || undefined} onChange={v => setFilterStatus(v || '')}>
            <Option value="confirmed">確認</Option>
            <Option value="tentative">暫定</Option>
            <Option value="cancelled">已取消</Option>
          </Select>
          {(searchKeyword || filterType || filterStatus) && (
            <Button onClick={() => { setSearchKeyword(''); setFilterType(''); setFilterStatus('') }}>清除篩選</Button>
          )}
          {(searchKeyword || filterType || filterStatus) && (
            <span style={{ color: '#888', fontSize: 13 }}>顯示 {filteredSchedules.length} / {schedules.length} 筆</span>
          )}
        </Space>
      </Card>

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
        onCancel={() => { setPrintModalOpen(false); setPrintStartDate(dayjs()); setPrintDays(7) }}
        footer={[
          <Button key="cancel" onClick={() => { setPrintModalOpen(false); setPrintStartDate(dayjs()); setPrintDays(7) }}>取消</Button>,
          <Button key="word" icon={<FileWordOutlined />} onClick={handleExportWord}>匯出 Word</Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>列印</Button>,
        ]}
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
      <Drawer title={editingScheduleId ? '編輯行程' : '新增行程'} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingScheduleId(null); form.resetFields(); setCeremonyItems([]); setDrawerScheduleType('') }}
        width={560} destroyOnClose
        footer={<Space><Button onClick={() => { setDrawerOpen(false); setEditingScheduleId(null); form.resetFields(); setCeremonyItems([]); setDrawerScheduleType('') }}>取消</Button><Button type="primary" onClick={() => form.submit()}>儲存</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="行程標題" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="time_range" label="時間" rules={[{ required: true }]}>
            <RangePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" minuteStep={15} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="schedule_type" label="行程類型">
                <Select allowClear onChange={v => setDrawerScheduleType(v || '')}>
                  {(scheduleTypes.length > 0
                    ? scheduleTypes
                    : Object.entries(TYPE_LABELS).map(([code, name]) => ({ code, name, color: TYPE_COLORS[code] || '#8c8c8c' }))
                  ).map(t => (
                    <Option key={t.code} value={t.code}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                        {t.name}
                      </span>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="地點"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="備註"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="related_group_ids" label="相關團體">
            <Select mode="multiple" allowClear placeholder="選擇相關團體（可複選）" optionFilterProp="label"
              options={groupList.map((g: any) => ({ value: g.id, label: g.name }))} />
          </Form.Item>

          {/* 公祭特殊資訊 */}
          {isPublicMemorial && (
            <>
              <Divider style={{ borderColor: '#4a1942' }}><span style={{ color: '#4a1942' }}>⛩ 公祭資訊</span></Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="family_ceremony_time" label="家祭時間">
                    <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="public_ceremony_time" label="公祭時間">
                    <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="mourning_hall_location" label="靈堂地點">
                    <Input placeholder="靈堂所在地址" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="public_ceremony_location" label="公祭地點">
                    <Input placeholder="公祭舉行地址" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="deceased_age" label="往生者年齡">
                <InputNumber min={1} max={150} style={{ width: 120 }} addonAfter="歲" />
              </Form.Item>
            </>
          )}

          {/* 禮儀子表單 */}
          {isCeremonyType && (
            <>
              <Divider><GiftOutlined /> 禮儀資訊</Divider>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="ceremony_type" label="禮儀性質">
                    <Select>
                      {Object.entries(CEREMONY_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="event_date" label="活動日期">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item name="recipient_name" label="受贈人／主家姓名" rules={[{ required: isCeremonyType, message: '請輸入受贈人姓名' }]}>
                    <Input placeholder="姓名" />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item name="recipient_relation" label="關係">
                    <Select allowClear>
                      {['選民','親屬','里長','議員','同事','廠商','朋友','其他'].map(r => <Option key={r} value={r}>{r}</Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="is_joint" valuePropName="checked" style={{ marginBottom: 4 }}>
                    <Checkbox>聯合致贈</Checkbox>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="joint_note" style={{ marginBottom: 4 }}>
                    <Input placeholder="聯合人說明（如有）" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="ceremony_note" label="禮儀備註"><Input.TextArea rows={1} /></Form.Item>

              {/* 送禮明細 */}
              <div style={{ marginBottom: 8 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>送禮明細</Text>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => {
                    setCeremonyItems(prev => [...prev, { key: Date.now(), item_name: '', category_id: null, vendor_id: null, quantity: 1, unit_price: 0, amount: 0, payment_method: 'cash', payment_status: 'pending' }])
                  }}>新增品項</Button>
                </Space>
              </div>
              {ceremonyItems.map((item, idx) => (
                <div key={item.key} style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: 10, marginBottom: 8 }}>
                  <Row gutter={8} align="middle">
                    <Col flex={1}>
                      <Select
                        placeholder="選擇類別"
                        style={{ width: '100%' }}
                        allowClear
                        value={item.category_id}
                        onChange={v => {
                          const cat = giftCategories.find((c: any) => c.id === v)
                          setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, category_id: v, item_name: cat?.name || it.item_name, unit_price: cat?.default_price ?? it.unit_price, amount: (cat?.default_price ?? it.unit_price) * it.quantity } : it))
                        }}
                      >
                        {giftCategories.map((c: any) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                      </Select>
                    </Col>
                    <Col flex={1}>
                      <Input
                        placeholder="品項名稱"
                        value={item.item_name}
                        onChange={e => setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))}
                      />
                    </Col>
                    <Col>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setCeremonyItems(prev => prev.filter((_, i) => i !== idx))} />
                    </Col>
                  </Row>
                  <Row gutter={8} style={{ marginTop: 6 }}>
                    <Col span={8}>
                      <Select
                        placeholder="廠商（選填）"
                        style={{ width: '100%' }}
                        allowClear
                        value={item.vendor_id}
                        onChange={v => setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, vendor_id: v } : it))}
                      >
                        {vendorList.map((v: any) => <Option key={v.id} value={v.id}>{v.name}</Option>)}
                      </Select>
                    </Col>
                    <Col span={5}>
                      <InputNumber
                        placeholder="數量"
                        min={1}
                        value={item.quantity}
                        style={{ width: '100%' }}
                        onChange={v => setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v || 1, amount: (v || 1) * it.unit_price } : it))}
                      />
                    </Col>
                    <Col span={6}>
                      <InputNumber
                        placeholder="單價"
                        min={0}
                        value={item.unit_price}
                        style={{ width: '100%' }}
                        formatter={v => `NT$ ${v}`}
                        parser={(v: any) => Number(String(v).replace(/[^0-9]/g, '')) || 0}
                        onChange={v => setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: v || 0, amount: (v || 0) * it.quantity } : it))}
                      />
                    </Col>
                    <Col span={5}>
                      <Select
                        value={item.payment_method}
                        style={{ width: '100%' }}
                        onChange={v => setCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, payment_method: v } : it))}
                      >
                        <Option value="cash">現金</Option>
                        <Option value="transfer">轉帳</Option>
                        <Option value="card">刷卡</Option>
                      </Select>
                    </Col>
                  </Row>
                  <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: '#888' }}>
                    小計：<Text strong>NT$ {(item.amount || 0).toLocaleString()}</Text>
                  </div>
                </div>
              ))}
              {ceremonyItems.length > 0 && (
                <div style={{ textAlign: 'right', padding: '8px 0', borderTop: '1px solid #e8e8e8', marginTop: 4 }}>
                  <Text>本次合計：</Text>
                  <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                    NT$ {ceremonyItems.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}
                  </Text>
                </div>
              )}
            </>
          )}
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

      {/* 諮詢時段管理 */}
      <Modal
        title="諮詢時段管理"
        open={slotMgrOpen}
        onCancel={() => setSlotMgrOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Space style={{ marginBottom: 12 }}>
          <span>選擇日期：</span>
          <DatePicker
            value={dayjs(slotDate)}
            onChange={d => { if (d) { const s = d.format('YYYY-MM-DD'); setSlotDate(s); fetchSlots(s) } }}
            allowClear={false}
            format="YYYY-MM-DD"
          />
        </Space>
        <Table
          size="small"
          dataSource={slots}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: <Empty description="此日期尚無時段" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={[
            { title: '時段', dataIndex: 'slot_time', width: 80 },
            { title: '容量', dataIndex: 'max_capacity', width: 60 },
            { title: '備註', dataIndex: 'note', render: (v: string) => v || '—' },
            {
              title: '刪除', width: 60,
              render: (_: any, r: any) => (
                <Popconfirm title="確定刪除此時段？" onConfirm={() => handleDeleteSlot(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
        <Divider />
        <Form form={slotForm} layout="inline" onFinish={handleAddSlot}>
          <Form.Item name="slot_time" rules={[{ required: true, message: '必填' }]}>
            <TimePicker format="HH:mm" placeholder="時間" minuteStep={15} />
          </Form.Item>
          <Form.Item name="max_capacity">
            <InputNumber min={1} max={20} placeholder="容量" style={{ width: 70 }} />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="備註" style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={addingSlot} icon={<PlusOutlined />}>新增</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 行程詳情 */}
      <Modal title="行程詳情" open={detailOpen} onCancel={() => { setDetailOpen(false); setSelectedEvent(null) }}
        width={600}
        footer={[
          <Button key="delete" danger onClick={handleDeleteSchedule}>刪除行程</Button>,
          <Button key="edit" icon={<EditOutlined />} onClick={() => selectedEvent && openEditDrawer(selectedEvent)}>編輯行程</Button>,
          <Button key="close" onClick={() => { setDetailOpen(false); setSelectedEvent(null) }}>關閉</Button>,
        ]}>
        {selectedEvent && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: 'info', label: '基本資訊',
              children: (
                <div style={{ paddingTop: 8 }}>
                  <p><strong>標題：</strong>{selectedEvent.title}</p>
                  <p><strong>開始：</strong>{dayjs(selectedEvent.start_time).format('YYYY-MM-DD HH:mm')}</p>
                  {selectedEvent.end_time && <p><strong>結束：</strong>{dayjs(selectedEvent.end_time).format('YYYY-MM-DD HH:mm')}</p>}
                  {selectedEvent.schedule_type && <p><strong>類型：</strong><Tag color={getTypeColor(selectedEvent.schedule_type)}>{getTypeLabel(selectedEvent.schedule_type)}</Tag></p>}
                  {selectedEvent.location && <p><strong>地點：</strong>{selectedEvent.location}</p>}
                  {selectedEvent.note && <p><strong>備註：</strong>{selectedEvent.note}</p>}
                  <p><strong>狀態：</strong>{selectedEvent.status}</p>
                  {selectedEvent.schedule_type === 'public_memorial' && (() => {
                    let fi: any = {}
                    try { fi = JSON.parse(selectedEvent.funeral_info || '{}') } catch {}
                    return (
                      <div style={{ marginTop: 12, padding: '10px 14px', background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 8 }}>
                        <p style={{ margin: '0 0 6px', fontWeight: 'bold', color: '#4a1942' }}>⛩ 公祭詳情</p>
                        {fi.family_ceremony_time && <p style={{ margin: '2px 0' }}><strong>家祭時間：</strong>{fi.family_ceremony_time}</p>}
                        {fi.public_ceremony_time && <p style={{ margin: '2px 0' }}><strong>公祭時間：</strong>{fi.public_ceremony_time}</p>}
                        {fi.mourning_hall_location && <p style={{ margin: '2px 0' }}><strong>靈堂地點：</strong>{fi.mourning_hall_location}</p>}
                        {fi.public_ceremony_location && <p style={{ margin: '2px 0' }}><strong>公祭地點：</strong>{fi.public_ceremony_location}</p>}
                        {fi.deceased_age && <p style={{ margin: '2px 0' }}><strong>往生者年齡：</strong>{fi.deceased_age} 歲</p>}
                      </div>
                    )
                  })()}
                </div>
              )
            },
            {
              key: 'ceremony',
              label: (
                <Space>
                  <GiftOutlined />
                  禮儀記錄
                  {detailCeremonies.length > 0 && <Tag color="pink">{detailCeremonies.length}</Tag>}
                </Space>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  <div style={{ textAlign: 'right', marginBottom: 12 }}>
                    <Button size="small" type="primary" icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingCeremony(null)
                        setEditingCeremonyItems([])
                        ceremonyForm.resetFields()
                        ceremonyForm.setFieldsValue({
                          event_date: dayjs(selectedEvent.start_time),
                          event_location: selectedEvent.location,
                          is_joint: false,
                          status: 'planned',
                        })
                        setCeremonyModalOpen(true)
                      }}>新增禮儀記錄</Button>
                  </div>
                  {detailCeremonies.length === 0
                    ? <Empty description="尚無禮儀記錄" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    : detailCeremonies.map((c: any) => (
                      <Card key={c.id} size="small" style={{ marginBottom: 10 }}
                        title={
                          <Space>
                            <Tag color="pink">{CEREMONY_TYPE_LABELS[c.ceremony_type] || c.ceremony_type}</Tag>
                            <Text strong>{c.recipient_name}</Text>
                            {c.recipient_relation && <Text type="secondary">（{c.recipient_relation}）</Text>}
                          </Space>
                        }
                        extra={
                          <Space>
                            <Tag color={c.status === 'paid' ? 'success' : c.status === 'cancelled' ? 'default' : 'warning'}>
                              {c.status === 'paid' ? '已付款' : c.status === 'cancelled' ? '已取消' : '計畫中'}
                            </Tag>
                            <Button size="small" icon={<EditOutlined />} onClick={() => {
                              setEditingCeremony(c)
                              setEditingCeremonyItems(c.items || [])
                              ceremonyForm.setFieldsValue({
                                ceremony_type: c.ceremony_type,
                                recipient_name: c.recipient_name,
                                recipient_relation: c.recipient_relation,
                                event_date: c.event_date ? dayjs(c.event_date) : null,
                                event_location: c.event_location,
                                is_joint: !!c.is_joint,
                                joint_note: c.joint_note,
                                status: c.status,
                                note: c.note,
                              })
                              setCeremonyModalOpen(true)
                            }} />
                            <Popconfirm title="確定刪除此禮儀記錄？" onConfirm={async () => {
                              try {
                                await api.delete(`/ceremonies/${c.id}`)
                                const r = await api.get(`/ceremonies/by-schedule/${selectedEvent.id}`)
                                setDetailCeremonies(r.data.data || [])
                              } catch { message.error('刪除失敗') }
                            }}>
                              <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </Space>
                        }
                      >
                        {c.event_date && <p style={{ margin: '2px 0', fontSize: 12, color: '#888' }}>活動日期：{c.event_date}　地點：{c.event_location || '—'}</p>}
                        {c.is_joint && <p style={{ margin: '2px 0', fontSize: 12 }}>聯合致贈：{c.joint_note || '是'}</p>}
                        {c.note && <p style={{ margin: '2px 0', fontSize: 12 }}>備註：{c.note}</p>}
                        {c.items?.length > 0 && (
                          <Table
                            size="small"
                            dataSource={c.items}
                            rowKey="id"
                            pagination={false}
                            style={{ marginTop: 8 }}
                            columns={[
                              { title: '品項', dataIndex: 'item_name' },
                              { title: '廠商', dataIndex: 'vendor_name', render: (v: string) => v || '—' },
                              { title: '數量', key: 'qty', render: (_: any, r: any) => `${r.quantity}` },
                              { title: '金額', dataIndex: 'amount', render: (v: number) => <Text strong>NT$ {v.toLocaleString()}</Text> },
                              {
                                title: '付款', dataIndex: 'payment_status',
                                render: (v: string) => v === 'paid' ? <Tag color="success">已付</Tag> : <Tag color="warning">待付</Tag>
                              },
                            ]}
                            footer={() => (
                              <div style={{ textAlign: 'right' }}>
                                合計：<Text strong style={{ color: '#1677ff' }}>NT$ {(c.total_amount || 0).toLocaleString()}</Text>
                              </div>
                            )}
                          />
                        )}
                      </Card>
                    ))
                  }
                </div>
              )
            }
          ]} />
        )}
      </Modal>

      {/* 禮儀記錄編輯 Modal */}
      <Modal
        title={editingCeremony ? '編輯禮儀記錄' : '新增禮儀記錄'}
        open={ceremonyModalOpen}
        onCancel={() => { setCeremonyModalOpen(false); ceremonyForm.resetFields(); setEditingCeremony(null); setEditingCeremonyItems([]) }}
        onOk={() => ceremonyForm.submit()}
        okText="儲存"
        width={600}
        destroyOnClose
      >
        <Form form={ceremonyForm} layout="vertical" onFinish={async (values) => {
          try {
            const payload = {
              schedule_id: selectedEvent?.id,
              ceremony_type: values.ceremony_type,
              recipient_name: values.recipient_name,
              recipient_relation: values.recipient_relation,
              event_date: values.event_date ? dayjs(values.event_date).format('YYYY-MM-DD') : null,
              event_location: values.event_location,
              is_joint: values.is_joint ? 1 : 0,
              joint_note: values.joint_note,
              status: values.status || 'planned',
              note: values.note,
              items: editingCeremonyItems,
            }
            if (editingCeremony) {
              await api.put(`/ceremonies/${editingCeremony.id}`, payload)
              message.success('已更新')
            } else {
              await api.post('/ceremonies', payload)
              message.success('已新增')
            }
            setCeremonyModalOpen(false)
            ceremonyForm.resetFields()
            setEditingCeremony(null)
            setEditingCeremonyItems([])
            const r = await api.get(`/ceremonies/by-schedule/${selectedEvent.id}`)
            setDetailCeremonies(r.data.data || [])
          } catch { message.error('儲存失敗') }
        }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ceremony_type" label="禮儀性質" rules={[{ required: true }]}>
                <Select>
                  {Object.entries(CEREMONY_TYPE_LABELS).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="event_date" label="活動日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="recipient_name" label="受贈人姓名" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="recipient_relation" label="關係">
                <Select allowClear>
                  {['選民','親屬','里長','議員','同事','廠商','朋友','其他'].map(r => <Option key={r} value={r}>{r}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="event_location" label="地點"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="狀態" initialValue="planned">
                <Select>
                  <Option value="planned">計畫中</Option>
                  <Option value="paid">已付款</Option>
                  <Option value="cancelled">取消</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="is_joint" valuePropName="checked" style={{ marginBottom: 4 }}>
                <Checkbox>聯合致贈</Checkbox>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="joint_note" style={{ marginBottom: 4 }}>
                <Input placeholder="聯合人說明（如有）" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="note" label="備註"><Input.TextArea rows={1} /></Form.Item>

          {/* 送禮明細 */}
          <Divider style={{ margin: '12px 0' }}><Text style={{ fontSize: 13 }}>送禮明細</Text></Divider>
          <div style={{ textAlign: 'right', marginBottom: 8 }}>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setEditingCeremonyItems(prev => [...prev, { key: Date.now(), item_name: '', category_id: null, vendor_id: null, quantity: 1, unit_price: 0, amount: 0, payment_method: 'cash', payment_status: 'pending' }])}>新增品項</Button>
          </div>
          {editingCeremonyItems.map((item, idx) => (
            <div key={item.id ?? item.key} style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <Row gutter={8} align="middle">
                <Col flex={1}>
                  <Select placeholder="選擇類別" style={{ width: '100%' }} allowClear value={item.category_id}
                    onChange={v => {
                      const cat = giftCategories.find((c: any) => c.id === v)
                      setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, category_id: v, item_name: cat?.name || it.item_name, unit_price: cat?.default_price ?? it.unit_price, amount: (cat?.default_price ?? it.unit_price) * it.quantity } : it))
                    }}>
                    {giftCategories.map((c: any) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Col>
                <Col flex={1}>
                  <Input placeholder="品項名稱" value={item.item_name}
                    onChange={e => setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, item_name: e.target.value } : it))} />
                </Col>
                <Col>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setEditingCeremonyItems(prev => prev.filter((_, i) => i !== idx))} />
                </Col>
              </Row>
              <Row gutter={8} style={{ marginTop: 6 }}>
                <Col span={8}>
                  <Select placeholder="廠商（選填）" style={{ width: '100%' }} allowClear value={item.vendor_id}
                    onChange={v => setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, vendor_id: v } : it))}>
                    {vendorList.map((v: any) => <Option key={v.id} value={v.id}>{v.name}</Option>)}
                  </Select>
                </Col>
                <Col span={5}>
                  <InputNumber placeholder="數量" min={1} value={item.quantity} style={{ width: '100%' }}
                    onChange={v => setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: v || 1, amount: (v || 1) * it.unit_price } : it))} />
                </Col>
                <Col span={6}>
                  <InputNumber placeholder="單價" min={0} value={item.unit_price} style={{ width: '100%' }}
                    formatter={v => `NT$ ${v}`}
                    parser={(v: any) => Number(String(v).replace(/[^0-9]/g, '')) || 0}
                    onChange={v => setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: v || 0, amount: (v || 0) * it.quantity } : it))} />
                </Col>
                <Col span={5}>
                  <Select value={item.payment_status} style={{ width: '100%' }}
                    onChange={v => setEditingCeremonyItems(prev => prev.map((it, i) => i === idx ? { ...it, payment_status: v } : it))}>
                    <Option value="pending">待付</Option>
                    <Option value="paid">已付</Option>
                  </Select>
                </Col>
              </Row>
              <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: '#888' }}>
                小計：<Text strong>NT$ {(item.amount || 0).toLocaleString()}</Text>
              </div>
            </div>
          ))}
          {editingCeremonyItems.length > 0 && (
            <div style={{ textAlign: 'right', padding: '6px 0', borderTop: '1px solid #e8e8e8' }}>
              <Text>合計：</Text>
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>NT$ {editingCeremonyItems.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}</Text>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
