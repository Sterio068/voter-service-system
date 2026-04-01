"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = documentRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
function generateDocNumber(type) {
    const year = new Date().getFullYear();
    const prefix = type === 'incoming' ? '收' : '發';
    const seq = index_1.db.prepare(`SELECT COUNT(*) as count FROM documents WHERE doc_type=? AND doc_number LIKE '${prefix}-${year}-%'`).get(type).count;
    return `${prefix}-${year}-${String(seq + 1).padStart(5, '0')}`;
}
async function documentRoutes(fastify) {
    fastify.get('/api/documents', { preHandler: [(0, auth_1.requirePermission)('documents', 'view')] }, async (request, reply) => {
        const { page = 1, pageSize = 20, doc_type, status, category, assignee_id, start_date, end_date, search } = request.query;
        const conds = [];
        const params = [];
        if (doc_type) {
            conds.push('d.doc_type=?');
            params.push(doc_type);
        }
        if (status) {
            conds.push('d.status=?');
            params.push(status);
        }
        if (category) {
            conds.push('d.category=?');
            params.push(category);
        }
        if (assignee_id) {
            conds.push('d.assignee_id=?');
            params.push(Number(assignee_id));
        }
        if (start_date) {
            conds.push('d.doc_date>=?');
            params.push(start_date);
        }
        if (end_date) {
            conds.push('d.doc_date<=?');
            params.push(end_date);
        }
        if (search) {
            conds.push('d.subject LIKE ?');
            params.push(`%${search}%`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const total = index_1.db.prepare(`SELECT COUNT(*) as count FROM documents d ${where}`).get(...params).count;
        const data = index_1.db.prepare(`
      SELECT d.*, u.name as assignee_name FROM documents d LEFT JOIN users u ON d.assignee_id=u.id
      ${where} ORDER BY d.doc_date DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
        return reply.send({ success: true, data, total, page: Number(page), pageSize: Number(pageSize) });
    });
    fastify.get('/api/documents/:id', { preHandler: [(0, auth_1.requirePermission)('documents', 'view')] }, async (request, reply) => {
        const { id } = request.params;
        const doc = index_1.db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id));
        if (!doc)
            return reply.code(404).send({ success: false, error: '公文不存在' });
        return reply.send({ success: true, data: doc });
    });
    fastify.post('/api/documents', { preHandler: [(0, auth_1.requirePermission)('documents', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const body = request.body;
        if (!body.subject || !String(body.subject).trim()) {
            return reply.code(400).send({ success: false, error: '主旨為必填欄位' });
        }
        if (!body.doc_type || !['incoming', 'outgoing'].includes(body.doc_type)) {
            return reply.code(400).send({ success: false, error: '公文類型無效' });
        }
        if (!body.doc_date) {
            return reply.code(400).send({ success: false, error: '公文日期為必填欄位' });
        }
        const doc_number = generateDocNumber(body.doc_type);
        const fields = ['doc_number', 'doc_type', 'doc_date', 'org_name', 'org_doc_number', 'org_doc_date', 'subject', 'content_summary', 'category', 'assignee_id', 'status', 'deadline', 'related_doc_id', 'related_petition_id'];
        const values = fields.map(f => f === 'doc_number' ? doc_number : (body[f] ?? null));
        const r = index_1.db.prepare(`INSERT INTO documents (${fields.join(',')},created_by) VALUES (${fields.map(() => '?').join(',')},?)`)
            .run(...values, cu.id);
        const newId = r.lastInsertRowid;
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '公文管理', target_type: 'document', target_id: newId, target_name: doc_number });
        return reply.code(201).send({ success: true, data: { id: newId, doc_number }, message: '公文已建立' });
    });
    fastify.put('/api/documents/:id', { preHandler: [(0, auth_1.requirePermission)('documents', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const body = request.body;
        const doc = index_1.db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id));
        if (!doc)
            return reply.code(404).send({ success: false, error: '公文不存在' });
        const allowedFields = ['subject', 'doc_date', 'org_name', 'org_doc_number', 'org_doc_date', 'content_summary',
            'category', 'assignee_id', 'status', 'deadline', 'related_doc_id', 'related_petition_id'];
        const safeData = {};
        for (const k of allowedFields) {
            if (body[k] !== undefined)
                safeData[k] = body[k];
        }
        if (Object.keys(safeData).length === 0) {
            return reply.code(400).send({ success: false, error: '沒有可更新的欄位' });
        }
        const sets = Object.keys(safeData).map(k => `${k}=?`).join(',');
        index_1.db.prepare(`UPDATE documents SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: doc.doc_number });
        return reply.send({ success: true, message: '公文已更新' });
    });
    fastify.delete('/api/documents/:id', { preHandler: [(0, auth_1.requirePermission)('documents', 'delete')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const doc = index_1.db.prepare('SELECT * FROM documents WHERE id=?').get(Number(id));
        if (!doc)
            return reply.code(404).send({ success: false, error: '公文不存在' });
        index_1.db.prepare("UPDATE documents SET status='archived' WHERE id=?").run(Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'delete', module: '公文管理', target_type: 'document', target_id: Number(id), target_name: doc.doc_number });
        return reply.send({ success: true, message: '公文已歸檔' });
    });
}
