import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export default async function searchRoutes(fastify: FastifyInstance) {
  // GET /api/search?q=keyword&types=voter,petition,task,document,event
  fastify.get('/api/search', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { q, types = 'voter,petition,task,document,event' } = request.query as any
    if (!q || String(q).trim().length < 1) return reply.send({ success: true, data: {} })

    const escaped = escapeLike(String(q).trim())
    const keyword = `%${escaped}%`
    const typeList = String(types).split(',').map((s: string) => s.trim())
    const results: Record<string, any[]> = {}

    if (typeList.includes('voter')) {
      // support_level lives in voter_engagement, not voters; LEFT JOIN so voters
      // without engagement still appear in results with NULL support_level.
      results.voters = db.prepare(`
        SELECT v.id, v.name, v.mobile, v.addr_district, ve.support_level, 'voter' as type
        FROM voters v
        LEFT JOIN voter_engagement ve ON ve.voter_id = v.id
        WHERE v.is_active=1
          AND (v.name LIKE ? ESCAPE '\\' OR v.mobile LIKE ? ESCAPE '\\' OR v.id_number LIKE ? ESCAPE '\\')
        LIMIT 10
      `).all(keyword, keyword, keyword)
    }

    if (typeList.includes('petition')) {
      results.petitions = db.prepare(`
        SELECT id, case_number, content, status, urgency, 'petition' as type
        FROM petitions WHERE is_active=1 AND (content LIKE ? ESCAPE '\\' OR case_number LIKE ? ESCAPE '\\')
        LIMIT 10
      `).all(keyword, keyword)
    }

    if (typeList.includes('task')) {
      results.tasks = db.prepare(`
        SELECT t.id, t.title, t.status, t.priority, t.due_date, 'task' as type
        FROM tasks t WHERE t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\'
        LIMIT 10
      `).all(keyword, keyword)
    }

    if (typeList.includes('document')) {
      results.documents = db.prepare(`
        SELECT id, subject as title, category, 'document' as type
        FROM documents WHERE subject LIKE ? ESCAPE '\\' OR content_summary LIKE ? ESCAPE '\\'
        LIMIT 10
      `).all(keyword, keyword)
    }

    if (typeList.includes('event')) {
      results.events = db.prepare(`
        SELECT id, title, event_date, location, 'event' as type
        FROM events WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
        LIMIT 10
      `).all(keyword, keyword)
    }

    const total = Object.values(results).reduce((s, arr) => s + arr.length, 0)
    return reply.send({ success: true, data: results, total })
  })
}
