"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = backupRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const backupsDir = path_1.default.join(process.cwd(), 'backups');
if (!fs_1.default.existsSync(backupsDir))
    fs_1.default.mkdirSync(backupsDir, { recursive: true });
function getBackupFileName() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `voter-service-${ts}.db`;
}
async function backupRoutes(fastify) {
    // ===== 手動備份 — 下載資料庫檔案 =====
    fastify.get('/api/admin/backup/download', { preHandler: [(0, auth_1.requirePermission)('system', 'view')] }, async (request, reply) => {
        const cu = request.currentUser;
        // 先用 VACUUM INTO 產生乾淨的備份
        const tmpPath = path_1.default.join(backupsDir, getBackupFileName());
        index_1.db.exec(`VACUUM INTO '${tmpPath}'`);
        const buf = fs_1.default.readFileSync(tmpPath);
        const fname = path_1.default.basename(tmpPath);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'export', module: '系統備份', target_name: fname });
        reply.header('Content-Type', 'application/octet-stream');
        reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
        return reply.send(buf);
    });
    // ===== 列出本機備份清單 =====
    fastify.get('/api/admin/backup/list', { preHandler: [(0, auth_1.requirePermission)('system', 'view')] }, async (request, reply) => {
        const files = fs_1.default.readdirSync(backupsDir)
            .filter(f => f.endsWith('.db'))
            .map(f => {
            const stat = fs_1.default.statSync(path_1.default.join(backupsDir, f));
            return { name: f, size: stat.size, created_at: stat.birthtime.toISOString() };
        })
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return reply.send({ success: true, data: files });
    });
    // ===== 備份到本機（不下載，儲存在 backups/ 目錄） =====
    fastify.post('/api/admin/backup', { preHandler: [(0, auth_1.requirePermission)('system', 'view')] }, async (request, reply) => {
        const cu = request.currentUser;
        const fname = getBackupFileName();
        const destPath = path_1.default.join(backupsDir, fname);
        index_1.db.exec(`VACUUM INTO '${destPath}'`);
        const stat = fs_1.default.statSync(destPath);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'export', module: '系統備份', target_name: fname });
        return reply.send({ success: true, message: `備份完成：${fname}`, data: { name: fname, size: stat.size } });
    });
    // ===== 還原備份 — 上傳 .db 檔案 =====
    fastify.post('/api/admin/restore', { preHandler: [(0, auth_1.requirePermission)('system', 'view')] }, async (request, reply) => {
        const cu = request.currentUser;
        const data = await request.file();
        if (!data)
            return reply.code(400).send({ success: false, error: '請選擇備份檔案' });
        if (!data.filename.endsWith('.db'))
            return reply.code(400).send({ success: false, error: '只接受 .db 格式的備份檔案' });
        const buf = await data.toBuffer();
        // 先備份目前資料庫
        const currentBackup = path_1.default.join(backupsDir, `pre-restore-${getBackupFileName()}`);
        index_1.db.exec(`VACUUM INTO '${currentBackup}'`);
        // 關閉目前連接並替換資料庫檔案
        // 由於 DatabaseSync 不支援動態替換，將檔案寫入暫存路徑後通知前端重啟
        const restorePath = index_1.dbPath + '.restore';
        fs_1.default.writeFileSync(restorePath, buf);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'update', module: '系統還原', target_name: data.filename });
        return reply.send({
            success: true,
            message: '還原檔案已上傳，請重新啟動系統以完成還原',
            data: { restorePath, currentBackup: path_1.default.basename(currentBackup) },
        });
    });
    // ===== 刪除本機備份 =====
    fastify.delete('/api/admin/backup/:name', { preHandler: [(0, auth_1.requirePermission)('system', 'view')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { name } = request.params;
        // 防路徑穿越
        const safeName = path_1.default.basename(name);
        if (!safeName.endsWith('.db') || safeName.includes('..')) {
            return reply.code(400).send({ success: false, error: '無效的檔案名稱' });
        }
        const filePath = path_1.default.join(backupsDir, safeName);
        if (!fs_1.default.existsSync(filePath))
            return reply.code(404).send({ success: false, error: '備份不存在' });
        fs_1.default.unlinkSync(filePath);
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'delete', module: '系統備份', target_name: safeName });
        return reply.send({ success: true, message: '備份已刪除' });
    });
}
