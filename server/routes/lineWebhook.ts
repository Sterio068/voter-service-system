import { FastifyInstance } from 'fastify'
import crypto from 'crypto'
import { z } from 'zod'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { getSetting } from '../utils/settings'

// LINE Webhook event payload (subset we actually consume)
const LineWebhookEventSchema = z.object({
  type: z.string().max(50).optional(),
  timestamp: z.number().optional(),
  source: z
    .object({
      type: z.string().max(50).optional(),
      userId: z.string().max(100).optional(),
      groupId: z.string().max(100).optional(),
      roomId: z.string().max(100).optional(),
    })
    .partial()
    .optional(),
  message: z
    .object({
      id: z.string().max(100).optional(),
      type: z.string().max(50).optional(),
      text: z.string().max(5000).optional(),
    })
    .partial()
    .optional(),
}).passthrough()

const LineWebhookBodySchema = z.object({
  destination: z.string().max(100).optional(),
  events: z.array(LineWebhookEventSchema).max(100).optional(),
}).passthrough()

const LinkVoterSchema = z.object({
  voter_id: z.number().int().positive('voter_id 需為正整數'),
  line_user_id: z.string().min(1, 'line_user_id 為必填').max(100, 'line_user_id 過長'),
})

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
    // Get channel secret from settings
    const channelSecret = getSetting('line_channel_secret') || ''

    // Get raw body for signature verification
    const rawBody = JSON.stringify(request.body)
    const signature = request.headers['x-line-signature'] as string | undefined

    // Always require a valid signature — if channel secret is not configured, reject all requests
    if (!channelSecret || !verifyLineSignature(rawBody, signature, channelSecret)) {
      return reply.code(403).send({ success: false, error: 'Invalid LINE signature' })
    }

    const parsed = LineWebhookBodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const body = parsed.data
    const events = body.events || []

    for (const event of events) {
      try {
        if (event.type === 'message' && event.message?.type === 'text') {
          const lineUserId = event.source?.userId
          const messageText = event.message.text
          if (typeof messageText !== 'string') continue
          const timestamp = new Date(event.timestamp ?? Date.now()).toISOString().slice(0, 10)

          // Match voter by LINE user ID stored in voter_tags as `LINE:<userId>`.
          const lineTag = lineUserId ? `LINE:${lineUserId}` : null
          const voter = lineTag
            ? db.prepare(
                `SELECT v.* FROM voters v
                 INNER JOIN voter_tags vt ON vt.voter_id = v.id
                 WHERE vt.tag = ? AND v.is_active = 1
                 LIMIT 1`
              ).get(lineTag) as any
            : null

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
    const parsed = LinkVoterSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: parsed.error.issues[0].message })
    }
    const { voter_id, line_user_id } = parsed.data

    const voter = db.prepare('SELECT id FROM voters WHERE id=?').get(Number(voter_id)) as any
    if (!voter) return reply.code(404).send({ success: false, error: '選民不存在' })

    // Store LINE user ID as a tag in the dedicated voter_tags table.
    const lineTag = `LINE:${line_user_id}`
    const existing = db.prepare(
      'SELECT id FROM voter_tags WHERE voter_id=? AND tag=?'
    ).get(voter.id, lineTag)
    if (!existing) {
      db.prepare('INSERT INTO voter_tags(voter_id, tag) VALUES(?, ?)').run(voter.id, lineTag)
      db.prepare(
        "UPDATE voters SET updated_at=datetime('now','localtime') WHERE id=?"
      ).run(voter.id)
    }

    return reply.send({ success: true, message: 'LINE 帳號已連結' })
  })

  // GET /api/line/status - check LINE integration status (C-4: requires admin permission)
  fastify.get('/api/line/status', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const linkedCount = (db.prepare(
      `SELECT COUNT(DISTINCT vt.voter_id) AS c
       FROM voter_tags vt
       INNER JOIN voters v ON v.id = vt.voter_id
       WHERE vt.tag LIKE 'LINE:%' AND v.is_active = 1`
    ).get() as any).c
    const channelSecretConfigured = !!getSetting('line_channel_secret')
    return reply.send({ success: true, data: { linked_voters: linkedCount, webhook_active: true, channel_secret_configured: channelSecretConfigured } })
  })
}
