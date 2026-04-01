"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = voterRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
async function voterRoutes(fastify) {
    fastify.get('/api/voters', { preHandler: [(0, auth_1.requirePermission)('voters', 'view')] }, async (request, reply) => {
        const { page = 1, pageSize = 20, search, city, district, village, tag, is_active = 1 } = request.query;
        const conds = ['v.is_active = ?'];
        const params = [Number(is_active) === 0 ? 0 : 1];
        if (search) {
            conds.push("(v.name LIKE ? OR v.mobile LIKE ? OR v.phone LIKE ? OR v.household_address LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (city) {
            conds.push('v.household_city = ?');
            params.push(city);
        }
        if (district) {
            conds.push('v.household_district = ?');
            params.push(district);
        }
        if (village) {
            conds.push('v.household_village = ?');
            params.push(village);
        }
        if (tag) {
            conds.push('v.id IN (SELECT voter_id FROM voter_tags WHERE tag = ?)');
            params.push(tag);
        }
        const where = `WHERE ${conds.join(' AND ')}`;
        const total = index_1.db.prepare(`SELECT COUNT(*) as count FROM voters v ${where}`).get(...params).count;
        const voters = index_1.db.prepare(`SELECT * FROM voters v ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`)
            .all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize));
        const ids = voters.map(v => v.id);
        let tagMap = {};
        if (ids.length) {
            const tags = index_1.db.prepare(`SELECT * FROM voter_tags WHERE voter_id IN (${ids.map(() => '?').join(',')})`)
                .all(...ids);
            tags.forEach(t => { if (!tagMap[t.voter_id])
                tagMap[t.voter_id] = []; tagMap[t.voter_id].push(t.tag); });
        }
        return reply.send({ success: true, data: voters.map(v => ({ ...v, tags: tagMap[v.id] || [] })), total, page: Number(page), pageSize: Number(pageSize) });
    });
    fastify.get('/api/voters/search', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const { q } = request.query;
        if (!q)
            return reply.send({ success: true, data: [] });
        const results = index_1.db.prepare("SELECT id,name,mobile,household_address FROM voters WHERE is_active=1 AND (name LIKE ? OR mobile LIKE ?) LIMIT 10")
            .all(`%${q}%`, `%${q}%`);
        return reply.send({ success: true, data: results });
    });
    fastify.get('/api/voters/:id', { preHandler: [(0, auth_1.requirePermission)('voters', 'view')] }, async (request, reply) => {
        const { id } = request.params;
        const voter = index_1.db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id));
        if (!voter)
            return reply.code(404).send({ success: false, error: '選民不存在' });
        const tags = index_1.db.prepare('SELECT tag FROM voter_tags WHERE voter_id = ?').all(Number(id)).map(t => t.tag);
        const relations = index_1.db.prepare('SELECT * FROM voter_relations WHERE voter_id = ?').all(Number(id));
        return reply.send({ success: true, data: { ...voter, tags, relations } });
    });
    fastify.post('/api/voters', { preHandler: [(0, auth_1.requirePermission)('voters', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { tags, ...data } = request.body;
        if (!data.name || !String(data.name).trim()) {
            return reply.code(400).send({ success: false, error: '姓名為必填欄位' });
        }
        // Sanitize: only allow known fields
        const allowedFields = ['name', 'gender', 'birth_date', 'id_number', 'mobile', 'phone', 'line_id', 'email',
            'household_city', 'household_district', 'household_village', 'household_neighbor', 'household_address',
            'mailing_address', 'occupation', 'company', 'job_title', 'election_area', 'note'];
        const safeData = {};
        for (const k of allowedFields) {
            if (data[k] !== undefined)
                safeData[k] = data[k];
        }
        const cols = Object.keys(safeData).join(',');
        const vals = Object.values(safeData);
        const r = index_1.db.prepare(`INSERT INTO voters (${cols},created_by) VALUES (${vals.map(() => '?').join(',')},?)`).run(...vals, cu.id);
        const newId = r.lastInsertRowid;
        if (tags?.length) {
            const ins = index_1.db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)');
            index_1.db.exec('BEGIN');
            try {
                tags.forEach((t) => ins.run(newId, t));
                index_1.db.exec('COMMIT');
            }
            catch (e) {
                index_1.db.exec('ROLLBACK');
                throw e;
            }
        }
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '選民管理', target_type: 'voter', target_id: newId, target_name: data.name });
        return reply.code(201).send({ success: true, data: { id: newId }, message: '選民資料已建立' });
    });
    fastify.put('/api/voters/:id', { preHandler: [(0, auth_1.requirePermission)('voters', 'edit')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const { tags, ...data } = request.body;
        const voter = index_1.db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id));
        if (!voter)
            return reply.code(404).send({ success: false, error: '選民不存在' });
        if (data.name !== undefined && !String(data.name).trim()) {
            return reply.code(400).send({ success: false, error: '姓名不可為空' });
        }
        // Sanitize: only allow known fields
        const allowedFields = ['name', 'gender', 'birth_date', 'id_number', 'mobile', 'phone', 'line_id', 'email',
            'household_city', 'household_district', 'household_village', 'household_neighbor', 'household_address',
            'mailing_address', 'occupation', 'company', 'job_title', 'election_area', 'note'];
        const safeData = {};
        for (const k of allowedFields) {
            if (data[k] !== undefined)
                safeData[k] = data[k];
        }
        if (Object.keys(safeData).length === 0 && tags === undefined) {
            return reply.code(400).send({ success: false, error: '沒有可更新的欄位' });
        }
        const sets = Object.keys(safeData).map(k => `${k}=?`).join(',');
        if (sets) {
            index_1.db.prepare(`UPDATE voters SET ${sets},updated_at=datetime('now','localtime') WHERE id=?`).run(...Object.values(safeData), Number(id));
        }
        else if (tags !== undefined) {
            // Only tags changed; still update updated_at
            index_1.db.prepare("UPDATE voters SET updated_at=datetime('now','localtime') WHERE id=?").run(Number(id));
        }
        if (tags !== undefined) {
            index_1.db.prepare('DELETE FROM voter_tags WHERE voter_id = ?').run(Number(id));
            if (tags.length) {
                const ins = index_1.db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)');
                index_1.db.exec('BEGIN');
                try {
                    tags.forEach((t) => ins.run(Number(id), t));
                    index_1.db.exec('COMMIT');
                }
                catch (e) {
                    index_1.db.exec('ROLLBACK');
                    throw e;
                }
            }
        }
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: voter.name });
        return reply.send({ success: true, message: '選民資料已更新' });
    });
    fastify.delete('/api/voters/:id', { preHandler: [(0, auth_1.requirePermission)('voters', 'delete')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { id } = request.params;
        const voter = index_1.db.prepare('SELECT * FROM voters WHERE id = ?').get(Number(id));
        if (!voter)
            return reply.code(404).send({ success: false, error: '選民不存在' });
        index_1.db.prepare('UPDATE voters SET is_active=0 WHERE id=?').run(Number(id));
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'delete', module: '選民管理', target_type: 'voter', target_id: Number(id), target_name: voter.name });
        return reply.send({ success: true, message: '選民資料已停用' });
    });
}
