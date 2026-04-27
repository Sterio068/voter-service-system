import test from 'node:test'
import assert from 'node:assert/strict'
import { AddressInfo } from 'net'
import { createApiTestServer, loginAs, type ApiTestContext } from '../helpers/apiTestServer'
import { publish, subscriberCount, _resetForTests } from '../../server/utils/realtimeBus'

let ctx: ApiTestContext

test.before(async () => {
  ctx = await createApiTestServer()
  // Bind to ephemeral port so we can open a real WebSocket against it.
  await ctx.app.listen({ host: '127.0.0.1', port: 0 })
})

test.after(async () => {
  if (ctx) {
    _resetForTests()
    await ctx.close()
  }
})

function getServerUrl(): { host: string; port: number } {
  const addr = ctx.app.server.address() as AddressInfo
  return { host: addr.address, port: addr.port }
}

async function openSocket(token: string): Promise<{ ws: any; messages: any[]; close: () => void }> {
  // `ws` ships without TypeScript types in this project; require dynamically as `any`.
  const wsModule: any = require('ws')
  const WebSocket = wsModule.WebSocket || wsModule.default || wsModule
  const { host, port } = getServerUrl()
  const ws = new WebSocket(`ws://${host}:${port}/ws?token=${encodeURIComponent(token)}`)
  const messages: any[] = []
  ws.on('message', (data: any) => {
    try {
      messages.push(JSON.parse(data.toString()))
    } catch {
      messages.push(data.toString())
    }
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000)
    ws.once('open', () => { clearTimeout(timer); resolve() })
    ws.once('error', (err: Error) => { clearTimeout(timer); reject(err) })
  })
  return { ws, messages, close: () => { try { ws.close() } catch {} } }
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'))
      setTimeout(tick, 20)
    }
    tick()
  })
}

test('WS endpoint rejects unauthenticated connections', async () => {
  const wsModule: any = require('ws')
  const WebSocket = wsModule.WebSocket || wsModule.default || wsModule
  const { host, port } = getServerUrl()
  const ws = new WebSocket(`ws://${host}:${port}/ws`)

  const closeInfo = await new Promise<{ code: number }>((resolve) => {
    ws.once('close', (code: number) => resolve({ code }))
    ws.once('error', () => {/* ignore — close will fire next */})
  })
  // 1008 = policy violation. Some stacks coerce to 1006 when closed before handshake completes.
  assert.ok(
    closeInfo.code === 1008 || closeInfo.code === 1006,
    `expected close code 1008 or 1006, got ${closeInfo.code}`,
  )
})

test('WS endpoint accepts authenticated connection and receives published events', async () => {
  const adminToken = (await loginAs(ctx.app, 'admin', 'admin123')).token
  const conn = await openSocket(adminToken)

  try {
    // Server should have registered exactly one subscriber for our connection.
    await waitFor(() => subscriberCount() >= 1, 2000)

    publish({
      target_type: 'voter',
      target_id: 42,
      action: 'update',
      user_id: 1,
    })

    await waitFor(() => conn.messages.some((m) => m?.type === 'audit'), 2000)

    const auditMsg = conn.messages.find((m) => m?.type === 'audit')
    assert.ok(auditMsg, 'expected an audit message')
    assert.equal(auditMsg.event.target_type, 'voter')
    assert.equal(auditMsg.event.target_id, 42)
    assert.equal(auditMsg.event.action, 'update')
    assert.equal(auditMsg.event.user_id, 1)
    assert.ok(auditMsg.event.created_at, 'created_at should be populated')
  } finally {
    conn.close()
    // Allow close to propagate to the bus before the next test.
    await waitFor(() => subscriberCount() === 0, 2000).catch(() => {})
  }
})
