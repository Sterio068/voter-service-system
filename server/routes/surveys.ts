import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'

function generatePetitionCaseNumber(): string {
  const year = new Date().getFullYear()
  const seqName = `petition_${year}`
  db.exec('BEGIN IMMEDIATE')
  try {
    const maxRow = db.prepare(
      `SELECT COALESCE(MAX(CAST(SUBSTR(case_number,6) AS INTEGER)),0) AS m FROM petitions WHERE case_number LIKE ?`
    ).get(`${year}-%`) as any
    const currentMax = maxRow?.m ?? 0
    db.prepare(
      "INSERT INTO seq_numbers(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=MAX(value,excluded.value)+1"
    ).run(seqName, currentMax + 1)
    const row = db.prepare('SELECT value FROM seq_numbers WHERE name=?').get(seqName) as any
    db.exec('COMMIT')
    return `${year}-${String(row.value).padStart(5, '0')}`
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

export default async function surveyRoutes(fastify: FastifyInstance) {
  // GET /api/surveys
  fastify.get('/api/surveys', { preHandler: [requirePermission('surveys', 'view')] }, async (request, reply) => {
    const data = db.prepare(`
      SELECT s.*, u.name as creator_name
      FROM surveys s
      LEFT JOIN users u ON s.created_by = u.id
      ORDER BY s.created_at DESC
    `).all()
    return reply.send({ success: true, data })
  })

  // GET /api/surveys/:id (detail + questions)
  fastify.get('/api/surveys/:id', { preHandler: [requirePermission('surveys', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const survey = db.prepare(`
      SELECT s.*, u.name as creator_name
      FROM surveys s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE s.id = ?
    `).get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    const questions = db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id').all(Number(id))
    return reply.send({ success: true, data: { ...survey, questions } })
  })

  // POST /api/surveys
  fastify.post('/api/surveys', { preHandler: [requirePermission('surveys', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const body = request.body as any
    if (!body.title || !String(body.title).trim()) {
      return reply.code(400).send({ success: false, error: '問卷標題為必填' })
    }
    const r = db.prepare('INSERT INTO surveys (title, description, created_by) VALUES (?, ?, ?)').run(
      body.title, body.description ?? null, cu.id
    )
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '問卷管理', target_type: 'survey', target_id: newId, target_name: body.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '問卷已建立' })
  })

  // PUT /api/surveys/:id
  fastify.put('/api/surveys/:id', { preHandler: [requirePermission('surveys', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    const safeData: Record<string, any> = {}
    if (body.title !== undefined) safeData.title = body.title
    if (body.description !== undefined) safeData.description = body.description
    if (body.status !== undefined) {
      safeData.status = body.status
      if (body.status === 'closed' && survey.status !== 'closed') {
        safeData.closed_at = new Date().toISOString().replace('T', ' ').slice(0, 19)
      }
    }
    if (Object.keys(safeData).length === 0) {
      return reply.code(400).send({ success: false, error: '沒有可更新的欄位' })
    }
    const sets = Object.keys(safeData).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE surveys SET ${sets} WHERE id=?`).run(...Object.values(safeData), Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '問卷管理', target_type: 'survey', target_id: Number(id), target_name: survey.title })
    return reply.send({ success: true, message: '問卷已更新' })
  })

  // POST /api/surveys/:id/questions
  fastify.post('/api/surveys/:id/questions', { preHandler: [requirePermission('surveys', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    if (!body.question || !String(body.question).trim()) {
      return reply.code(400).send({ success: false, error: '問題內容為必填' })
    }
    const r = db.prepare(
      'INSERT INTO survey_questions (survey_id, question, question_type, options, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(Number(id), body.question, body.question_type ?? 'text', body.options ?? null, body.sort_order ?? 0)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '問卷管理', target_type: 'survey_question', target_id: newId, target_name: survey.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '問題已新增' })
  })

  // DELETE /api/surveys/:id/questions/:qid
  fastify.delete('/api/surveys/:id/questions/:qid', { preHandler: [requirePermission('surveys', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id, qid } = request.params as any
    const question = db.prepare('SELECT * FROM survey_questions WHERE id = ? AND survey_id = ?').get(Number(qid), Number(id)) as any
    if (!question) return reply.code(404).send({ success: false, error: '問題不存在' })
    db.prepare('DELETE FROM survey_questions WHERE id=?').run(Number(qid))
    createAuditLog(request, cu.id, { action: 'delete', module: '問卷管理', target_type: 'survey_question', target_id: Number(qid), target_name: question.question })
    return reply.send({ success: true, message: '問題已刪除' })
  })

  // POST /api/surveys/:id/responses
  fastify.post('/api/surveys/:id/responses', { preHandler: [requirePermission('surveys', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const body = request.body as any
    const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    if (!body.answers) return reply.code(400).send({ success: false, error: '答案為必填' })
    const answersStr = typeof body.answers === 'string' ? body.answers : JSON.stringify(body.answers)
    const r = db.prepare(
      'INSERT INTO survey_responses (survey_id, voter_id, respondent_name, answers) VALUES (?, ?, ?, ?)'
    ).run(Number(id), body.voter_id ?? null, body.respondent_name ?? null, answersStr)
    const newId = r.lastInsertRowid as number
    createAuditLog(request, cu.id, { action: 'create', module: '問卷管理', target_type: 'survey_response', target_id: newId, target_name: survey.title })
    return reply.code(201).send({ success: true, data: { id: newId }, message: '問卷回覆已提交' })
  })

  // GET /api/surveys/:id/responses
  fastify.get('/api/surveys/:id/responses', { preHandler: [requirePermission('surveys', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const { page = 1, pageSize = 20 } = request.query as any
    const survey = db.prepare('SELECT id FROM surveys WHERE id = ?').get(Number(id))
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    const total = (db.prepare('SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?').get(Number(id)) as any).count
    const data = db.prepare(`
      SELECT sr.*, v.name as voter_name
      FROM survey_responses sr
      LEFT JOIN voters v ON sr.voter_id = v.id
      WHERE sr.survey_id = ?
      ORDER BY sr.submitted_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(id), Number(pageSize), (Number(page) - 1) * Number(pageSize))
    return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // W-8: Survey response → petition one-click
  fastify.post('/api/surveys/responses/:responseId/to-petition', { preHandler: [requirePermission('petitions', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { responseId } = request.params as any
    const response = db.prepare(`
      SELECT sr.*, s.title as survey_title, s.description as survey_description, s.category as survey_category
      FROM survey_responses sr
      LEFT JOIN surveys s ON sr.survey_id = s.id
      WHERE sr.id = ?
    `).get(Number(responseId)) as any
    if (!response) return reply.code(404).send({ success: false, error: '問卷回覆不存在' })

    const answersText = typeof response.answers === 'string' ? response.answers : JSON.stringify(response.answers)
    const content = `【來自問卷：${response.survey_title}】\n${answersText}`
    const category = (response as any).survey_category ?? null
    const voter_id = response.voter_id ?? null
    const today = new Date().toISOString().slice(0, 10)
    const case_number = generatePetitionCaseNumber()

    const r = db.prepare(`
      INSERT INTO petitions (case_number, petition_date, voter_id, channel, category, content, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(case_number, today, voter_id, '問卷', category, content, cu.id)
    const newId = r.lastInsertRowid as number

    db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,created_by) VALUES (?,?,?,?)")
      .run(newId, '受理', `由問卷回覆(ID:${responseId})自動建立`, cu.id)

    createAuditLog(request, cu.id, { action: 'create', module: '陳情管理', target_type: 'petition', target_id: newId, target_name: case_number })
    return reply.code(201).send({ success: true, data: { id: newId, case_number }, message: '陳情案件已建立' })
  })

  // GET /api/surveys/:id/stats
  fastify.get('/api/surveys/:id/stats', { preHandler: [requirePermission('surveys', 'view')] }, async (request, reply) => {
    const { id } = request.params as any
    const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    const questions = db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id').all(Number(id)) as any[]
    const responses = db.prepare('SELECT answers FROM survey_responses WHERE survey_id = ?').all(Number(id)) as any[]
    const total_responses = responses.length

    const stats = questions.map(q => {
      const answerCounts: Record<string, number> = {}
      const allAnswers: any[] = []
      for (const resp of responses) {
        try {
          const parsed = typeof resp.answers === 'string' ? JSON.parse(resp.answers) : resp.answers
          const ans = parsed[q.id]
          if (ans !== undefined && ans !== null) {
            allAnswers.push(ans)
            if (q.question_type === 'single_choice' || q.question_type === 'rating') {
              const key = String(ans)
              answerCounts[key] = (answerCounts[key] || 0) + 1
            } else if (q.question_type === 'multi_choice' && Array.isArray(ans)) {
              for (const a of ans) {
                const key = String(a)
                answerCounts[key] = (answerCounts[key] || 0) + 1
              }
            }
          }
        } catch {}
      }
      return {
        question_id: q.id,
        question: q.question,
        question_type: q.question_type,
        answer_count: allAnswers.length,
        answer_distribution: answerCounts,
      }
    })

    return reply.send({ success: true, data: { survey_id: Number(id), total_responses, stats } })
  })

  // 刪除問卷
  fastify.delete('/api/surveys/:id', { preHandler: [requirePermission('surveys', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const survey = db.prepare('SELECT * FROM surveys WHERE id=?').get(Number(id)) as any
    if (!survey) return reply.code(404).send({ success: false, error: '問卷不存在' })
    db.transaction(() => {
      db.prepare('DELETE FROM survey_responses WHERE survey_id=?').run(Number(id))
      db.prepare('DELETE FROM survey_questions WHERE survey_id=?').run(Number(id))
      db.prepare('DELETE FROM surveys WHERE id=?').run(Number(id))
    })()
    createAuditLog(request, cu.id, { action: 'delete', module: '問卷管理', target_type: 'survey', target_id: Number(id), target_name: survey.title })
    return reply.send({ success: true, message: '問卷已刪除' })
  })
}
