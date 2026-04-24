import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { getSetting } from '../utils/settings'

// LINE Webhook integration
// Setup requirements:
// 1. Configure LINE_CHANNEL_SECRET in settings table
// 2. Set webhook URL to: https://your-domain/api/line/webhook
// 3. Enable webhook in LINE Official Account Manager

function verifyLineSignature(body: string, signature: string | undefined, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false
  const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64')
  return hash === signature
}

export default async function lineWebhookRoutes(fastify: FastifyInstance) {
  // Webhook verification (GET)
  fastify.get('/api/line/webhook', async (request, reply) => {
    return reply.send({ status: 'ok', message: 'LINE Webhook endpoint active' })
  })

  // Receive LINE events (POST)
  fastify.post('/api/line/webhook', {
    config: {
      rawBody: true, // need raw body for signature verification
      rateLimit: {
        max: 120,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const body = request.body as any

    // Get channel secret from settings
    const channelSecret = getSetting('line_channel_secret') || ''

    // Get raw body for signature verification
    const rawBody = JSON.stringify(request.body)
    const signature = request.headers['x-line-signature'] as string | undefined

    // Always require a valid signature — if channel secret is not configured, reject all requests
    if (!channelSecret || !verifyLineSignature(rawBody, signature, channelSecret)) {
      return reply.code(403).send({ success: false, error: 'Invalid LINE signature' })
    }

    const events = body?.events || []

    for (const event of events) {
      try {
        if (event.type === 'message' && event.message?.type === 'text') {
          const lineUserId = event.source?.userId
          const messageText = event.message.text
          const timestamp = new Date(event.timestamp).toISOString().slice(0, 10)

          // Try to find voter by LINE user ID (stored in tags or a dedicated field)
          // For now, create a contact record if we can match the voter
          const escapedId = (lineUserId || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
          const voter = db.prepare(`SELECT * FROM voters WHERE tags LIKE ? ESCAPE '\\' AND is_active=1 LIMIT 1`)
            .get(`%${escapedId}%`) as any

          if (voter) {
            db.prepare(`INSERT INTO contact_records(voter_id,type,channel,content,contact_date,source,created_at) VALUES(?,?,?,?,?,?,datetime('now','localtime'))`)
              .run(voter.id, '訊息', 'LINE', messageText.slice(0, 500), timestamp, 'line_webhook')
          }

          // Log unmatched LINE messages for manual processing
          db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
            .run(0, 'receive', 'LINE整合', 'line_message', JSON.stringify({ line_user_id: lineUserId, message: messageText.slice(0, 200), matched_voter: voter?.id || null }))
        }
      } catch (e) {
        console.error('LINE webhook event error:', e)
      }
    }

    return reply.send({ status: 'ok' })
  })

  // Admin: Link LINE user ID to voter (C-4: requires admin permission)
  fastify.post('/api/line/link-voter', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const { voter_id, line_user_id } = request.body as any
    if (!voter_id || !line_user_id) return reply.code(400).send({ success: false, error: '缺少必要參數' })

    const voter = db.prepare('SELECT * FROM voters WHERE id=?').get(Number(voter_id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })

    // Store LINE user ID in tags field as a special tag
    let tags: string[] = []
    try { tags = JSON.parse(voter.tags || '[]') } catch { tags = [] }
    const lineTag = `LINE:${line_user_id}`
    if (!tags.includes(lineTag)) {
      tags.push(lineTag)
      db.prepare('UPDATE voters SET tags=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
        .run(JSON.stringify(tags), voter_id)
    }

    return reply.send({ success: true, message: 'LINE 帳號已連結' })
  })

  // GET /api/line/status - check LINE integration status (C-4: requires admin permission)
  fastify.get('/api/line/status', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const linkedCount = (db.prepare(`SELECT COUNT(*) as c FROM voters WHERE tags LIKE '%LINE:%' AND is_active=1`).get() as any).c
    const channelSecretConfigured = !!getSetting('line_channel_secret')
    return reply.send({ success: true, data: { linked_voters: linkedCount, webhook_active: true, channel_secret_configured: channelSecretConfigured } })
  })
}
