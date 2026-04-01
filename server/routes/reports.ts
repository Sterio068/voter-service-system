import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'

export default async function reportRoutes(fastify: FastifyInstance) {
  // R-N1: Assignee workload
  fastify.get('/api/reports/assignee-workload', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString() } = request.query as any
    const data = db.prepare(`
      SELECT u.id, u.name,
        COUNT(CASE WHEN p.status NOT IN ('closed','cancelled') THEN 1 END) as active_count,
        COUNT(CASE WHEN p.status = 'closed' AND strftime('%Y',p.closed_at)=? THEN 1 END) as closed_count,
        COUNT(CASE WHEN p.status NOT IN ('closed','cancelled') AND p.due_date IS NOT NULL AND p.due_date < date('now') THEN 1 END) as overdue_count,
        ROUND(AVG(CASE WHEN p.status='closed' AND p.closed_at IS NOT NULL
          THEN (julianday(p.closed_at) - julianday(p.petition_date)) END), 1) as avg_days,
        ROUND(AVG(CASE WHEN p.satisfaction_rating IS NOT NULL THEN p.satisfaction_rating END), 2) as avg_satisfaction
      FROM users u LEFT JOIN petitions p ON p.assignee_id=u.id AND strftime('%Y',p.petition_date)=?
      WHERE u.is_active=1 GROUP BY u.id, u.name ORDER BY active_count DESC
    `).all(year, year)
    return reply.send({ success: true, data })
  })

  // R-N2: Area heatmap
  fastify.get('/api/reports/area-heatmap', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString() } = request.query as any
    const data = db.prepare(`
      SELECT
        COALESCE(area_district, '未指定') as district,
        COALESCE(area_city, '未指定') as city,
        COUNT(*) as count,
        COUNT(CASE WHEN status NOT IN ('closed','cancelled') THEN 1 END) as active_count
      FROM petitions
      WHERE strftime('%Y',petition_date)=?
      GROUP BY area_city, area_district ORDER BY count DESC
    `).all(year)
    return reply.send({ success: true, data })
  })

  // R-N3: Monthly trend comparison
  fastify.get('/api/reports/monthly-trend', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const thisYear = new Date().getFullYear().toString()
    const lastYear = (new Date().getFullYear() - 1).toString()
    const petitions_this = db.prepare(`SELECT strftime('%m',petition_date) as month, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY month`).all(thisYear)
    const petitions_last = db.prepare(`SELECT strftime('%m',petition_date) as month, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY month`).all(lastYear)
    const docs_this = db.prepare(`SELECT strftime('%m',doc_date) as month, COUNT(*) as count FROM documents WHERE strftime('%Y',doc_date)=? GROUP BY month`).all(thisYear)
    return reply.send({ success: true, data: { petitions_this, petitions_last, docs_this, thisYear, lastYear } })
  })

  // R-N5: Closure efficiency
  fastify.get('/api/reports/closure-efficiency', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString() } = request.query as any
    const byMonth = db.prepare(`
      SELECT strftime('%m',petition_date) as month,
        COUNT(*) as total,
        COUNT(CASE WHEN status='closed' THEN 1 END) as closed,
        ROUND(AVG(CASE WHEN status='closed' AND closed_at IS NOT NULL
          THEN (julianday(closed_at) - julianday(petition_date)) END), 1) as avg_days
      FROM petitions WHERE strftime('%Y',petition_date)=?
      GROUP BY month ORDER BY month
    `).all(year)
    const byCategory = db.prepare(`
      SELECT COALESCE(category,'未分類') as category,
        COUNT(*) as total,
        ROUND(AVG(CASE WHEN status='closed' AND closed_at IS NOT NULL
          THEN (julianday(closed_at) - julianday(petition_date)) END), 1) as avg_days
      FROM petitions WHERE strftime('%Y',petition_date)=?
      GROUP BY category ORDER BY avg_days DESC
    `).all(year)
    return reply.send({ success: true, data: { byMonth, byCategory } })
  })

  // R-N6: Satisfaction ranking
  fastify.get('/api/reports/satisfaction-ranking', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString() } = request.query as any
    const data = db.prepare(`
      SELECT u.name,
        COUNT(p.id) as total,
        COUNT(p.satisfaction_rating) as rated_count,
        ROUND(AVG(p.satisfaction_rating), 2) as avg_rating
      FROM users u JOIN petitions p ON p.assignee_id=u.id
      WHERE strftime('%Y',p.petition_date)=? AND p.satisfaction_rating IS NOT NULL
      GROUP BY u.id, u.name ORDER BY avg_rating DESC
    `).all(year)
    return reply.send({ success: true, data })
  })

  // R-N7: Voter activity scores
  fastify.get('/api/reports/voter-activity', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT v.id, v.name, v.mobile, v.household_district,
        COUNT(DISTINCT p.id) as petition_count,
        COUNT(DISTINCT c.id) as contact_count,
        MAX(c.contact_date) as last_contact,
        (COUNT(DISTINCT p.id) * 2 + COUNT(DISTINCT c.id)) as activity_score
      FROM voters v
      LEFT JOIN petitions p ON p.voter_id=v.id
      LEFT JOIN contact_records c ON c.voter_id=v.id
      WHERE v.is_active=1
      GROUP BY v.id ORDER BY activity_score DESC LIMIT 100
    `).all()
    return reply.send({ success: true, data })
  })

  // R-N8: Area penetration
  fastify.get('/api/reports/area-penetration', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT
        COALESCE(household_district,'未指定') as district,
        COUNT(*) as voter_count,
        COUNT(CASE WHEN is_active=1 THEN 1 END) as active_voters,
        (SELECT COUNT(*) FROM petitions p2 WHERE p2.voter_id IN (
          SELECT id FROM voters WHERE household_district=v.household_district AND is_active=1
        )) as petition_count
      FROM voters v WHERE is_active=1
      GROUP BY household_district ORDER BY voter_count DESC
    `).all()
    return reply.send({ success: true, data })
  })

  // R-1: No-contact voters report
  fastify.get('/api/reports/no-contact-voters', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { days = 90 } = request.query as any
    const data = db.prepare(`
      SELECT v.id, v.name, v.mobile, v.household_district,
        MAX(c.contact_date) as last_contact,
        COUNT(p.id) as petition_count,
        CAST(julianday('now') - julianday(COALESCE(MAX(c.contact_date), v.created_at)) AS INTEGER) as days_since_contact
      FROM voters v
      LEFT JOIN contact_records c ON c.voter_id=v.id
      LEFT JOIN petitions p ON p.voter_id=v.id
      WHERE v.is_active=1
      GROUP BY v.id
      HAVING days_since_contact >= ?
      ORDER BY days_since_contact DESC
      LIMIT 100
    `).all(Number(days))
    return reply.send({ success: true, data })
  })

  // R-2: High-risk petitions
  fastify.get('/api/reports/high-risk-petitions', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name,
        CAST(julianday('now') - julianday(p.petition_date) AS INTEGER) as age_days,
        CASE
          WHEN p.due_date < date('now') AND p.status NOT IN ('closed','cancelled') THEN 'overdue'
          WHEN p.satisfaction_rating <= 2 THEN 'low_satisfaction'
          ELSE 'stale'
        END as risk_type
      FROM petitions p
      LEFT JOIN voters v ON p.voter_id=v.id
      LEFT JOIN users u ON p.assignee_id=u.id
      WHERE p.status NOT IN ('closed','cancelled') AND (
        (p.due_date IS NOT NULL AND p.due_date < date('now'))
        OR p.satisfaction_rating <= 2
        OR (julianday('now') - julianday(p.petition_date)) > 30
      )
      ORDER BY p.due_date ASC, p.satisfaction_rating ASC
      LIMIT 50
    `).all()
    return reply.send({ success: true, data })
  })

  // R-3: Area management gap
  fastify.get('/api/reports/area-gap', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT
        COALESCE(v.household_district, '未指定') as district,
        COUNT(DISTINCT v.id) as total_voters,
        COUNT(DISTINCT CASE WHEN c.contact_date > date('now','-90 days') THEN v.id END) as contacted_90d,
        COUNT(DISTINCT ep.voter_id) as event_participants,
        COUNT(DISTINCT p.id) as petition_count,
        ROUND(COUNT(DISTINCT CASE WHEN c.contact_date > date('now','-90 days') THEN v.id END) * 100.0 / NULLIF(COUNT(DISTINCT v.id),0), 1) as contact_rate
      FROM voters v
      LEFT JOIN contact_records c ON c.voter_id=v.id
      LEFT JOIN event_participants ep ON ep.voter_id=v.id
      LEFT JOIN petitions p ON p.voter_id=v.id AND p.petition_date > date('now','-365 days')
      WHERE v.is_active=1
      GROUP BY v.household_district
      ORDER BY contact_rate ASC
    `).all()
    return reply.send({ success: true, data })
  })

  // R-4: Weekly report data
  fastify.get('/api/reports/weekly', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { start_date } = request.query as any
    const weekStart = start_date || (() => {
      const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10)
    })()
    const weekEnd = (() => {
      const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10)
    })()

    const newPetitions = db.prepare("SELECT COUNT(*) as c FROM petitions WHERE DATE(petition_date) BETWEEN ? AND ?").get(weekStart, weekEnd) as any
    const closed = db.prepare("SELECT COUNT(*) as c FROM petitions WHERE DATE(closed_at) BETWEEN ? AND ?").get(weekStart, weekEnd) as any
    const overdue = db.prepare("SELECT COUNT(*) as c FROM petitions WHERE due_date < date('now') AND status NOT IN ('closed','cancelled')").get() as any
    const contacts = db.prepare("SELECT COUNT(*) as c FROM contact_records WHERE DATE(contact_date) BETWEEN ? AND ?").get(weekStart, weekEnd) as any

    const topAreas = db.prepare(`SELECT COALESCE(area_district,'未指定') as district, COUNT(*) as count FROM petitions WHERE DATE(petition_date) BETWEEN ? AND ? GROUP BY area_district ORDER BY count DESC LIMIT 5`).all(weekStart, weekEnd)
    const topCategories = db.prepare(`SELECT COALESCE(category,'未分類') as category, COUNT(*) as count FROM petitions WHERE DATE(petition_date) BETWEEN ? AND ? GROUP BY category ORDER BY count DESC LIMIT 5`).all(weekStart, weekEnd)
    const nextWeekSchedules = db.prepare(`SELECT COUNT(*) as c FROM schedules WHERE DATE(start_time) BETWEEN date('now') AND date('now','+7 days') AND is_active=1`).get() as any

    return reply.send({ success: true, data: { weekStart, weekEnd, new_petitions: newPetitions.c, closed: closed.c, overdue: overdue.c, contacts: contacts.c, next_week_schedules: nextWeekSchedules.c, top_areas: topAreas, top_categories: topCategories } })
  })

  // R-6: Type × Area cross analysis
  fastify.get('/api/reports/type-area-cross', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { year = new Date().getFullYear().toString(), category } = request.query as any
    let where = `WHERE strftime('%Y',petition_date)=?`
    const params: any[] = [year]
    if (category) { where += ` AND category=?`; params.push(category) }

    const data = db.prepare(`
      SELECT
        COALESCE(area_district,'未指定') as district,
        COALESCE(category,'未分類') as category,
        COUNT(*) as count
      FROM petitions ${where}
      GROUP BY area_district, category
      ORDER BY district, count DESC
    `).all(...params)

    const categories = db.prepare(`SELECT DISTINCT COALESCE(category,'未分類') as c FROM petitions WHERE strftime('%Y',petition_date)=? ORDER BY c`).all(year).map((r: any) => r.c)
    const districts = db.prepare(`SELECT DISTINCT COALESCE(area_district,'未指定') as d FROM petitions WHERE strftime('%Y',petition_date)=? ORDER BY d`).all(year).map((r: any) => r.d)

    return reply.send({ success: true, data, categories, districts })
  })

  // R-7: Voter Lifecycle Funnel
  fastify.get('/api/reports/voter-lifecycle', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const total = (db.prepare(`SELECT COUNT(*) as c FROM voters WHERE is_active=1`).get() as any).c
    const contacted = (db.prepare(`SELECT COUNT(DISTINCT voter_id) as c FROM contact_records WHERE voter_id IN (SELECT id FROM voters WHERE is_active=1)`).get() as any).c
    const engaged = (db.prepare(`SELECT COUNT(*) as c FROM voters WHERE is_active=1 AND support_level >= 3`).get() as any).c
    const active = (db.prepare(`SELECT COUNT(*) as c FROM voters WHERE is_active=1 AND (activity_score >= 50 OR engagement_score >= 50)`).get() as any).c
    const core_supporters = (db.prepare(`SELECT COUNT(*) as c FROM voters WHERE is_active=1 AND support_level = 5`).get() as any).c
    return reply.send({ success: true, data: { total, contacted, engaged, active, core_supporters } })
  })

  // R-8: Event ROI Report
  fastify.get('/api/reports/event-roi', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const events = db.prepare(`
      SELECT e.id, e.title, e.event_date,
        COALESCE(e.participant_count, 0) as participant_count
      FROM events e
      WHERE e.event_date >= date('now', '-6 months')
      ORDER BY COALESCE(e.participant_count, 0) DESC
    `).all()
    const result = (events as any[]).map((ev: any) => {
      const sameDay = (db.prepare(`SELECT COUNT(*) as c FROM contact_records WHERE DATE(contact_date)=DATE(?)`).get(ev.event_date) as any).c
      return { ...ev, same_day_contacts: sameDay }
    })
    return reply.send({ success: true, data: result })
  })

  // R-9: Notification Reach Rate
  fastify.get('/api/reports/notification-reach', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const byChannel = db.prepare(`
      SELECT COALESCE(channel,'未知') as channel,
        COUNT(*) as total,
        COUNT(CASE WHEN status='sent' OR sent_at IS NOT NULL THEN 1 END) as sent
      FROM notifications
      GROUP BY channel
    `).all()
    const byMonth = db.prepare(`
      SELECT strftime('%Y-%m', sent_at) as month, COUNT(*) as sent
      FROM notifications
      WHERE sent_at >= date('now', '-6 months') AND (status='sent' OR sent_at IS NOT NULL)
      GROUP BY month ORDER BY month
    `).all()
    const overall = db.prepare(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN status='sent' OR sent_at IS NOT NULL THEN 1 END) as sent
      FROM notifications
    `).get() as any
    const overall_sent_rate = overall.total > 0 ? Math.round(overall.sent / overall.total * 100) : 0
    return reply.send({ success: true, data: { byChannel, byMonth, overall_sent_rate, overall_sent: overall.sent, overall_total: overall.total } })
  })

  // R-10: Issue Trend Line Chart
  fastify.get('/api/reports/issue-trend', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const { months = '6' } = request.query as any
    const data = db.prepare(`
      SELECT strftime('%Y-%m', petition_date) as month,
        COALESCE(category, '未分類') as category,
        COUNT(*) as count
      FROM petitions
      WHERE petition_date >= date('now', '-' || ? || ' months')
      GROUP BY month, category
      ORDER BY month, count DESC
    `).all(Number(months))
    return reply.send({ success: true, data })
  })

  // R-11: Team Collaboration Efficiency
  fastify.get('/api/reports/team-efficiency', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT u.id, u.name,
        COUNT(DISTINCT p.id) as petition_count,
        ROUND(AVG(CASE WHEN p.status='closed' AND p.closed_at IS NOT NULL
          THEN (julianday(p.closed_at) - julianday(p.petition_date)) END), 1) as avg_close_days,
        ROUND(
          COUNT(CASE WHEN p.status='closed' AND p.due_date IS NOT NULL AND p.closed_at <= p.due_date THEN 1 END) * 100.0
          / NULLIF(COUNT(CASE WHEN p.status='closed' AND p.due_date IS NOT NULL THEN 1 END), 0)
        , 1) as on_time_rate,
        (SELECT COUNT(*) FROM contact_records cr WHERE cr.created_by=u.id AND cr.contact_date >= date('now','-30 days')) as contact_count
      FROM users u
      LEFT JOIN petitions p ON p.assignee_id=u.id
      WHERE u.is_active=1
      GROUP BY u.id, u.name
      ORDER BY on_time_rate DESC
    `).all()
    return reply.send({ success: true, data })
  })

  // R-12: Survey Response Cross-Analysis
  fastify.get('/api/reports/survey-cross', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const { survey_id } = request.query as any
    if (!survey_id) {
      const surveys = db.prepare(`
        SELECT s.id, s.title, s.created_at,
          COUNT(DISTINCT sr.id) as response_count
        FROM surveys s
        LEFT JOIN survey_responses sr ON sr.survey_id=s.id
        GROUP BY s.id, s.title, s.created_at
        ORDER BY s.created_at DESC
      `).all()
      return reply.send({ success: true, surveys, survey_id: null })
    }
    const survey = db.prepare(`SELECT id, title FROM surveys WHERE id=?`).get(Number(survey_id)) as any
    const byDistrict = db.prepare(`
      SELECT COALESCE(v.household_district, '未指定') as district, COUNT(*) as count
      FROM survey_responses sr
      JOIN voters v ON sr.voter_id=v.id
      WHERE sr.survey_id=?
      GROUP BY district ORDER BY count DESC
    `).all(Number(survey_id))
    return reply.send({ success: true, survey, byDistrict, survey_id: Number(survey_id) })
  })

  // C-2: Key Influencer Report
  fastify.get('/api/reports/key-influencers', { preHandler: [requirePermission('voters', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT
        v.id, v.name, v.mobile, v.addr_district, v.support_level, v.activity_score, v.tags,
        COUNT(DISTINCT cr.id) as contact_count,
        COUNT(DISTINCT rv.id) as referrer_count,
        COUNT(DISTINCT ep.id) as event_count,
        COUNT(DISTINCT p.id) as petition_count,
        (COUNT(DISTINCT cr.id) * 2 + COUNT(DISTINCT rv.id) * 5 + COUNT(DISTINCT ep.id) * 3 + COALESCE(v.activity_score, 0)) as influence_score
      FROM voters v
      LEFT JOIN contact_records cr ON cr.voter_id = v.id
      LEFT JOIN voters rv ON rv.referrer_id = v.id
      LEFT JOIN event_participants ep ON ep.voter_id = v.id
      LEFT JOIN petitions p ON p.voter_id = v.id
      WHERE v.is_active = 1
      GROUP BY v.id
      ORDER BY influence_score DESC
      LIMIT 50
    `).all()
    return reply.send({ success: true, data })
  })

  // R-13: Assignee Load Index
  fastify.get('/api/reports/assignee-load', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT u.id, u.name,
        COUNT(DISTINCT CASE WHEN p.status NOT IN ('closed','cancelled') THEN p.id END) as open_petitions,
        COUNT(DISTINCT CASE WHEN t.status NOT IN ('done','cancelled') THEN t.id END) as open_tasks
      FROM users u
      LEFT JOIN petitions p ON p.assignee_id=u.id
      LEFT JOIN tasks t ON t.assignee_id=u.id
      WHERE u.is_active=1
      GROUP BY u.id, u.name
    `).all()
    const maxLoad = Math.max(...(data as any[]).map((r: any) => r.open_petitions * 2 + r.open_tasks), 1)
    const result = (data as any[]).map((r: any) => {
      const total_load = r.open_petitions * 2 + r.open_tasks
      return { ...r, total_load, load_index: Math.round(total_load / maxLoad * 100) }
    }).sort((a: any, b: any) => b.total_load - a.total_load)
    return reply.send({ success: true, data: result })
  })
}
