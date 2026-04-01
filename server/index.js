"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const fastify_1 = __importDefault(require("fastify"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const cors_1 = __importDefault(require("@fastify/cors"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const static_1 = __importDefault(require("@fastify/static"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const migrate_1 = require("./db/migrate");
const index_1 = require("./db/index");
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const voters_1 = __importDefault(require("./routes/voters"));
const petitions_1 = __importDefault(require("./routes/petitions"));
const documents_1 = __importDefault(require("./routes/documents"));
const schedules_1 = __importDefault(require("./routes/schedules"));
const groups_1 = __importDefault(require("./routes/groups"));
const importExport_1 = __importDefault(require("./routes/importExport"));
const backup_1 = __importDefault(require("./routes/backup"));
const PORT = parseInt(process.env.PORT || '8080');
const HOST = process.env.HOST || '0.0.0.0';
async function buildServer() {
    const fastify = (0, fastify_1.default)({
        logger: process.env.NODE_ENV !== 'production',
        trustProxy: true,
    });
    // JWT 設定
    await fastify.register(jwt_1.default, {
        secret: process.env.JWT_SECRET || 'voter-service-system-secret-key-2026',
        cookie: {
            cookieName: 'token',
            signed: false,
        },
    });
    // CORS
    await fastify.register(cors_1.default, {
        origin: process.env.NODE_ENV === 'production' ? false : true,
        credentials: true,
    });
    // Cookie
    await fastify.register(cookie_1.default);
    // 檔案上傳
    await fastify.register(multipart_1.default, {
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    });
    // 上傳目錄
    const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
    if (!fs_1.default.existsSync(uploadsDir)) {
        fs_1.default.mkdirSync(uploadsDir, { recursive: true });
    }
    await fastify.register(static_1.default, {
        root: uploadsDir,
        prefix: '/uploads/',
    });
    // 靜態前端（生產模式）
    if (process.env.NODE_ENV === 'production') {
        const distPath = path_1.default.join(__dirname, '../dist');
        await fastify.register(static_1.default, {
            root: distPath,
            prefix: '/',
            decorateReply: false,
        });
        // SPA fallback
        fastify.setNotFoundHandler((request, reply) => {
            if (!request.url.startsWith('/api/')) {
                reply.sendFile('index.html', distPath);
            }
            else {
                reply.code(404).send({ success: false, error: 'Not Found' });
            }
        });
    }
    // 初始化資料庫
    (0, migrate_1.runMigrations)();
    // 路由
    await fastify.register(auth_1.default);
    await fastify.register(admin_1.default);
    await fastify.register(voters_1.default);
    await fastify.register(petitions_1.default);
    await fastify.register(documents_1.default);
    await fastify.register(schedules_1.default);
    await fastify.register(groups_1.default);
    await fastify.register(importExport_1.default);
    await fastify.register(backup_1.default);
    // 全域錯誤處理
    fastify.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode || 500;
        const code = error.code || '';
        // SQLite constraint errors → 400
        if (code === 'ERR_SQLITE_ERROR') {
            const msg = error.message || '';
            if (msg.includes('NOT NULL constraint failed')) {
                const field = msg.split('.').pop() || '欄位';
                return reply.code(400).send({ success: false, error: `必填欄位「${field}」不可為空` });
            }
            if (msg.includes('UNIQUE constraint failed')) {
                return reply.code(409).send({ success: false, error: '資料重複，請確認是否已存在相同資料' });
            }
            return reply.code(400).send({ success: false, error: '資料庫操作失敗：' + msg });
        }
        if (statusCode === 400) {
            return reply.code(400).send({ success: false, error: error.message || '請求格式錯誤' });
        }
        fastify.log.error(error);
        return reply.code(statusCode).send({ success: false, error: '伺服器內部錯誤，請稍後再試' });
    });
    // 健康檢查
    fastify.get('/api/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    // 取得區網 IP
    fastify.get('/api/network-info', async () => {
        const interfaces = os_1.default.networkInterfaces();
        const ips = [];
        for (const iface of Object.values(interfaces)) {
            if (!iface)
                continue;
            for (const alias of iface) {
                if (alias.family === 'IPv4' && !alias.internal) {
                    ips.push(alias.address);
                }
            }
        }
        return { success: true, data: { ips, port: PORT } };
    });
    return fastify;
}
function getSettingValue(key) {
    try {
        const row = index_1.db.prepare('SELECT value FROM settings WHERE key=?').get(key);
        return row?.value ?? null;
    }
    catch {
        return null;
    }
}
function setSettingValue(key, value) {
    index_1.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now','localtime')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key, value);
}
function scheduleAutoBackup() {
    const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour
    const doCheck = () => {
        try {
            if (getSettingValue('auto_backup_enabled') !== '1')
                return;
            const interval = getSettingValue('auto_backup_interval') || 'daily';
            const intervalMs = interval === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
            const lastStr = getSettingValue('last_auto_backup');
            const lastMs = lastStr ? new Date(lastStr).getTime() : 0;
            if (Date.now() - lastMs < intervalMs)
                return;
            // Perform backup
            const backupDir = path_1.default.join(process.cwd(), 'backups');
            if (!fs_1.default.existsSync(backupDir))
                fs_1.default.mkdirSync(backupDir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupPath = path_1.default.join(backupDir, `auto-${ts}.db`);
            index_1.db.exec(`VACUUM INTO '${backupPath}'`);
            const now = new Date().toISOString();
            setSettingValue('last_auto_backup', now);
            console.log(`✅ 自動備份完成：${backupPath}`);
            // Keep only last 10 auto-backups
            const files = fs_1.default.readdirSync(backupDir)
                .filter(f => f.startsWith('auto-') && f.endsWith('.db'))
                .map(f => ({ name: f, mtime: fs_1.default.statSync(path_1.default.join(backupDir, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime);
            files.slice(10).forEach(f => {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(backupDir, f.name));
                }
                catch { }
            });
        }
        catch (e) {
            console.error('自動備份失敗：', e);
        }
    };
    // Run once after 1 minute, then every hour
    setTimeout(() => { doCheck(); setInterval(doCheck, CHECK_INTERVAL_MS); }, 60 * 1000);
}
async function start() {
    const fastify = await buildServer();
    try {
        await fastify.listen({ port: PORT, host: HOST });
        console.log(`✅ 選民服務系統伺服器啟動於 http://localhost:${PORT}`);
        scheduleAutoBackup();
        // 顯示區網 IP
        const interfaces = os_1.default.networkInterfaces();
        for (const [name, iface] of Object.entries(interfaces)) {
            if (!iface)
                continue;
            for (const alias of iface) {
                if (alias.family === 'IPv4' && !alias.internal) {
                    console.log(`📡 區網連線：http://${alias.address}:${PORT}`);
                }
            }
        }
    }
    catch (err) {
        console.error('伺服器啟動失敗：', err);
        process.exit(1);
    }
}
if (require.main === module) {
    start();
}
