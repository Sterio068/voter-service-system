"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scheduleRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
async function scheduleRoutes(fastify) {
    fastify.get('/api/schedules', { preHandler: [(0, auth_1.requirePermission)('schedules', 'view')] }, async (request, reply) => {
        const { start, end, status, schedule_type } = request.query;
        const conds = [];
        const params = [];
        if (start) {
            conds.push('s.start_time >= ?');
            params.push(start);
        }
        if (end) {
            conds.push('s.start_time <= ?');
            params.push(end);
        }
        if (status) {
            conds.push('s.status = ?');
            params.push(status);
        }
        if (schedule_type) {
            conds.push('s.schedule_type = ?');
            params.push(schedule_type);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const data = index_1.db.prepare(`
      SELECT s.*, u.name as creator_name FROM schedules s LEFT JOIN users u ON s.created_by=u.id
      ${where} ORDER BY s.start_time
    `).all(...params);
        return reply.send({ success: true, data });
    });
    fastify.get('/api/schedules/:id', { preHandler: [(0, auth_1.requirePermission)('schedules', 'view')] }, async (request, reply) => {
        const { id } = request.params;
        const s = index_1.db.prepare('SELECT * FROM schedules WHERE id=?').get(Number(id));
        if (!s)
            return reply.code(404).send({ success: false, error: '行程不存在' });
        return reply.send({ success: true, data: s });
    });
    fastify.post('/api/schedules', { preHandler: [(0, auth_1.requirePermission)('schedules', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const body = request.body;
        if (!body.title || !String(body.title).trim()) {
            return reply.code(400).send({ success: false, error: '行程標題為必填欄位' });
        }
        if (!body.start_time) {
            return reply.code(400).send({ success: false, error: '開始時間為必填欄位' });
        }
        // 衝突偵測
        if (body.start_time && body.end_time) {
            const conflict = index_1.db.prepare(`SELECT * FROM schedules WHERE end_time IS NOT NULL AND start_time <= ? AND end_time >= ? LIMIT 1`)
                .get(body.end_time, body.start_time);
            if (conflict)
                return reply.code(409).send({ success: false, error: `時間與「${conflict.title}」衝突`, conflict });
        }
        const fields = ['title', 'start_time', 'end_time', 'schedule_type', 'location', 'attendees', 'related_voter_ids', 'related_group_ids', 'related_petition_id', 'note', 'is_recurring', 'recurrence_rule', 'status', 'reminder_minutes'];
        const values = fields.map(f => body[f] ?? null);
        const r = index_1.db.prepare(`INSERT INTO schedules (${fields.join(',')},created_by) VALUES (${fields.map(() => '?').join(',')},?)`)
            .run(...values, cu.id);
        const newId = r.lastInsertRowid;
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '行程管理', target_type: 'schedule', target_id: newId, target_name: body.title });
        return reply.code(201).send({ success: true, data: { id: newId }, message: '行程已建立' });
    });
    fastify.put('/api/schedules/:id', { preHandler: [(0, auth_1.requirePermission)('schedules', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const body = request.body;
        const s = index_1.db.prepare('SELECT * FROM schedules WHERE id=?').get(Number(id));
        if (!s)
            return reply.code(404).send({ success: false, error: '行程不存在' });
        const allowedFields = ['title', 'start_time', 'end_time', 'schedule_type', 'location', 'attendees',
            'related_voter_ids', 'related_group_ids', 'related_petition_id', 'note', 'is_recurring',
            'recurrence_rule', 'status', 'reminder_minutes'];
        const safeData = {};
        for (const k of allowedFields) {
            if (body[k] !== undefined)
                safeData[k] = body[k];
        }
        if (Object.keys(safeData).length === 0) {
            return reply.code(400).send({ success: false, error: '沒有可更新的欄位' });
        }
        const sets = Object.keys(safeData).map(k => `${k}=?`).join(',');
        index_1.db.prepare(`UPDATE schedules SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '行程管理', target_type: 'schedule', target_id: Number(id), target_name: s.title });
        return reply.send({ success: true, message: '行程已更新' });
    });
    fastify.delete('/api/schedules/:id', { preHandler: [(0, auth_1.requirePermission)('schedules', 'delete')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const s = index_1.db.prepare('SELECT * FROM schedules WHERE id=?').get(Number(id));
        if (!s)
            return reply.code(404).send({ success: false, error: '行程不存在' });
        index_1.db.prepare('DELETE FROM schedules WHERE id=?').run(Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'delete', module: '行程管理', target_type: 'schedule', target_id: Number(id), target_name: s.title });
        return reply.send({ success: true, message: '行程已刪除' });
    });
}
