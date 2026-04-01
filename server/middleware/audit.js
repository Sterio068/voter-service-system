"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuditLog = createAuditLog;
const index_1 = require("../db/index");
function createAuditLog(request, userId, params) {
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    index_1.db.prepare(`
    INSERT INTO audit_logs (user_id, action, module, target_type, target_id, target_name, detail, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, params.action, params.module, params.target_type ?? null, params.target_id ?? null, params.target_name ?? null, params.detail ? JSON.stringify(params.detail) : null, ip);
}
