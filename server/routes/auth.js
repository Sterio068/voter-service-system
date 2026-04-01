"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = authRoutes;
const bcrypt_1 = __importDefault(require("bcrypt"));
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const loginAttempts = new Map();
async function authRoutes(fastify) {
    fastify.post('/api/auth/login', async (request, reply) => {
        const { username, password } = request.body;
        if (!username || !password)
            return reply.code(400).send({ success: false, error: '請輸入帳號與密碼' });
        const lockAttemptsSetting = index_1.db.prepare("SELECT value FROM settings WHERE key = 'login_lock_attempts'").get();
        const lockMinutesSetting = index_1.db.prepare("SELECT value FROM settings WHERE key = 'login_lock_minutes'").get();
        const maxAttempts = parseInt(lockAttemptsSetting?.value || '5');
        const lockMinutes = parseInt(lockMinutesSetting?.value || '15');
        const attempts = loginAttempts.get(username);
        if (attempts?.lockUntil && Date.now() < attempts.lockUntil) {
            const remaining = Math.ceil((attempts.lockUntil - Date.now()) / 60000);
            return reply.code(429).send({ success: false, error: `帳號已鎖定，請於 ${remaining} 分鐘後再試` });
        }
        const user = index_1.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user || !user.is_active)
            return reply.code(401).send({ success: false, error: '帳號或密碼錯誤' });
        const match = await bcrypt_1.default.compare(password, user.password);
        if (!match) {
            const cur = loginAttempts.get(username) || { count: 0 };
            cur.count += 1;
            if (cur.count >= maxAttempts) {
                cur.lockUntil = Date.now() + lockMinutes * 60000;
                loginAttempts.set(username, cur);
                return reply.code(429).send({ success: false, error: `登入失敗次數過多，已鎖定 ${lockMinutes} 分鐘` });
            }
            loginAttempts.set(username, cur);
            return reply.code(401).send({ success: false, error: `帳號或密碼錯誤（剩餘嘗試：${maxAttempts - cur.count}）` });
        }
        loginAttempts.delete(username);
        const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role }, { expiresIn: '8h' });
        (0, audit_1.createAuditLog)(request, user.id, { action: 'login', module: '認證', target_name: user.username });
        const { password: _, ...userOut } = user;
        return reply.send({ success: true, data: { token, user: userOut } });
    });
    fastify.post('/api/auth/logout', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const user = request.currentUser;
        (0, audit_1.createAuditLog)(request, user.id, { action: 'logout', module: '認證', target_name: user.username });
        return reply.send({ success: true, message: '已成功登出' });
    });
    fastify.get('/api/auth/me', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const user = request.currentUser;
        const { password: _, ...out } = user;
        return reply.send({ success: true, data: out });
    });
    fastify.put('/api/auth/password', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const user = request.currentUser;
        const { old_password, new_password } = request.body;
        if (!old_password || !new_password)
            return reply.code(400).send({ success: false, error: '請填寫完整資料' });
        if (new_password.length < 8)
            return reply.code(400).send({ success: false, error: '新密碼至少需要 8 個字元' });
        const dbUser = index_1.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        if (!await bcrypt_1.default.compare(old_password, dbUser.password))
            return reply.code(400).send({ success: false, error: '原密碼錯誤' });
        const hashed = await bcrypt_1.default.hash(new_password, 12);
        index_1.db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hashed, user.id);
        (0, audit_1.createAuditLog)(request, user.id, { action: 'update', module: '認證', target_name: '密碼修改' });
        return reply.send({ success: true, message: '密碼已更新' });
    });
}
