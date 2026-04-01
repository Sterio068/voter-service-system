import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'

export default async function electionAreaRoutes(fastify: FastifyInstance) {
  fastify.get('/api/election-areas', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const data = db.prepare('SELECT * FROM election_areas ORDER BY area_code, name').all()
    return reply.send({ success: true, data })
  })

  fastify.post('/api/election-areas', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const body = request.body as any
    if (!body.name) return reply.code(400).send({ success: false, error: '名稱為必填' })
    const r = db.prepare('INSERT INTO election_areas (name,city,district,area_code,note) VALUES (?,?,?,?,?)')
      .run(body.name, body.city ?? null, body.district ?? null, body.area_code ?? null, body.note ?? null)
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  fastify.put('/api/election-areas/:id', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const { id } = request.params as any
    const body = request.body as any
    const area = db.prepare('SELECT * FROM election_areas WHERE id=?').get(Number(id))
    if (!area) return reply.code(404).send({ success: false, error: '選區不存在' })
    const allowed = ['name','city','district','area_code','note']
    const data: Record<string,any> = {}
    for (const k of allowed) { if (body[k] !== undefined) data[k] = body[k] }
    if (Object.keys(data).length === 0) return reply.code(400).send({ success: false, error: '無更新欄位' })
    const sets = Object.keys(data).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE election_areas SET ${sets} WHERE id=?`).run(...Object.values(data), Number(id))
    return reply.send({ success: true, message: '已更新' })
  })

  fastify.delete('/api/election-areas/:id', { preHandler: [requirePermission('admin', 'delete')] }, async (request, reply) => {
    const { id } = request.params as any
    db.prepare('DELETE FROM election_areas WHERE id=?').run(Number(id))
    return reply.send({ success: true, message: '已刪除' })
  })
}
