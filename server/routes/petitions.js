"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = petitionRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
function generateCaseNumber() {
    const year = new Date().getFullYear();
    const seq = index_1.db.prepare(`SELECT COUNT(*) as count FROM petitions WHERE case_number LIKE '${year}-%'`).get().count;
    return `${year}-${String(seq + 1).padStart(6, '0')}`;
}
async function petitionRoutes(fastify) {
    fastify.get('/api/petitions', { preHandler: [(0, auth_1.requirePermission)('petitions', 'view')] }, async (request, reply) => {
        const { page = 1, pageSize = 20, status, category, urgency, assignee_id, start_date, end_date, search, voter_id } = request.query;
        const conds = [];
        const params = [];
        if (status) {
            conds.push('p.status = ?');
            params.push(status);
        }
        if (category) {
            conds.push('p.category = ?');
            params.push(category);
        }
        if (urgency) {
            conds.push('p.urgency = ?');
            params.push(urgency);
        }
        if (assignee_id) {
            conds.push('p.assignee_id = ?');
            params.push(Number(assignee_id));
        }
        if (voter_id) {
            conds.push('p.voter_id = ?');
            params.push(Number(voter_id));
        }
        if (start_date) {
            conds.push('p.petition_date >= ?');
            params.push(start_date);
        }
        if (end_date) {
            conds.push('p.petition_date <= ?');
            params.push(end_date);
        }
        if (search) {
            conds.push('p.content LIKE ?');
            params.push(`%${search}%`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const total = index_1.db.prepare(`SELECT COUNT(*) as count FROM petitions p ${where}`).get(...params).count;
        const data = index_1.db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
        return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) });
    });
    fastify.get('/api/petitions/stats', { preHandler: [(0, auth_1.requirePermission)('petitions', 'view')] }, async (request, reply) => {
        const { year = new Date().getFullYear().toString() } = request.query;
        const byStatus = index_1.db.prepare(`SELECT status, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY status`).all(year);
        const byCategory = index_1.db.prepare(`SELECT category, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY category ORDER BY count DESC`).all(year);
        const byMonth = index_1.db.prepare(`SELECT strftime('%m',petition_date) as month, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY month ORDER BY month`).all(year);
        const byUrgency = index_1.db.prepare(`SELECT urgency, COUNT(*) as count FROM petitions WHERE strftime('%Y',petition_date)=? GROUP BY urgency`).all(year);
        return reply.send({ success: true, data: { byStatus, byCategory, byMonth, byUrgency } });
    });
    fastify.get('/api/petitions/:id', { preHandler: [(0, auth_1.requirePermission)('petitions', 'view')] }, async (request, reply) => {
        const { id } = request.params;
        const petition = index_1.db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      WHERE p.id=?
    `).get(Number(id));
        if (!petition)
            return reply.code(404).send({ success: false, error: '陳情案件不存在' });
        const logs = index_1.db.prepare(`
      SELECT pl.*, u.name as created_by_name FROM petition_logs pl LEFT JOIN users u ON pl.created_by=u.id
      WHERE pl.petition_id=? ORDER BY pl.created_at
    `).all(Number(id));
        return reply.send({ success: true, data: { ...petition, logs } });
    });
    fastify.post('/api/petitions', { preHandler: [(0, auth_1.requirePermission)('petitions', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const body = request.body;
        if (!body.content || !String(body.content).trim()) {
            return reply.code(400).send({ success: false, error: '陳情內容為必填欄位' });
        }
        if (!body.petition_date) {
            return reply.code(400).send({ success: false, error: '陳情日期為必填欄位' });
        }
        const case_number = generateCaseNumber();
        const fields = ['case_number', 'petition_date', 'voter_id', 'channel', 'category', 'subcategory', 'content', 'area_city', 'area_district', 'area_village', 'area_address', 'urgency', 'status', 'assignee_id'];
        const values = fields.map(f => f === 'case_number' ? case_number : (body[f] ?? null));
        const r = index_1.db.prepare(`INSERT INTO petitions (${fields.join(',')},created_by) VALUES (${fields.map(() => '?').join(',')},?)`)
            .run(...values, cu.id);
        const newId = r.lastInsertRowid;
        index_1.db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,created_by) VALUES (?,?,?,?)")
            .run(newId, '受理', `案件受理，陳情方式：${body.channel || '未指定'}`, cu.id);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '陳情管理', target_type: 'petition', target_id: newId, target_name: case_number });
        return reply.code(201).send({ success: true, data: { id: newId, case_number }, message: '陳情案件已建立' });
    });
    fastify.put('/api/petitions/:id', { preHandler: [(0, auth_1.requirePermission)('petitions', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const body = request.body;
        const petition = index_1.db.prepare('SELECT * FROM petitions WHERE id=?').get(Number(id));
        if (!petition)
            return reply.code(404).send({ success: false, error: '陳情案件不存在' });
        // Only allow known updateable fields
        const allowedFields = ['status', 'urgency', 'assignee_id', 'satisfaction', 'category', 'subcategory',
            'channel', 'content', 'area_city', 'area_district', 'area_village', 'area_address', 'petition_date', 'voter_id'];
        const updateData = {};
        for (const k of allowedFields) {
            if (body[k] !== undefined)
                updateData[k] = body[k];
        }
        if (body.status === 'closed' && petition.status !== 'closed')
            updateData.closed_at = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        if (Object.keys(updateData).length === 0) {
            return reply.code(400).send({ success: false, error: '沒有可更新的欄位' });
        }
        const sets = Object.keys(updateData).map(k => `${k}=?`).join(',');
        index_1.db.prepare(`UPDATE petitions SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(updateData), Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '陳情管理', target_type: 'petition', target_id: Number(id), target_name: petition.case_number });
        return reply.send({ success: true, message: '陳情案件已更新' });
    });
    fastify.post('/api/petitions/:id/logs', { preHandler: [(0, auth_1.requirePermission)('petitions', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const { action_type, content, referred_to } = request.body;
        if (!action_type)
            return reply.code(400).send({ success: false, error: '處理方式為必填' });
        if (!content || !String(content).trim())
            return reply.code(400).send({ success: false, error: '處理內容為必填' });
        const petition = index_1.db.prepare('SELECT * FROM petitions WHERE id=?').get(Number(id));
        if (!petition)
            return reply.code(404).send({ success: false, error: '陳情案件不存在' });
        const r = index_1.db.prepare("INSERT INTO petition_logs (petition_id,action_type,content,referred_to,created_by) VALUES (?,?,?,?,?)")
            .run(Number(id), action_type, content, referred_to ?? null, cu.id);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '陳情管理', target_type: 'petition_log', target_id: Number(id), target_name: `${petition.case_number} - ${action_type}` });
        return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } });
    });
}
