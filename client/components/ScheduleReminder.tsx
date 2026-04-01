import React, { useEffect, useRef } from 'react'
import { notification } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import api from '../utils/api'
import dayjs from 'dayjs'

export default function ScheduleReminder() {
  // Track which schedule IDs have already been notified in this session
  const notifiedIds = useRef(new Set<number>())

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get('/schedules')
        const schedules = res.data.data || []
        const now = dayjs()
        const soon = schedules.filter((s: any) => {
          const start = dayjs(s.start_time)
          const diffMin = start.diff(now, 'minute')
          // 只提醒未來 30 分鐘內、未取消、且本次 session 未通知過的行程
          return diffMin > 0 && diffMin <= 30 && s.status !== 'cancelled' && !notifiedIds.current.has(s.id)
        })
        soon.forEach((s: any) => {
          const diffMin = dayjs(s.start_time).diff(now, 'minute')
          notifiedIds.current.add(s.id)
          notification.info({
            key: `schedule-${s.id}`,
            message: '即將到來的行程',
            description: `${s.title} — ${dayjs(s.start_time).format('HH:mm')}（${diffMin} 分鐘後）${s.location ? ' @ ' + s.location : ''}`,
            icon: <CalendarOutlined style={{ color: '#007AFF' }} />,
            duration: 10,
          })
        })
      } catch {}
    }
    // Check immediately and then every 5 minutes
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])
  return null
}
