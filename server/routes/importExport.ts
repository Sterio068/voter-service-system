import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import * as XLSX from '@e965/xlsx'
import bcrypt from 'bcrypt'
import { parseAddressFields, looksLikeFullAddress } from '../utils/parseAddress'
import { maskVoterExportRecord } from '../utils/piiMasking'
import { safeRow } from '../utils/excelSafe'

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// M-4 / M-5: Excel 匯入單檔大小上限（範本只有數十 KB，5MB 對使用者足夠寬裕）
const EXCEL_IMPORT_MAX_BYTES = 5 * 1024 * 1024
const EXCEL_IMPORT_TOO_LARGE_MESSAGE = 'Excel 檔案過大（上限 5MB），請拆分後再上傳'

// 共用：Excel 副檔名 / MIME 白名單
const EXCEL_ALLOWED_EXTS = ['.xlsx', '.xls']
const EXCEL_ALLOWED_MIME_KEYWORDS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]

function isAllowedExcelMime(mime: string | undefined): boolean {
  if (!mime) return true // 部分瀏覽器/工具不送 MIME；以副檔名為主
  return EXCEL_ALLOWED_MIME_KEYWORDS.some((m) => mime.includes(m.split('/')[1]))
}

// ===== 選民 Excel 範本欄位 =====
const VOTER_TEMPLATE_HEADERS = [
  '姓名*', '性別(男/女/其他)', '出生日期(YYYY-MM-DD)', '身份證號',
  '手機', '市話', 'LINE ID', '電子郵件',
  '戶籍縣市', '戶籍鄉鎮區', '戶籍村里',
  '戶籍地址', '通訊地址', '選區',
  '職業', '服務單位', '職稱',
  '標籤(多個用逗號分隔)', '備註',
]

const VOTER_COL_MAP: Record<string, string> = {
  '姓名*': 'name', '性別(男/女/其他)': 'gender',
  '出生日期(YYYY-MM-DD)': 'birth_date', '身份證號': 'id_number',
  '手機': 'mobile', '市話': 'phone', 'LINE ID': 'line_id', '電子郵件': 'email',
  '戶籍縣市': 'household_city', '戶籍鄉鎮區': 'household_district',
  '戶籍村里': 'household_village',
  '戶籍地址': 'household_address', '通訊地址': 'mailing_address', '選區': 'election_area',
  '職業': 'occupation', '服務單位': 'company', '職稱': 'job_title',
  '標籤(多個用逗號分隔)': '__tags', '備註': 'note',
  // 別名欄位：填完整地址時系統自動拆解
  '地址': '__full_address',
  '戶籍完整地址': '__full_address',
  '完整地址': '__full_address',
  '通訊完整地址': '__mailing_full',
}

// ===== 陳情 Excel 範本欄位 =====
const PETITION_EXPORT_HEADERS = [
  '案件編號', '陳情日期', '陳情人', '陳情方式', '陳情類別', '子分類',
  '急迫程度', '狀態', '承辦人', '陳情內容',
  '區域縣市', '區域鄉鎮', '區域村里', '詳細地址', '建立時間',
]

export default async function importExportRoutes(fastify: FastifyInstance) {
  // ===== 選民範本下載 =====
  fastify.get('/api/voters/import/template', { preHandler: [requirePermission('voters', 'create')] }, async (request, reply) => {
    const wb = XLSX.utils.book_new()
    // 範本工作表
    const ws = XLSX.utils.aoa_to_sheet([
      VOTER_TEMPLATE_HEADERS,
      ['王大明', '男', '1980-05-15', 'A123456789', '0912345678', '02-12345678', '', '',
       '台北市', '信義區', '信義里', '1', '信義路1號', '', '第一選區',
       '自由業', '', '', '樁腳,支持者', '測試資料請刪除'],
    ])
    // 設定欄寬
    ws['!cols'] = VOTER_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length * 2, 12) }))

    // 說明工作表
    const helpWs = XLSX.utils.aoa_to_sheet([
      ['欄位說明'],
      [''],
      ['【地址填寫方式（二擇一）】'],
      ['方式一：填寫完整地址欄（推薦）', '欄名使用「地址」或「戶籍完整地址」，系統會自動拆解縣市/區/里/鄰/門牌'],
      ['　　　　範例', '台北市信義區信義里1鄰信義路5段1號'],
      ['方式二：分欄填寫', '分別填寫「戶籍縣市」「戶籍鄉鎮區」「戶籍村里」「戶籍地址」'],
      [''],
      ['欄位名稱', '是否必填', '說明', '範例'],
      ['姓名*', '必填', '', '王大明'],
      ['性別(男/女/其他)', '選填', '', '男'],
      ['出生日期(YYYY-MM-DD)', '選填', '格式 YYYY-MM-DD', '1980-05-15'],
      ['身份證號', '選填', '', 'A123456789'],
      ['手機', '選填', '格式：09xxxxxxxx', '0912345678'],
      ['市話', '選填', '', '02-12345678'],
      ['LINE ID', '選填', '', ''],
      ['電子郵件', '選填', '', ''],
      ['地址', '選填', '【自動拆解】填入完整地址，系統自動偵測縣市/區/里/鄰/門牌', '台北市信義區信義里1鄰信義路5段1號'],
      ['戶籍縣市', '選填', '若已填「地址」欄則無需填', '台北市'],
      ['戶籍鄉鎮區', '選填', '若已填「地址」欄則無需填', '信義區'],
      ['戶籍村里', '選填', '若已填「地址」欄則無需填', '信義里'],

      ['戶籍地址', '選填', '不含縣市鄉鎮村里的門牌（或填完整地址亦可自動拆解）', '信義路5段1號'],
      ['通訊地址', '選填', '', ''],
      ['選區', '選填', '', '第一選區'],
      ['職業', '選填', '', '自由業'],
      ['服務單位', '選填', '', ''],
      ['職稱', '選填', '', ''],
      ['標籤(多個用逗號分隔)', '選填', '多個標籤用逗號分隔', '樁腳,支持者'],
      ['備註', '選填', '', ''],
    ])
    helpWs['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 42 }, { wch: 28 }]

    XLSX.utils.book_append_sheet(wb, ws, '選民資料')
    XLSX.utils.book_append_sheet(wb, helpWs, '欄位說明')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', 'attachment; filename*=UTF-8\'\'voter_import_template.xlsx')
    return reply.send(buf)
  })

  // ===== 選民匯出 =====
  fastify.get('/api/voters/export', { preHandler: [requirePermission('voters', 'export')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { search, city, district, village, tag, mask, include_sensitive, reason } = request.query as any
    const fullSensitiveExport = include_sensitive === '1' || include_sensitive === 'true' || mask === '0' || mask === 'false'
    const exportReason = typeof reason === 'string' ? reason.trim() : ''
    if (fullSensitiveExport && cu.role !== 'admin') {
      return reply.code(403).send({ success: false, error: '完整個資匯出僅限管理員使用' })
    }
    if (fullSensitiveExport && exportReason.length < 5) {
      return reply.code(400).send({ success: false, error: '完整個資匯出需填寫至少 5 個字的匯出理由' })
    }
    const conds = ['v.is_active = 1']
    const params: any[] = []
    if (search) { const es = escapeLike(search); conds.push("(v.name LIKE ? ESCAPE '\\' OR v.mobile LIKE ? ESCAPE '\\' OR v.household_address LIKE ? ESCAPE '\\')"); params.push(`%${es}%`, `%${es}%`, `%${es}%`) }
    if (city) { conds.push('v.household_city = ?'); params.push(city) }
    if (district) { conds.push('v.household_district = ?'); params.push(district) }
    if (village) { conds.push('v.household_village = ?'); params.push(village) }
    if (tag) { conds.push('v.id IN (SELECT voter_id FROM voter_tags WHERE tag = ?)'); params.push(tag) }
    const where = `WHERE ${conds.join(' AND ')}`

    // G-2: Readonly role cannot export (允許未來新增 readonly 角色，目前 UserRole 尚未含此值)
    if ((cu.role as string) === 'readonly') {
      return reply.code(403).send({ success: false, error: '唯讀帳號無法匯出資料' })
    }

    // 匯出上限：50k 是設計目標，但單次 Excel 載 5000 筆已可控；超過要拆分
    const VOTER_EXPORT_HARD_LIMIT = Number.parseInt(process.env.VOTER_EXPORT_LIMIT || '5000', 10)
    const totalCount = (db.prepare(`SELECT COUNT(*) AS c FROM voters v ${where}`).get(...params) as any)?.c ?? 0
    if (totalCount > VOTER_EXPORT_HARD_LIMIT) {
      return reply.code(413).send({
        success: false,
        error: `本次匯出條件命中 ${totalCount} 筆選民，超過單次匯出上限 ${VOTER_EXPORT_HARD_LIMIT} 筆。請先用條件（縣市/區/標籤/搜尋）縮小範圍，或調整 VOTER_EXPORT_LIMIT。`,
      })
    }
    const voters = db.prepare(`SELECT * FROM voters v ${where} ORDER BY v.id LIMIT ?`).all(...params, VOTER_EXPORT_HARD_LIMIT) as any[]
    const ids = voters.map((v: any) => v.id)
    let tagMap: Record<number, string[]> = {}
    if (ids.length) {
      const tags = db.prepare(`SELECT * FROM voter_tags WHERE voter_id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[]
      tags.forEach((t: any) => { if (!tagMap[t.voter_id]) tagMap[t.voter_id] = []; tagMap[t.voter_id].push(t.tag) })
    }

    // G-2: Audit log on every export
    const exportedCount = voters.length
    createAuditLog(request, cu.id, {
      action: 'export',
      module: '選民管理',
      target_type: 'voter_export',
      target_id: 0,
      target_name: `${fullSensitiveExport ? '完整' : '遮罩'}匯出 ${exportedCount} 筆選民資料`,
      detail: {
        masked: !fullSensitiveExport,
        reason: fullSensitiveExport ? exportReason : null,
        filters: { search: !!search, city: city || null, district: district || null, village: village || null, tag: tag || null },
      },
    })
    // Large export warning
    if (exportedCount > 500) {
      db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
        .run(cu.id, 'large_export_warning', '選民管理', 'voter_export', JSON.stringify({ count: exportedCount, user: cu.name, time: new Date().toISOString() }))
    }

    // G-2: Add watermark fields
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const markedData = voters.map((v: any) => ({
      ...(fullSensitiveExport ? v : maskVoterExportRecord(v)),
      _exported_by: cu.name,
      _exported_at: timestamp,
    }))

    const rows = markedData.map((v: any) => safeRow([
      v.name, v.gender, v.birth_date, v.id_number,
      v.mobile, v.phone, v.line_id, v.email,
      v.household_city, v.household_district, v.household_village,
      v.household_address, v.mailing_address, v.election_area,
      v.occupation, v.company, v.job_title,
      (tagMap[v.id] || []).join(','), v.note,
      v._exported_by, v._exported_at,
    ]))

    const exportHeaders = [...VOTER_TEMPLATE_HEADERS, '匯出人', '匯出時間']
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([exportHeaders, ...rows])
    ws['!cols'] = exportHeaders.map(() => ({ wch: 15 }))
    XLSX.utils.book_append_sheet(wb, ws, '選民資料')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''voters_${new Date().toISOString().slice(0, 10)}.xlsx`)
    return reply.send(buf)
  })

  // ===== 選民批次匯入 =====
  fastify.post('/api/voters/import', { preHandler: [requirePermission('voters', 'create')] }, async (request, reply) => {
    const cu = request.currentUser!
    // M-4: Excel 匯入單檔上限 5MB（在串流層強制執行）
    let data
    try {
      data = await request.file({ limits: { fileSize: EXCEL_IMPORT_MAX_BYTES } })
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    if (!data) return reply.code(400).send({ success: false, error: '請上傳 Excel 檔案' })

    // 驗證副檔名與 MIME 類型，防止上傳偽裝成 xlsx 的惡意檔案
    const allowedExts = ['.xlsx', '.xls']
    const fileExt = data.filename.toLowerCase().slice(data.filename.lastIndexOf('.'))
    const allowedMimes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'application/octet-stream']
    if (!allowedExts.includes(fileExt)) {
      return reply.code(400).send({ success: false, error: '只接受 .xlsx 或 .xls 格式的檔案' })
    }
    if (data.mimetype && !allowedMimes.some(m => data.mimetype.includes(m.split('/')[1]))) {
      return reply.code(400).send({ success: false, error: '檔案類型不符，請上傳 Excel 格式' })
    }

    // D-N6: support mode from query or multipart fields
    const queryMode = (request.query as any).mode
    const mode: 'insert' | 'upsert' = (queryMode === 'upsert') ? 'upsert' : 'insert'
    const dryRun = (request.query as any).dryRun === 'true'
    const body = request.body as any || {}

    let buf: Buffer
    try {
      buf = await data.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]

    if (rows.length < 2) return reply.code(400).send({ success: false, error: '檔案無資料（至少需要標題列和一筆資料）' })

    const headers = rows[0].map((h: any) => String(h || '').trim())
    const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell !== undefined && cell !== ''))

    let imported = 0, updated = 0, failed = 0
    const errors: { row: number; error: string }[] = []

    const insertVoter = db.prepare(`INSERT INTO voters (
      name,gender,birth_date,id_number,mobile,phone,line_id,email,
      household_city,household_district,household_village,
      household_address,mailing_address,election_area,
      occupation,company,job_title,note,created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const updateVoter = db.prepare(`UPDATE voters SET
      name=?,gender=?,birth_date=?,mobile=?,phone=?,line_id=?,email=?,
      household_city=?,household_district=?,household_village=?,
      household_address=?,mailing_address=?,election_area=?,
      occupation=?,company=?,job_title=?,note=?,updated_at=datetime('now','localtime')
      WHERE id=?`)
    const insertTag = db.prepare('INSERT INTO voter_tags (voter_id,tag) VALUES (?,?)')

    // Validation pass: collect valid rows
    type ValidRow = { obj: Record<string, any>; rowNum: number }
    const validRows: ValidRow[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const obj: Record<string, any> = {}
      headers.forEach((h, idx) => {
        const colName = VOTER_COL_MAP[h]
        if (colName) {
          const val = row[idx]
          if (val === undefined || val === null || val === '') {
            obj[colName] = null
          } else {
            obj[colName] = String(val).trim()
          }
        }
      })

      // ── 地址自動解析 ──────────────────────────────────────
      // 情況 A：有 __full_address 欄（地址/戶籍完整地址），直接拆解
      if (obj.__full_address) {
        const parsed = parseAddressFields(obj.__full_address)
        if (!obj.household_city    && parsed.city)     obj.household_city     = parsed.city
        if (!obj.household_district && parsed.district) obj.household_district = parsed.district
        if (!obj.household_village  && parsed.village)  obj.household_village  = parsed.village
        if (!obj.household_address  && parsed.address)  obj.household_address  = parsed.address
        delete obj.__full_address
      }

      // 情況 B：__mailing_full → 通訊地址（只填通訊地址，不拆行政欄）
      if (obj.__mailing_full) {
        if (!obj.mailing_address) obj.mailing_address = obj.__mailing_full
        delete obj.__mailing_full
      }

      // 情況 C：household_address 欄本身就填了完整地址（包含縣市區里）
      //         且 household_city 為空時，自動拆解並回填
      if (!obj.household_city && obj.household_address && looksLikeFullAddress(obj.household_address)) {
        const parsed = parseAddressFields(obj.household_address)
        if (parsed.city)     obj.household_city     = parsed.city
        if (parsed.district) obj.household_district = obj.household_district || parsed.district
        if (parsed.village)  obj.household_village  = obj.household_village  || parsed.village
        // 只保留門牌部分（去掉已拆解的行政單位前綴）
        if (parsed.address)  obj.household_address  = parsed.address
      }
      // ─────────────────────────────────────────────────────

      const rowNum = i + 2
      if (!obj.name || !String(obj.name).trim()) {
        errors.push({ row: rowNum, error: `第${rowNum}列：姓名為必填欄位` })
        failed++
        continue
      }

      // Validate mobile format if provided
      if (obj.mobile) {
        const mobileRegex = /^09\d{8}$|^\+?886\d{9}$/
        if (!mobileRegex.test(String(obj.mobile))) {
          errors.push({ row: rowNum, error: `第${rowNum}列：手機號碼格式不正確` })
          failed++
          continue
        }
      }

      // Validate email format if provided
      if (obj.email && !String(obj.email).includes('@')) {
        errors.push({ row: rowNum, error: `第${rowNum}列：電子郵件格式不正確` })
        failed++
        continue
      }

      // Validate birth_date format if provided
      if (obj.birth_date) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(obj.birth_date)) {
          // 只有純數字（含小數點）才視為 Excel serial；parseFloat("123abc")=123 是假陽性
          // Math.round 修正浮點精度誤差（如 44644.0 → 44643.999...）
          const serial = /^\d+(\.\d+)?$/.test(String(obj.birth_date)) ? Math.round(parseFloat(obj.birth_date)) : NaN
          if (!isNaN(serial)) {
            // Excel date serial: days since 1900-01-01 (with leap year bug)
            const excelEpoch = new Date(Date.UTC(1899, 11, 30))
            const date = new Date(excelEpoch.getTime() + serial * 86400000)
            obj.birth_date = date.toISOString().slice(0, 10)
          } else {
            // Try parsing as a date string
            const parsed = new Date(obj.birth_date)
            if (isNaN(parsed.getTime())) {
              errors.push({ row: rowNum, error: `第${rowNum}列：出生日期格式不正確` })
              failed++
              continue
            }
            obj.birth_date = null // Unknown format, clear it
          }
        }
      }

      validRows.push({ obj, rowNum })
    }

    // U-N14: dry run — return preview without inserting
    if (dryRun) {
      // 預覽前三筆的地址解析結果
      const addressPreview = validRows.slice(0, 3).map(({ obj, rowNum }) => ({
        row: rowNum,
        name: obj.name,
        household_city: obj.household_city,
        household_district: obj.household_district,
        household_village: obj.household_village,
        household_address: obj.household_address,
      }))

      if (mode === 'upsert') {
        const matchField = body.match_field || 'mobile'
        const updateCount = validRows.filter((r: ValidRow) => {
          if (matchField === 'mobile' && r.obj.mobile) {
            return !!db.prepare('SELECT id FROM voters WHERE mobile=? AND is_active=1').get(r.obj.mobile)
          }
          if (matchField === 'id_number' && r.obj.id_number) {
            return !!db.prepare('SELECT id FROM voters WHERE id_number=? AND is_active=1').get(r.obj.id_number)
          }
          return false
        }).length
        return reply.send({ success: true, preview: { valid_count: validRows.length, error_count: errors.length, update_count: updateCount, insert_count: validRows.length - updateCount, errors: errors.slice(0, 20).map(e => e.error), match_field: matchField, address_preview: addressPreview } })
      }
      return reply.send({
        success: true,
        preview: {
          valid_count: validRows.length,
          error_count: failed,
          errors: errors.slice(0, 20).map(e => e.error),
          address_preview: addressPreview,
        },
      })
    }

    // 每一列獨立的 savepoint（使用 db.transaction 巢狀會自動生成 savepoint）
    // 單列失敗只會 rollback 該列的變更（含 voter_tags 刪除），不影響其他列
    const upsertOneRow = db.transaction((obj: any) => {
      let existingId: number | null = null
      if (mode === 'upsert') {
        const matchField = body.match_field || 'mobile'
        let existing: any = null
        if (matchField === 'id_number' && obj.id_number) {
          existing = db.prepare('SELECT id FROM voters WHERE id_number=? AND is_active=1 LIMIT 1').get(obj.id_number)
        } else {
          if (obj.mobile) {
            existing = db.prepare('SELECT id FROM voters WHERE mobile=? AND is_active=1 LIMIT 1').get(obj.mobile)
          }
          if (!existing && obj.id_number) {
            existing = db.prepare('SELECT id FROM voters WHERE id_number=? AND is_active=1 LIMIT 1').get(obj.id_number)
          }
        }
        if (existing) existingId = (existing as any).id
      }

      if (existingId !== null) {
        updateVoter.run(
          obj.name, obj.gender || null, obj.birth_date || null,
          obj.mobile || null, obj.phone || null, obj.line_id || null, obj.email || null,
          obj.household_city || null, obj.household_district || null, obj.household_village || null,
          obj.household_address || null, obj.mailing_address || null, obj.election_area || null,
          obj.occupation || null, obj.company || null, obj.job_title || null,
          obj.note || null, existingId
        )
        if (obj.__tags) {
          db.prepare('DELETE FROM voter_tags WHERE voter_id=?').run(existingId)
          const tags = String(obj.__tags).split(',').map((t: string) => t.trim()).filter(Boolean)
          tags.forEach((tag: string) => insertTag.run(existingId, tag))
        }
        return 'updated'
      } else {
        const r = insertVoter.run(
          obj.name, obj.gender || null, obj.birth_date || null, obj.id_number || null,
          obj.mobile || null, obj.phone || null, obj.line_id || null, obj.email || null,
          obj.household_city || null, obj.household_district || null, obj.household_village || null,
          obj.household_address || null, obj.mailing_address || null, obj.election_area || null,
          obj.occupation || null, obj.company || null, obj.job_title || null,
          obj.note || null, cu.id
        )
        if (obj.__tags) {
          const tags = String(obj.__tags).split(',').map((t: string) => t.trim()).filter(Boolean)
          tags.forEach((tag: string) => insertTag.run(r.lastInsertRowid, tag))
        }
        return 'inserted'
      }
    })

    // 外層 transaction 批次提交（合併成一筆寫入硬碟，大幅提速）
    const importAll = db.transaction(() => {
      for (const { obj, rowNum } of validRows) {
        try {
          const result = upsertOneRow(obj)
          if (result === 'updated') updated++
          else imported++
        } catch (e: any) {
          errors.push({ row: rowNum, error: `第${rowNum}列：${e.message}` })
          failed++
        }
      }
    })
    importAll()

    createAuditLog(request, cu.id, { action: 'create', module: '選民管理', target_name: `批次匯入 ${imported} 筆，更新 ${updated} 筆` })
    return reply.send({
      success: true,
      message: `匯入完成：新增 ${imported} 筆，更新 ${updated} 筆，失敗 ${failed} 筆`,
      imported,
      updated,
      errors: errors.slice(0, 20).map(e => e.error),
    })
  })

  // ===== 陳情匯出 =====
  fastify.get('/api/petitions/export', { preHandler: [requirePermission('petitions', 'export')] }, async (request, reply) => {
    const cu = request.currentUser!
    const { status, category, urgency, start_date, end_date, search } = request.query as any
    const conds: string[] = []
    const params: any[] = []
    if (status) { conds.push('p.status = ?'); params.push(status) }
    if (category) { conds.push('p.category = ?'); params.push(category) }
    if (urgency) { conds.push('p.urgency = ?'); params.push(urgency) }
    if (start_date) { conds.push('p.petition_date >= ?'); params.push(start_date) }
    if (end_date) { conds.push('p.petition_date <= ?'); params.push(end_date) }
    if (search) { conds.push("p.content LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(search)}%`) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }
    const STATUS_LABELS: Record<string, string> = {
      pending: '待處理', processing: '處理中', referred: '已轉介',
      replied: '已回覆', closed: '已結案', archived: '已歸檔',
    }

    const PETITION_EXPORT_HARD_LIMIT = Number.parseInt(process.env.PETITION_EXPORT_LIMIT || '5000', 10)
    const petitionTotal = (db.prepare(
      `SELECT COUNT(*) AS c FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id ${where}`
    ).get(...params) as any)?.c ?? 0
    if (petitionTotal > PETITION_EXPORT_HARD_LIMIT) {
      return reply.code(413).send({
        success: false,
        error: `本次匯出條件命中 ${petitionTotal} 筆陳情，超過單次匯出上限 ${PETITION_EXPORT_HARD_LIMIT} 筆。請改加日期或狀態篩選。`,
      })
    }
    const petitions = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      ${where} ORDER BY p.petition_date DESC LIMIT ?
    `).all(...params, PETITION_EXPORT_HARD_LIMIT) as any[]

    const rows = petitions.map((p: any) => safeRow([
      p.case_number, p.petition_date, p.voter_name || '',
      p.channel || '', p.category || '', p.subcategory || '',
      URGENCY_LABELS[p.urgency] || p.urgency,
      STATUS_LABELS[p.status] || p.status,
      p.assignee_name || '', p.content,
      p.area_city || '', p.area_district || '', p.area_village || '', p.area_address || '',
      p.created_at,
    ]))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([PETITION_EXPORT_HEADERS, ...rows])
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 40 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 16 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, '陳情資料')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    createAuditLog(request, cu.id, { action: 'export', module: '陳情管理', target_name: `匯出 ${petitions.length} 筆` })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''petitions_${new Date().toISOString().slice(0, 10)}.xlsx`)
    return reply.send(buf)
  })

  // ===== 陳情範本下載 =====
  fastify.get('/api/petitions/import/template', { preHandler: [requirePermission('petitions', 'create')] }, async (_req, reply) => {
    const headers = ['陳情日期', '陳情人姓名', '聯絡電話', '陳情方式', '陳情類別', '急迫程度', '陳情內容', '區域縣市', '區域鄉鎮市區', '區域村里', '詳細地址']
    const example = ['2026-04-01', '王小明', '0912345678', '電話', '道路交通', '一般', '住家前方路燈故障，已黑暗多日，請協助修繕。', '臺北市', '大安區', '某里', '某路某段某號']
    const helpRows = [
      ['欄位', '說明', '必填'],
      ['陳情日期', 'YYYY-MM-DD 格式，例如 2026-04-01', '必填'],
      ['陳情人姓名', '留空則建立匿名案件', '選填'],
      ['聯絡電話', '用於比對現有選民', '選填'],
      ['陳情方式', '電話 / 面訪 / 書信 / 網路 / 現場', '選填'],
      ['陳情類別', '需與系統類別管理中的名稱一致', '選填'],
      ['急迫程度', '一般 / 急件 / 特急', '選填，預設一般'],
      ['陳情內容', '案件說明，不可空白', '必填'],
      ['區域縣市', '例如：臺北市', '選填'],
      ['區域鄉鎮市區', '例如：大安區', '選填'],
      ['區域村里', '例如：某里', '選填'],
      ['詳細地址', '例如：某路某段某號', '選填'],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    ws['!cols'] = headers.map((_, i) => ({ wch: [12, 12, 12, 10, 12, 10, 40, 8, 10, 8, 20][i] || 15 }))
    XLSX.utils.book_append_sheet(wb, ws, '陳情資料')
    const helpWs = XLSX.utils.aoa_to_sheet(helpRows)
    helpWs['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, helpWs, '欄位說明')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', "attachment; filename*=UTF-8''petition_import_template.xlsx")
    return reply.send(buf)
  })

  // ===== 陳情批量匯入 =====
  fastify.post('/api/petitions/import', { preHandler: [requirePermission('petitions', 'create')] }, async (request, reply) => {
    const cu = request.currentUser!
    // M-4: 串流層強制 5MB 上限
    let data
    try {
      data = await request.file({ limits: { fileSize: EXCEL_IMPORT_MAX_BYTES } })
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    if (!data) return reply.code(400).send({ success: false, error: '請上傳 Excel 檔案' })

    // M-5: 對齊選民匯入的副檔名與 MIME 白名單，防止偽裝檔案
    const fileExt = data.filename.toLowerCase().slice(data.filename.lastIndexOf('.'))
    if (!EXCEL_ALLOWED_EXTS.includes(fileExt)) {
      return reply.code(400).send({ success: false, error: '只接受 .xlsx 或 .xls 格式的檔案' })
    }
    if (!isAllowedExcelMime(data.mimetype)) {
      return reply.code(400).send({ success: false, error: '檔案類型不符，請上傳 Excel 格式' })
    }

    let buf: Buffer
    try {
      buf = await data.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) return reply.code(400).send({ success: false, error: '檔案無資料列' })

    const COL = { date: 0, name: 1, phone: 2, channel: 3, category: 4, urgency: 5, content: 6, city: 7, district: 8, village: 9, address: 10 }
    const URGENCY_MAP: Record<string, string> = { '一般': 'normal', '急件': 'urgent', '特急': 'critical' }
    const CHANNEL_MAP: Record<string, string> = { '電話': 'phone', '面訪': 'visit', '書信': 'letter', '網路': 'online', '現場': 'walkin' }

    let imported = 0, failed = 0
    const errors: { row: number; error: string }[] = []

    const importStmt = db.prepare(`
      INSERT INTO petitions (case_number,petition_date,voter_id,contact_phone,channel,category,content,area_city,area_district,area_village,area_address,urgency,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,datetime('now','localtime'),datetime('now','localtime'))
    `)

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r.every((c: any) => !c)) continue
      try {
        const dateStr = String(r[COL.date] || '').trim()
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('陳情日期格式錯誤（需 YYYY-MM-DD）')
        const content = String(r[COL.content] || '').trim()
        if (!content) throw new Error('陳情內容不可空白')

        const nameRaw = String(r[COL.name] || '').trim()
        const phoneRaw = String(r[COL.phone] || '').trim()
        let voterId: number | null = null
        if (phoneRaw) {
          const v = db.prepare("SELECT id FROM voters WHERE (mobile=? OR phone=?) AND is_active=1 LIMIT 1").get(phoneRaw, phoneRaw) as any
          if (v) voterId = v.id
        }
        const urgencyRaw = String(r[COL.urgency] || '').trim()
        const urgency = URGENCY_MAP[urgencyRaw] || 'normal'
        const channelRaw = String(r[COL.channel] || '').trim()
        const channel = CHANNEL_MAP[channelRaw] || channelRaw || null

        // 產生案件編號
        const year = dateStr.slice(0, 4)
        const maxRow = db.prepare(`SELECT COALESCE(MAX(CAST(SUBSTR(case_number,6) AS INTEGER)),0) AS m FROM petitions WHERE case_number LIKE ?`).get(`${year}-%`) as any
        const seq = String((maxRow?.m ?? 0) + 1).padStart(5, '0')
        const caseNum = `${year}-${seq}`

        importStmt.run(
          caseNum, dateStr, voterId, phoneRaw || null, channel,
          String(r[COL.category] || '').trim() || null,
          content,
          String(r[COL.city] || '').trim() || null,
          String(r[COL.district] || '').trim() || null,
          String(r[COL.village] || '').trim() || null,
          String(r[COL.address] || '').trim() || null,
          urgency,
          cu.id
        )
        imported++
      } catch (e: any) {
        failed++
        errors.push({ row: i + 1, error: e.message })
      }
    }

    createAuditLog(request, cu.id, { action: 'import', module: '陳情管理', target_type: 'petition_import', target_id: 0, target_name: `匯入 ${imported} 筆陳情` })
    return reply.send({ success: true, message: `匯入完成：新增 ${imported} 筆，失敗 ${failed} 筆`, imported, errors: errors.slice(0, 20).map(e => e.error) })
  })

  // ===== 團體範本下載 =====
  fastify.get('/api/groups/import/template', { preHandler: [requirePermission('groups', 'create')] }, async (_req, reply) => {
    const headers = ['團體名稱', '類別', '聯絡電話', '地址', '預估成員數', '備註']
    const example = ['大安社區發展協會', '社區', '02-12345678', '臺北市大安區某路某段', '50', '每月第一週六聚會']
    const helpRows = [
      ['欄位', '說明', '必填'],
      ['團體名稱', '不可重複，不可空白', '必填'],
      ['類別', '需與系統類別管理中的名稱一致，例如：社區、工商、宗教', '選填'],
      ['聯絡電話', '市話或手機均可', '選填'],
      ['地址', '團體所在地址', '選填'],
      ['預估成員數', '數字，例如：50', '選填'],
      ['備註', '其他說明', '選填'],
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 20 }]
    XLSX.utils.book_append_sheet(wb, ws, '團體資料')
    const helpWs = XLSX.utils.aoa_to_sheet(helpRows)
    helpWs['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, helpWs, '欄位說明')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', "attachment; filename*=UTF-8''group_import_template.xlsx")
    return reply.send(buf)
  })

  // ===== 團體批量匯入 =====
  fastify.post('/api/groups/import', { preHandler: [requirePermission('groups', 'create')] }, async (request, reply) => {
    const cu = request.currentUser!
    // M-4: 串流層強制 5MB 上限
    let data
    try {
      data = await request.file({ limits: { fileSize: EXCEL_IMPORT_MAX_BYTES } })
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    if (!data) return reply.code(400).send({ success: false, error: '請上傳 Excel 檔案' })

    // M-5: 對齊選民匯入的副檔名與 MIME 白名單
    const fileExt = data.filename.toLowerCase().slice(data.filename.lastIndexOf('.'))
    if (!EXCEL_ALLOWED_EXTS.includes(fileExt)) {
      return reply.code(400).send({ success: false, error: '只接受 .xlsx 或 .xls 格式的檔案' })
    }
    if (!isAllowedExcelMime(data.mimetype)) {
      return reply.code(400).send({ success: false, error: '檔案類型不符，請上傳 Excel 格式' })
    }

    let buf: Buffer
    try {
      buf = await data.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({ success: false, error: EXCEL_IMPORT_TOO_LARGE_MESSAGE })
      }
      throw err
    }
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (rows.length < 2) return reply.code(400).send({ success: false, error: '檔案無資料列' })

    const COL = { name: 0, category: 1, phone: 2, address: 3, member_count: 4, note: 5 }

    let imported = 0, failed = 0
    const errors: { row: number; error: string }[] = []

    const insertStmt = db.prepare(`
      INSERT INTO groups (name, category, phone, address, member_count, note, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now','localtime'), datetime('now','localtime'))
    `)

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r.every((c: any) => !c)) continue
      try {
        const name = String(r[COL.name] || '').trim()
        if (!name) throw new Error('團體名稱不可空白')
        const existing = db.prepare("SELECT id FROM groups WHERE name=? AND is_active=1 LIMIT 1").get(name)
        if (existing) throw new Error(`「${name}」已存在`)
        const memberCountRaw = String(r[COL.member_count] || '').trim()
        const memberCount = memberCountRaw && !isNaN(Number(memberCountRaw)) ? Number(memberCountRaw) : null
        insertStmt.run(
          name,
          String(r[COL.category] || '').trim() || null,
          String(r[COL.phone] || '').trim() || null,
          String(r[COL.address] || '').trim() || null,
          memberCount,
          String(r[COL.note] || '').trim() || null,
          cu.id
        )
        imported++
      } catch (e: any) {
        failed++
        errors.push({ row: i + 1, error: e.message })
      }
    }

    createAuditLog(request, cu.id, { action: 'import', module: '團體管理', target_type: 'group_import', target_id: 0, target_name: `匯入 ${imported} 筆團體` })
    return reply.send({ success: true, message: `匯入完成：新增 ${imported} 筆，失敗 ${failed} 筆`, imported, failed, errors: errors.slice(0, 20).map(e => `第 ${e.row} 列：${e.error}`) })
  })
}
