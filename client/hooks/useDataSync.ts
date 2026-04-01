import { useEffect, useRef } from 'react'

interface SyncEvent {
  target_type: string
  target_id: number
  action: string
  created_at: string
}

type SyncCallback = (events: SyncEvent[]) => void

const subscribers = new Set<SyncCallback>()
let lastSyncTime = new Date().toISOString()
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (subscribers.size === 0) return
    try {
      const res = await fetch(`/api/system/updates?since=${encodeURIComponent(lastSyncTime)}`)
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        lastSyncTime = data.server_time || new Date().toISOString()
        subscribers.forEach(cb => cb(data.data))
      } else if (data.server_time) {
        lastSyncTime = data.server_time
      }
    } catch {}
  }, 30000) // Poll every 30 seconds
}

function stopPollingIfIdle() {
  if (subscribers.size === 0 && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function useDataSync(callback: SyncCallback, deps: string[] = []) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const handler: SyncCallback = (events) => cbRef.current(events)
    subscribers.add(handler)
    startPolling()
    return () => {
      subscribers.delete(handler)
      stopPollingIfIdle()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export function invalidateSync() {
  lastSyncTime = new Date(Date.now() - 5000).toISOString()
}
