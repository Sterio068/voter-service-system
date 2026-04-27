/**
 * Realtime pub/sub bus for WebSocket-pushed audit/data events.
 *
 * Subscribers are WebSocket-like sockets accumulated by the /ws route.
 * `publish` is called from `createAuditLog` (audit middleware) so every
 * write that audits a change immediately fans out to connected clients.
 *
 * Failures inside publish never bubble up — audit-log writes must succeed
 * even if the realtime layer is misbehaving.
 */

export interface RealtimeEvent {
  target_type: string
  target_id?: number | null
  action: string
  user_id?: number | null
  created_at?: string
}

// Minimal structural type so we don't bind to a specific WS implementation.
// `@fastify/websocket` exposes a `WebSocket`-like object with `send`, `readyState`
// and `OPEN`. Tests can satisfy this with a small fake.
export interface RealtimeSocket {
  send: (data: string) => void
  readyState: number
  OPEN?: number
}

const subscribers = new Set<RealtimeSocket>()

export function subscribe(socket: RealtimeSocket): void {
  subscribers.add(socket)
}

export function unsubscribe(socket: RealtimeSocket): void {
  subscribers.delete(socket)
}

export function subscriberCount(): number {
  return subscribers.size
}

export function publish(event: RealtimeEvent): void {
  if (subscribers.size === 0) return

  const payload = JSON.stringify({
    type: 'audit',
    event: {
      ...event,
      created_at: event.created_at || new Date().toISOString(),
    },
  })

  // Snapshot to allow safe mutation during iteration if a socket cleans itself up.
  for (const socket of Array.from(subscribers)) {
    try {
      const openState = socket.OPEN ?? 1
      if (socket.readyState !== openState) {
        subscribers.delete(socket)
        continue
      }
      socket.send(payload)
    } catch {
      // Drop sockets that throw on send — they're effectively dead.
      subscribers.delete(socket)
    }
  }
}

// Test-only helper to clear subscribers between runs.
export function _resetForTests(): void {
  subscribers.clear()
}
