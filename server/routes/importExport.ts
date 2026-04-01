import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission, authenticate } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import * as XLSX from 'xlsx'
import bcrypt from 'bcrypt'

// ===== 選民 Excel 範本欄位 =====
const VOTER_TEMPLATE_HEADERS = [
  '姓名*', '性別(男/女/其他)', '出生日期(YYYY-MM-DD)', '身份證號',
  '手機', '市話', 'LINE ID', '電子郵件',
  '戶籍縣市', '戶籍鄉鎮區', '戶籍村里', '戶籍鄰',
  '戶籍地址', '通訊地址', '選區',
  '職業', '服務單位', '職稱',
  '標籤(多個用逗號分隔)', '備註',
]

const VOTER_COL_MAP: Record<string, string> = {
  '姓名*': 'name', '性別(男/女/其他)': 'gender',
  '出生日期(YYYY-MM-DD)': 'birth_date', '身份證號': 'id_number',
  '手機': 'mobile', '市話': 'phone', 'LINE ID': 'line_id', '電子郵件': 'email',
  '戶籍縣市': 'household_city', '戶籍鄉鎮區': 'household_district',
  '戶籍村里': 'household_village', '戶籍鄰': 'household_neighbor',
  '戶籍地址': 'household_address', '通訊地址': 'mailing_address', '選區': 'election_area',
  '職業': 'occupation', '服務單位': 'company', '職稱': 'job_title',
  '標籤(多個用逗號分隔)': '__tags', '備註': 'note',
}

// ===== 陳情 Excel 範本欄位 =====
const PETITION_EXPORT_HEADERS = [
  '案件編號', '陳情日期', '陳情人', '陳情方式', '陳情類別', '子分類',
  '急迫程度', '狀態', '承辦人', '陳情內容',
  '區域縣市', '區域鄉鎮', '區域村里', '詳細地址', '建立時間',
]

export default async function importExportRoutes(fastify: FastifyInstance) {
  // ===== 選民範本下載 =====
  fastify.get('/api/voters/import/template', { preHandler: [authenticate] }, async (request, reply) => {
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
    ])
    helpWs['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 20 }]

    XLSX.utils.book_append_sheet(wb, ws, '選民資料')
    XLSX.utils.book_append_sheet(wb, helpWs, '欄位說明')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', 'attachment; filename*=UTF-8\'\'voter_import_template.xlsx')
    return reply.send(buf)
  })

  // ===== 選民匯出 =====
  fastify.get('/api/voters/export', { preHandler: [requirePermission('voters', 'export')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { search, city, district, village, tag } = request.query as any
    const conds = ['v.is_active = 1']
    const params: any[] = []
    if (search) { conds.push("(v.name LIKE ? OR v.mobile LIKE ? OR v.household_address LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    if (city) { conds.push('v.household_city = ?'); params.push(city) }
    if (district) { conds.push('v.household_district = ?'); params.push(district) }
    if (village) { conds.push('v.household_village = ?'); params.push(village) }
    if (tag) { conds.push('v.id IN (SELECT voter_id FROM voter_tags WHERE tag = ?)'); params.push(tag) }
    const where = `WHERE ${conds.join(' AND ')}`

    // G-2: Readonly role cannot export
    if (cu.role === 'readonly') {
      return reply.code(403).send({ success: false, error: '唯讀帳號無法匯出資料' })
    }

    const voters = db.prepare(`SELECT * FROM voters v ${where} ORDER BY v.id`).all(...params) as any[]
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
      target_name: `匯出 ${exportedCount} 筆選民資料`,
    })
    // Large export warning
    if (exportedCount > 500) {
      db.prepare(`INSERT INTO audit_logs(user_id,action,module,target_type,detail,created_at) VALUES(?,?,?,?,?,datetime('now','localtime'))`)
        .run(cu.id, 'large_export_warning', '選民管理', 'voter_export', JSON.stringify({ count: exportedCount, user: cu.name, time: new Date().toISOString() }))
    }

    // G-2: Add watermark fields
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const markedData = voters.map((v: any) => ({
      ...v,
      _exported_by: cu.name,
      _exported_at: timestamp,
    }))

    const rows = markedData.map((v: any) => [
      v.name, v.gender, v.birth_date, v.id_number,
      v.mobile, v.phone, v.line_id, v.email,
      v.household_city, v.household_district, v.household_village, v.household_neighbor,
      v.household_address, v.mailing_address, v.election_area,
      v.occupation, v.company, v.job_title,
      (tagMap[v.id] || []).join(','), v.note,
      v._exported_by, v._exported_at,
    ])

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
    const cu = (request as any).currentUser
    const data = await request.file()
    if (!data) return reply.code(400).send({ success: false, error: '請上傳 Excel 檔案' })

    // D-N6: support mode from query or multipart fields
    const queryMode = (request.query as any).mode
    const mode: 'insert' | 'upsert' = (queryMode === 'upsert') ? 'upsert' : 'insert'
    const dryRun = (request.query as any).dryRun === 'true'
    const body = request.body as any || {}

    const buf = await data.toBuffer()
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
      household_city,household_district,household_village,household_neighbor,
      household_address,mailing_address,election_area,
      occupation,company,job_title,note,created_by
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const updateVoter = db.prepare(`UPDATE voters SET
      name=?,gender=?,birth_date=?,mobile=?,phone=?,line_id=?,email=?,
      household_city=?,household_district=?,household_village=?,household_neighbor=?,
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
          // Try to parse Excel serial date number
          const serial = parseFloat(obj.birth_date)
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
        return reply.send({ success: true, preview: { valid_count: validRows.length, error_count: errors.length, update_count: updateCount, insert_count: validRows.length - updateCount, errors: errors.slice(0, 20).map(e => e.error), match_field: matchField } })
      }
      return reply.send({
        success: true,
        preview: {
          valid_count: validRows.length,
          error_count: failed,
          errors: errors.slice(0, 20).map(e => e.error),
        },
      })
    }

    // Insert/upsert all valid rows in one transaction
    db.exec('BEGIN')
    try {
      for (const { obj, rowNum } of validRows) {
        try {
          // D-N6: upsert mode - check for existing record by match_field (mobile or id_number)
          let existingId: number | null = null
          if (mode === 'upsert') {
            const matchField = body.match_field || 'mobile'
            let existing: any = null
            if (matchField === 'id_number' && obj.id_number) {
              existing = db.prepare('SELECT id FROM voters WHERE id_number=? AND is_active=1 LIMIT 1').get(obj.id_number)
            } else if (obj.mobile) {
              existing = db.prepare('SELECT id FROM voters WHERE mobile=? AND is_active=1 LIMIT 1').get(obj.mobile)
            }
            if (!existing && obj.id_number) {
              existing = db.prepare('SELECT id FROM voters WHERE id_number=? AND is_active=1 LIMIT 1').get(obj.id_number)
            }
            if (existing) existingId = (existing as any).id
          }

          if (existingId !== null) {
            updateVoter.run(
              obj.name, obj.gender || null, obj.birth_date || null,
              obj.mobile || null, obj.phone || null, obj.line_id || null, obj.email || null,
              obj.household_city || null, obj.household_district || null, obj.household_village || null, obj.household_neighbor || null,
              obj.household_address || null, obj.mailing_address || null, obj.election_area || null,
              obj.occupation || null, obj.company || null, obj.job_title || null,
              obj.note || null, existingId
            )
            if (obj.__tags) {
              db.prepare('DELETE FROM voter_tags WHERE voter_id=?').run(existingId)
              const tags = String(obj.__tags).split(',').map((t: string) => t.trim()).filter(Boolean)
              tags.forEach((tag: string) => insertTag.run(existingId, tag))
            }
            updated++
          } else {
            const r = insertVoter.run(
              obj.name, obj.gender || null, obj.birth_date || null, obj.id_number || null,
              obj.mobile || null, obj.phone || null, obj.line_id || null, obj.email || null,
              obj.household_city || null, obj.household_district || null, obj.household_village || null, obj.household_neighbor || null,
              obj.household_address || null, obj.mailing_address || null, obj.election_area || null,
              obj.occupation || null, obj.company || null, obj.job_title || null,
              obj.note || null, cu.id
            )
            if (obj.__tags) {
              const tags = String(obj.__tags).split(',').map((t: string) => t.trim()).filter(Boolean)
              tags.forEach((tag: string) => insertTag.run(r.lastInsertRowid, tag))
            }
            imported++
          }
        } catch (e: any) {
          errors.push({ row: rowNum, error: `第${rowNum}列：${e.message}` })
          failed++
        }
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

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
    const cu = (request as any).currentUser
    const { status, category, urgency, start_date, end_date, search } = request.query as any
    const conds: string[] = []
    const params: any[] = []
    if (status) { conds.push('p.status = ?'); params.push(status) }
    if (category) { conds.push('p.category = ?'); params.push(category) }
    if (urgency) { conds.push('p.urgency = ?'); params.push(urgency) }
    if (start_date) { conds.push('p.petition_date >= ?'); params.push(start_date) }
    if (end_date) { conds.push('p.petition_date <= ?'); params.push(end_date) }
    if (search) { conds.push('p.content LIKE ?'); params.push(`%${search}%`) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const URGENCY_LABELS: Record<string, string> = { normal: '一般', urgent: '急件', critical: '特急' }
    const STATUS_LABELS: Record<string, string> = {
      pending: '待處理', processing: '處理中', referred: '已轉介',
      replied: '已回覆', closed: '已結案', archived: '已歸檔',
    }

    const petitions = db.prepare(`
      SELECT p.*, v.name as voter_name, u.name as assignee_name
      FROM petitions p LEFT JOIN voters v ON p.voter_id=v.id LEFT JOIN users u ON p.assignee_id=u.id
      ${where} ORDER BY p.petition_date DESC
    `).all(...params) as any[]

    const rows = petitions.map((p: any) => [
      p.case_number, p.petition_date, p.voter_name || '',
      p.channel || '', p.category || '', p.subcategory || '',
      URGENCY_LABELS[p.urgency] || p.urgency,
      STATUS_LABELS[p.status] || p.status,
      p.assignee_name || '', p.content,
      p.area_city || '', p.area_district || '', p.area_village || '', p.area_address || '',
      p.created_at,
    ])

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
}
