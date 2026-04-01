"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = adminRoutes;
const bcrypt_1 = __importDefault(require("bcrypt"));
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
async function adminRoutes(fastify) {
    // ===== 帳號管理 =====
    fastify.get('/api/admin/users', { preHandler: [(0, auth_1.requirePermission)('users', 'view')] }, async (_, reply) => {
        const users = index_1.db.prepare('SELECT id,username,name,role,email,phone,is_active,created_at,updated_at FROM users ORDER BY created_at').all();
        return reply.send({ success: true, data: users });
    });
    fastify.post('/api/admin/users', { preHandler: [(0, auth_1.requirePermission)('users', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { username, password, name, role, email, phone } = request.body;
        if (!username || !password || !name || !role)
            return reply.code(400).send({ success: false, error: '帳號、密碼、姓名、角色為必填' });
        if (password.length < 8)
            return reply.code(400).send({ success: false, error: '密碼至少需要 8 個字元' });
        if (!['admin', 'supervisor', 'assistant', 'volunteer'].includes(role))
            return reply.code(400).send({ success: false, error: '無效的角色' });
        const existing = index_1.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing)
            return reply.code(409).send({ success: false, error: '帳號已存在' });
        const hashed = await bcrypt_1.default.hash(password, 12);
        const r = index_1.db.prepare('INSERT INTO users (username,password,name,role,email,phone) VALUES (?,?,?,?,?,?)').run(username, hashed, name, role, email ?? null, phone ?? null);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '帳號管理', target_type: 'user', target_id: r.lastInsertRowid, target_name: name });
        return reply.code(201).send({ success: true, message: '使用者已建立', data: { id: r.lastInsertRowid } });
    });
    fastify.put('/api/admin/users/:id', { preHandler: [(0, auth_1.requirePermission)('users', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const { name, role, email, phone, is_active } = request.body;
        const user = index_1.db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
        if (!user)
            return reply.code(404).send({ success: false, error: '使用者不存在' });
        if (role !== undefined && !['admin', 'supervisor', 'assistant', 'volunteer'].includes(role)) {
            return reply.code(400).send({ success: false, error: '無效的角色' });
        }
        index_1.db.prepare("UPDATE users SET name=?,role=?,email=?,phone=?,is_active=?,updated_at=datetime('now','localtime') WHERE id=?")
            .run(name ?? user.name, role ?? user.role, email ?? user.email, phone ?? user.phone, is_active ?? user.is_active, Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '帳號管理', target_type: 'user', target_id: Number(id), target_name: user.name });
        return reply.send({ success: true, message: '使用者已更新' });
    });
    fastify.put('/api/admin/users/:id/password', { preHandler: [(0, auth_1.requirePermission)('users', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const { password } = request.body;
        if (!password || password.length < 8)
            return reply.code(400).send({ success: false, error: '密碼至少需要 8 個字元' });
        const user = index_1.db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
        if (!user)
            return reply.code(404).send({ success: false, error: '使用者不存在' });
        const hashed = await bcrypt_1.default.hash(password, 12);
        index_1.db.prepare("UPDATE users SET password=?,updated_at=datetime('now','localtime') WHERE id=?").run(hashed, Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '帳號管理', target_id: Number(id), target_name: `重設 ${user.name} 密碼` });
        return reply.send({ success: true, message: '密碼已重設' });
    });
    // ===== 操作紀錄 =====
    fastify.get('/api/admin/audit-logs', { preHandler: [(0, auth_1.requirePermission)('audit_logs', 'view')] }, async (request, reply) => {
        const { page = 1, pageSize = 20, user_id, action, module: mod, start_date, end_date } = request.query;
        const conds = [];
        const params = [];
        if (user_id) {
            conds.push('al.user_id = ?');
            params.push(Number(user_id));
        }
        if (action) {
            conds.push('al.action = ?');
            params.push(action);
        }
        if (mod) {
            conds.push('al.module = ?');
            params.push(mod);
        }
        if (start_date) {
            conds.push('al.created_at >= ?');
            params.push(start_date);
        }
        if (end_date) {
            conds.push('al.created_at <= ?');
            params.push(end_date + ' 23:59:59');
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const total = index_1.db.prepare(`SELECT COUNT(*) as count FROM audit_logs al ${where}`).get(...params).count;
        const logs = index_1.db.prepare(`
      SELECT al.*, u.name as user_name FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id ${where}
      ORDER BY al.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
        return reply.send({ success: true, data: logs, total, page: Number(page), pageSize: Number(pageSize) });
    });
    // ===== 類別管理 =====
    fastify.get('/api/admin/categories', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const { type } = request.query;
        const cats = type
            ? index_1.db.prepare('SELECT * FROM categories WHERE type = ? ORDER BY sort_order').all(type)
            : index_1.db.prepare('SELECT * FROM categories ORDER BY type, sort_order').all();
        return reply.send({ success: true, data: cats });
    });
    fastify.post('/api/admin/categories', { preHandler: [(0, auth_1.requirePermission)('categories', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { type, parent_id, name, sort_order } = request.body;
        if (!type || !name)
            return reply.code(400).send({ success: false, error: '類別類型和名稱為必填' });
        const r = index_1.db.prepare('INSERT INTO categories (type,parent_id,name,sort_order) VALUES (?,?,?,?)').run(type, parent_id ?? null, name, sort_order ?? 0);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '類別管理', target_name: name });
        return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } });
    });
    fastify.put('/api/admin/categories/:id', { preHandler: [(0, auth_1.requirePermission)('categories', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const { name, sort_order, is_active } = request.body;
        index_1.db.prepare('UPDATE categories SET name=?,sort_order=?,is_active=? WHERE id=?').run(name, sort_order ?? 0, is_active ?? 1, Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '類別管理', target_id: Number(id), target_name: name });
        return reply.send({ success: true, message: '類別已更新' });
    });
    fastify.delete('/api/admin/categories/:id', { preHandler: [(0, auth_1.requirePermission)('categories', 'delete')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        index_1.db.prepare('DELETE FROM categories WHERE id = ?').run(Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'delete', module: '類別管理', target_id: Number(id) });
        return reply.send({ success: true, message: '類別已刪除' });
    });
    // ===== 系統設定 =====
    fastify.get('/api/admin/settings', { preHandler: [auth_1.authenticate] }, async (_, reply) => {
        const rows = index_1.db.prepare('SELECT * FROM settings').all();
        const result = {};
        rows.forEach(s => { result[s.key] = s.value; });
        return reply.send({ success: true, data: result });
    });
    fastify.put('/api/admin/settings', { preHandler: [(0, auth_1.requirePermission)('settings', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const updates = request.body;
        const ins = index_1.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at");
        index_1.db.exec('BEGIN');
        try {
            for (const [k, v] of Object.entries(updates))
                ins.run(k, v);
            index_1.db.exec('COMMIT');
        }
        catch (e) {
            index_1.db.exec('ROLLBACK');
            throw e;
        }
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '系統設定' });
        return reply.send({ success: true, message: '設定已儲存' });
    });
}
