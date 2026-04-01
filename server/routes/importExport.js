"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = importExportRoutes;
const index_1 = require("../db/index");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../middleware/audit");
const XLSX = __importStar(require("xlsx"));
// ===== 選民 Excel 範本欄位 =====
const VOTER_TEMPLATE_HEADERS = [
    '姓名*', '性別(男/女/其他)', '出生日期(YYYY-MM-DD)', '身份證號',
    '手機', '市話', 'LINE ID', '電子郵件',
    '戶籍縣市', '戶籍鄉鎮區', '戶籍村里', '戶籍鄰',
    '戶籍地址', '通訊地址', '選區',
    '職業', '服務單位', '職稱',
    '標籤(多個用逗號分隔)', '備註',
];
const VOTER_COL_MAP = {
    '姓名*': 'name', '性別(男/女/其他)': 'gender',
    '出生日期(YYYY-MM-DD)': 'birth_date', '身份證號': 'id_number',
    '手機': 'mobile', '市話': 'phone', 'LINE ID': 'line_id', '電子郵件': 'email',
    '戶籍縣市': 'household_city', '戶籍鄉鎮區': 'household_district',
    '戶籍村里': 'household_village', '戶籍鄰': 'household_neighbor',
    '戶籍地址': 'household_address', '通訊地址': 'mailing_address', '選區': 'election_area',
    '職業': 'occupation', '服務單位': 'company', '職稱': 'job_title',
    '標籤(多個用逗號分隔)': '__tags', '備註': 'note',
};
// ===== 陳情 Excel 範本欄位 =====
const PETITION_EXPORT_HEADERS = [
    '案件編號', '陳情日期', '陳情人', '陳情方式', '陳情類別', '子分類',
    '急迫程度', '狀態', '承辦人', '陳情內容',
    '區域縣市', '區域鄉鎮', '區域村里', '詳細地址', '建立時間',
];
async function importExportRoutes(fastify) {
    // ===== 選民範本下載 =====
    fastify.get('/api/voters/import/template', { preHandler: [auth_1.authenticate] }, async (request, reply) => {
        const wb = XLSX.utils.book_new();
        // 範本工作表
        const ws = XLSX.utils.aoa_to_sheet([
            VOTER_TEMPLATE_HEADERS,
            ['王大明', '男', '1980-05-15', 'A123456789', '0912345678', '02-12345678', '', '',
                '台北市', '信義區', '信義里', '1', '信義路1號', '', '第一選區',
                '自由業', '', '', '樁腳,支持者', '測試資料請刪除'],
        ]);
        // 設定欄寬
        ws['!cols'] = VOTER_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length * 2, 12) }));
        // 說明工作表
        const helpWs = XLSX.utils.aoa_to_sheet([
            ['欄位說明'],
            ['欄位名稱', '說明', '範例'],
            ['姓名*', '必填', '王大明'],
            ['性別(男/女/其他)', '選填', '男'],
            ['出生日期(YYYY-MM-DD)', '選填，格式 YYYY-MM-DD', '1980-05-15'],
            ['身份證號', '選填', 'A123456789'],
            ['手機', '選填', '0912345678'],
            ['市話', '選填', '02-12345678'],
            ['LINE ID', '選填', ''],
            ['電子郵件', '選填', ''],
            ['戶籍縣市', '選填', '台北市'],
            ['戶籍鄉鎮區', '選填', '信義區'],
            ['戶籍村里', '選填', '信義里'],
            ['戶籍鄰', '選填', '1'],
            ['戶籍地址', '選填（不含縣市鄉鎮村里）', '信義路1號'],
            ['通訊地址', '選填', ''],
            ['選區', '選填', '第一選區'],
            ['職業', '選填', '自由業'],
            ['服務單位', '選填', ''],
            ['職稱', '選填', ''],
            ['標籤(多個用逗號分隔)', '選填，多個標籤用逗號分隔', '樁腳,支持者'],
            ['備註', '選填', ''],
        ]);
        helpWs['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, '選民資料');
        XLSX.utils.book_append_sheet(wb, helpWs, '欄位說明');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', 'attachment; filename*=UTF-8\'\'voter_import_template.xlsx');
        return reply.send(buf);
    });
    // ===== 選民匯出 =====
    fastify.get('/api/voters/export', { preHandler: [(0, auth_1.requirePermission)('voters', 'export')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { search, city, district, village, tag } = request.query;
        const conds = ['v.is_active = 1'];
        const params = [];
        if (search) {
            conds.push("(v.name LIKE ? OR v.mobile LIKE ? OR v.household_address LIKE ?)");
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
        const voters = index_1.db.prepare(`SELECT * FROM voters v ${where} ORDER BY v.id`).all(...params);
        const ids = voters.map((v) => v.id);
        let tagMap = {};
        if (ids.length) {
            const tags = index_1.db.prepare(`SELECT * FROM voter_tags WHERE voter_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
            tags.forEach((t) => { if (!tagMap[t.voter_id])
                tagMap[t.voter_id] = []; tagMap[t.voter_id].push(t.tag); });
        }
        const rows = voters.map((v) => [
            v.name, v.gender, v.birth_date, v.id_number,
            v.mobile, v.phone, v.line_id, v.email,
            v.household_city, v.household_district, v.household_village, v.household_neighbor,
            v.household_address, v.mailing_address, v.election_area,
            v.occupation, v.company, v.job_title,
            (tagMap[v.id] || []).join(','), v.note,
        ]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([VOTER_TEMPLATE_HEADERS, ...rows]);
        ws['!cols'] = VOTER_TEMPLATE_HEADERS.map(() => ({ wch: 15 }));
        XLSX.utils.book_append_sheet(wb, ws, '選民資料');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'export', module: '選民管理', target_name: `匯出 ${voters.length} 筆` });
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename*=UTF-8''voters_${new Date().toISOString().slice(0, 10)}.xlsx`);
        return reply.send(buf);
    });
    // ===== 選民批次匯入 =====
    fastify.post('/api/voters/import', { preHandler: [(0, auth_1.requirePermission)('voters', 'create')] }, async (request, reply) => {
        const cu = request.currentUser;
        const data = await request.file();
        if (!data)
            return reply.code(400).send({ success: false, error: '請上傳 Excel 檔案' });
        const buf = await data.toBuffer();
        const wb = XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2)
            return reply.code(400).send({ success: false, error: '檔案無資料（至少需要標題列和一筆資料）' });
        const headers = rows[0].map((h) => String(h || '').trim());
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== undefined && cell !== ''));
        let success = 0, failed = 0;
        const errors = [];
        const insertVoter = index_1.db.prepare(`INSERT INTO voters (
      name,gender,birth_date,id_number,mobile,phone,line_id,email,
      household_city,household_district,household_village,household_neighbor,
      household_address,mailing_address,election_area,
      occupation,company,job_title,note,created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const insertTag = index_1.db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)');
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const obj = {};
            headers.forEach((h, idx) => {
                const colName = VOTER_COL_MAP[h];
                if (colName) {
                    const val = row[idx];
                    if (val === undefined || val === null || val === '') {
                        obj[colName] = null;
                    }
                    else {
                        obj[colName] = String(val).trim();
                    }
                }
            });
            if (!obj.name || !obj.name.trim()) {
                errors.push({ row: i + 2, error: '姓名為必填' });
                failed++;
                continue;
            }
            // Validate birth_date format if provided
            if (obj.birth_date) {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(obj.birth_date)) {
                    // Try to parse Excel serial date number
                    const serial = parseFloat(obj.birth_date);
                    if (!isNaN(serial)) {
                        // Excel date serial: days since 1900-01-01 (with leap year bug)
                        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                        const date = new Date(excelEpoch.getTime() + serial * 86400000);
                        obj.birth_date = date.toISOString().slice(0, 10);
                    }
                    else {
                        obj.birth_date = null; // Invalid date, ignore
                    }
                }
            }
            try {
                index_1.db.exec('BEGIN');
                const r = insertVoter.run(obj.name, obj.gender || null, obj.birth_date || null, obj.id_number || null, obj.mobile || null, obj.phone || null, obj.line_id || null, obj.email || null, obj.household_city || null, obj.household_district || null, obj.household_village || null, obj.household_neighbor || null, obj.household_address || null, obj.mailing_address || null, obj.election_area || null, obj.occupation || null, obj.company || null, obj.job_title || null, obj.note || null, cu.id);
                if (obj.__tags) {
                    const tags = String(obj.__tags).split(',').map((t) => t.trim()).filter(Boolean);
                    tags.forEach((tag) => insertTag.run(r.lastInsertRowid, tag));
                }
                index_1.db.exec('COMMIT');
                success++;
            }
            catch (e) {
                index_1.db.exec('ROLLBACK');
                errors.push({ row: i + 2, error: e.message });
                failed++;
            }
        }
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'create', module: '選民管理', target_name: `批次匯入 ${success} 筆` });
        return reply.send({
            success: true,
            message: `匯入完成：成功 ${success} 筆，失敗 ${failed} 筆`,
            data: { success, failed, errors: errors.slice(0, 20) },
        });
    });
    // ===== 陳情匯出 =====
    fastify.get('/api/petitions/export', { preHandler: [(0, auth_1.requirePermission)('petitions', 'export')] }, async (request, reply) => {
        const cu = request.currentUser;
        const { status, category, urgency, start_date, end_date, search } = request.query;
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
        const URGENCY_LABELS = { normal: '一般', urgent: '急件', critical: '特急' };
        const STATUS_LABELS = {
            pending: '待處理', processing: '處理中', referred: '已轉介',
            replied: '已回覆', closed: '已結案', archived: '已歸檔',
        };
        const petitions = index_1.db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      ${where} ORDER BY p.petition_date DESC
    `).all(...params);
        const rows = petitions.map((p) => [
            p.case_number, p.petition_date, p.voter_name || '',
            p.channel || '', p.category || '', p.subcategory || '',
            URGENCY_LABELS[p.urgency] || p.urgency,
            STATUS_LABELS[p.status] || p.status,
            p.assignee_name || '', p.content,
            p.area_city || '', p.area_district || '', p.area_village || '', p.area_address || '',
            p.created_at,
        ]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([PETITION_EXPORT_HEADERS, ...rows]);
        ws['!cols'] = [
            { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
            { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 40 },
            { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 16 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, '陳情資料');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        (0, audit_1.createAuditLog)(request, cu.id, { action: 'export', module: '陳情管理', target_name: `匯出 ${petitions.length} 筆` });
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename*=UTF-8''petitions_${new Date().toISOString().slice(0, 10)}.xlsx`);
        return reply.send(buf);
    });
}
