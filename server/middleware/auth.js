"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = hasPermission;
exports.authenticate = authenticate;
exports.requirePermission = requirePermission;
const index_1 = require("../db/index");
const rolePermissions = {
    admin: {
        system: ['view', 'create', 'edit', 'delete', 'export'],
        users: ['view', 'create', 'edit', 'delete'],
        audit_logs: ['view', 'export'],
        petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        documents: ['view', 'create', 'edit', 'delete', 'export'],
        schedules: ['view', 'create', 'edit', 'delete', 'export'],
        categories: ['view', 'create', 'edit', 'delete'],
        settings: ['view', 'edit'],
    },
    supervisor: {
        system: ['view'], users: [], audit_logs: ['view'],
        petitions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        groups: ['view', 'create', 'edit', 'delete', 'export', 'print'],
        documents: ['view', 'create', 'edit', 'delete', 'export'],
        schedules: ['view', 'create', 'edit', 'delete', 'export'],
        categories: ['view'], settings: ['view'],
    },
    assistant: {
        system: [], users: [], audit_logs: [],
        petitions: ['view', 'create', 'edit'],
        voters: ['view', 'create', 'edit'],
        groups: ['view', 'create', 'edit'],
        documents: ['view', 'create', 'edit'],
        schedules: ['view', 'create', 'edit'],
        categories: ['view'], settings: ['view'],
    },
    volunteer: {
        system: [], users: [], audit_logs: [],
        petitions: ['view'], voters: ['view'], groups: ['view'],
        documents: ['view'], schedules: ['view'], categories: ['view'], settings: [],
    },
};
function hasPermission(role, module, action) {
    return (rolePermissions[role]?.[module] || []).includes(action);
}
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
        const payload = request.user;
        const user = index_1.db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
        if (!user || !user.is_active) {
            return reply.code(401).send({ success: false, error: '帳號已停用或不存在' });
        }
        ;
        request.currentUser = user;
    }
    catch {
        reply.code(401).send({ success: false, error: '未授權，請重新登入' });
    }
}
function requirePermission(module, action) {
    return async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent)
            return;
        const user = request.currentUser;
        if (!hasPermission(user.role, module, action)) {
            return reply.code(403).send({ success: false, error: '權限不足' });
        }
    };
}
