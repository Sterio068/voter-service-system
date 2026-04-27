import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'

interface SyncEvent {
  target_type: string
  target_id?: number | null
  action: string
  created_at?: string
  user_id?: number | null
}

type SyncCallback = (events: SyncEvent[]) => void

const subscribers = new Set<SyncCallback>()

// ===== Polling fallback (legacy behaviour) =====
let lastSyncTime = new Date().toISOString()
let pollTimer: ReturnType<typeof setInterval> | null = null
const POLL_INTERVAL_MS = 5000

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    if (subscribers.size === 0) return
    try {
      const res = await fetch(`/api/system/updates?since=${encodeURIComponent(lastSyncTime)}`)
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        lastSyncTime = data.server_time || new Date().toISOString()
        notify(data.data as SyncEvent[])
      } else if (data.server_time) {
        lastSyncTime = data.server_time
      }
    } catch {
      // network blip — try again on next tick
    }
  }, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function notify(events: SyncEvent[]) {
  subscribers.forEach(cb => cb(events))
}

// ===== WebSocket transport =====
const WS_BACKOFF_MIN_MS = 1000
const WS_BACKOFF_MAX_MS = 30000

let ws: WebSocket | null = null
let wsBackoff = WS_BACKOFF_MIN_MS
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsManuallyClosed = false

function getAuthToken(): string | null {
  try {
    return useAuthStore.getState().token
  } catch {
    return null
  }
}

function buildWsUrl(token: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
}

function connectWs() {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    startPolling()
    return
  }

  const token = getAuthToken()
  if (!token) {
    // No auth → fall back to polling (which itself will 401 silently if needed).
    startPolling()
    return
  }

  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return
  }

  try {
    ws = new WebSocket(buildWsUrl(token))
  } catch {
    scheduleReconnect()
    startPolling()
    return
  }

  ws.onopen = () => {
    wsBackoff = WS_BACKOFF_MIN_MS
    // WS is healthy → polling is redundant.
    stopPolling()
  }

  ws.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
      // Server may send { type: 'ping' } heartbeats — answer if so, ignore otherwise.
      if (parsed && parsed.type === 'ping') {
        try { ws?.send('pong') } catch {}
        return
      }
      if (parsed && parsed.type === 'audit' && parsed.event) {
        const event = parsed.event as SyncEvent
        notify([event])
      }
    } catch {
      // malformed frame — ignore
    }
  }

  const onDown = () => {
    if (wsManuallyClosed) return
    // Resume polling immediately so users still see updates while we retry WS.
    startPolling()
    scheduleReconnect()
  }

  ws.onerror = onDown
  ws.onclose = onDown
}

function scheduleReconnect() {
  if (wsManuallyClosed) return
  if (wsReconnectTimer) return
  const delay = wsBackoff
  wsBackoff = Math.min(wsBackoff * 2, WS_BACKOFF_MAX_MS)
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null
    connectWs()
  }, delay)
}

function teardownWs() {
  wsManuallyClosed = true
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }
  if (ws) {
    try { ws.close() } catch {}
    ws = null
  }
}

function ensureTransport() {
  wsManuallyClosed = false
  connectWs()
}

function teardownIfIdle() {
  if (subscribers.size > 0) return
  teardownWs()
  stopPolling()
}

export function useDataSync(callback: SyncCallback, deps: string[] = []) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const handler: SyncCallback = (events) => cbRef.current(events)
    subscribers.add(handler)
    ensureTransport()
    return () => {
      subscribers.delete(handler)
      teardownIfIdle()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export function invalidateSync() {
  lastSyncTime = new Date(Date.now() - 5000).toISOString()
}
