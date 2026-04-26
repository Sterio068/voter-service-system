import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcrypt'
import fs from 'fs'
import path from 'path'
import { db, dbPath } from '../db/index'
import { authenticate, requirePermission } from '../middleware/auth'
import { createAuditLog } from '../middleware/audit'
import { setSetting } from '../utils/settings'
import { isSecretSettingKey } from '../utils/secrets'
import { applyDataRetention, getDataRetentionPolicy, previewDataRetention } from '../utils/dataRetention'

export default async function adminRoutes(fastify: FastifyInstance) {
  const countRemainingActiveAdmins = (excludedUserId: number) =>
    (db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin' AND is_active=1 AND id != ?").get(excludedUserId) as any).c

  const hasDefaultAdminPassword = async () => {
    const adminUser = db.prepare("SELECT password FROM users WHERE username='admin' AND role='admin' AND is_active=1 LIMIT 1").get() as any
    if (!adminUser?.password) return false
    return bcrypt.compare('admin123', adminUser.password)
  }

  const guardProtectedUserDisable = (
    reply: FastifyReply,
    currentUserId: number,
    targetUser: any,
    targetUserId: number
  ) => {
    if (targetUserId === currentUserId) {
      return reply.code(400).send({ success: false, error: '不可停用或刪除自己的帳號，請由其他管理員操作' })
    }

    if (targetUser.role === 'admin' && Number(targetUser.is_active) === 1 && countRemainingActiveAdmins(targetUserId) < 1) {
      return reply.code(400).send({ success: false, error: '系統至少需保留一位有效的管理員' })
    }

    return null
  }

  // ===== 使用者名單（所有已登入者可取得，僅供承辦下拉選單用）=====
  fastify.get('/api/users/list', { preHandler: [authenticate] }, async (_, reply) => {
    const users = db.prepare('SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name').all()
    return reply.send({ success: true, data: users })
  })

  // ===== 帳號管理 =====
  fastify.get('/api/admin/users', { preHandler: [requirePermission('users', 'view')] }, async (_, reply) => {
    const users = db.prepare('SELECT id,username,name,role,email,phone,is_active,created_at,updated_at FROM users ORDER BY created_at').all()
    return reply.send({ success: true, data: users })
  })

  fastify.post('/api/admin/users', { preHandler: [requirePermission('users', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { username, password, name, role, email, phone } = request.body as any
    if (!username || !password || !name || !role) return reply.code(400).send({ success: false, error: '帳號、密碼、姓名、角色為必填' })
    if (password.length < 8) return reply.code(400).send({ success: false, error: '密碼至少需要 8 個字元' })
    if (!['admin','supervisor','assistant','volunteer'].includes(role)) return reply.code(400).send({ success: false, error: '無效的角色' })
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) return reply.code(409).send({ success: false, error: '帳號已存在' })
    const hashed = await bcrypt.hash(password, 12)
    const r = db.prepare('INSERT INTO users (username,password,name,role,email,phone) VALUES (?,?,?,?,?,?)').run(username, hashed, name, role, email ?? null, phone ?? null)
    createAuditLog(request, cu.id, { action: 'create', module: '帳號管理', target_type: 'user', target_id: r.lastInsertRowid as number, target_name: name })
    return reply.code(201).send({ success: true, message: '使用者已建立', data: { id: r.lastInsertRowid } })
  })

  fastify.put('/api/admin/users/:id', { preHandler: [requirePermission('users', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { name, role, email, phone, is_active } = request.body as any
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) as any
    if (!user) return reply.code(404).send({ success: false, error: '使用者不存在' })
    if (role !== undefined && !['admin','supervisor','assistant','volunteer'].includes(role)) {
      return reply.code(400).send({ success: false, error: '無效的角色' })
    }
    // Prevent self-role change to avoid accidental self-lockout
    if (Number(id) === cu.id && role !== undefined && role !== user.role) {
      return reply.code(403).send({ success: false, error: '不可更改自己的角色，請聯絡其他管理員' })
    }
    // Ensure at least one active admin always remains
    const demotingAdmin = user.role === 'admin' && role !== undefined && role !== 'admin'
    const deactivatingAdmin = user.role === 'admin' && is_active !== undefined && Number(is_active) === 0
    if (demotingAdmin || deactivatingAdmin) {
      const remainingAdmins = countRemainingActiveAdmins(Number(id))
      if (remainingAdmins < 1) {
        return reply.code(400).send({ success: false, error: '系統至少需保留一位有效的管理員' })
      }
    }
    db.prepare("UPDATE users SET name=?,role=?,email=?,phone=?,is_active=?,updated_at=datetime('now','localtime') WHERE id=?")
      .run(name ?? user.name, role ?? user.role, email ?? user.email, phone ?? user.phone, is_active ?? user.is_active, Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '帳號管理', target_type: 'user', target_id: Number(id), target_name: user.name })
    return reply.send({ success: true, message: '使用者已更新' })
  })

  fastify.put('/api/admin/users/:id/password', { preHandler: [requirePermission('users', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { password, confirm_self_password } = request.body as any
    if (!password || password.length < 8) return reply.code(400).send({ success: false, error: '密碼至少需要 8 個字元' })
    // Require requester's own password for sensitive account operations
    if (!confirm_self_password) return reply.code(400).send({ success: false, error: '請提供自己的密碼以確認身份' })
    const requester = db.prepare('SELECT password FROM users WHERE id=?').get(cu.id) as any
    if (!await bcrypt.compare(confirm_self_password, requester.password)) {
      return reply.code(403).send({ success: false, error: '身份驗證失敗，請確認您自己的密碼' })
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) as any
    if (!user) return reply.code(404).send({ success: false, error: '使用者不存在' })
    const hashed = await bcrypt.hash(password, 12)
    db.prepare("UPDATE users SET password=?,updated_at=datetime('now','localtime') WHERE id=?").run(hashed, Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '帳號管理', target_id: Number(id), target_name: `重設 ${user.name} 密碼` })
    return reply.send({ success: true, message: '密碼已重設' })
  })

  // D-N9: Delete user with active petition check
  fastify.delete('/api/admin/users/:id', { preHandler: [requirePermission('users', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) as any
    if (!user) return reply.code(404).send({ success: false, error: '使用者不存在' })
    const protectedResponse = guardProtectedUserDisable(reply, cu.id, user, Number(id))
    if (protectedResponse) return protectedResponse
    const activePetitions = db.prepare(
      "SELECT COUNT(*) as count FROM petitions WHERE assignee_id=? AND status NOT IN ('closed','cancelled')"
    ).get(Number(id)) as any
    if (activePetitions.count > 0) {
      return reply.code(409).send({
        success: false,
        error: `此帳號尚有 ${activePetitions.count} 件進行中陳情，請先轉派後再刪除`,
        pending_count: activePetitions.count,
      })
    }
    db.prepare("UPDATE users SET is_active=0,updated_at=datetime('now','localtime') WHERE id=?").run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '帳號管理', target_type: 'user', target_id: Number(id), target_name: user.name })
    return reply.send({ success: true, message: '使用者已停用' })
  })

  // ===== 操作紀錄 =====
  fastify.get('/api/admin/audit-logs', { preHandler: [requirePermission('audit_logs', 'view')] }, async (request, reply) => {
    const { page = 1, pageSize = 20, user_id, action, module: mod, start_date, end_date } = request.query as any
    const conds: string[] = []
    const params: any[] = []
    if (user_id) { conds.push('al.user_id = ?'); params.push(Number(user_id)) }
    if (action) { conds.push('al.action = ?'); params.push(action) }
    if (mod) { conds.push('al.module = ?'); params.push(mod) }
    if (start_date) { conds.push('al.created_at >= ?'); params.push(start_date) }
    if (end_date) { conds.push('al.created_at <= ?'); params.push(end_date + ' 23:59:59') }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = (db.prepare(`SELECT COUNT(*) as count FROM audit_logs al ${where}`).get(...params) as any).count
    const logs = db.prepare(`
      SELECT al.*, u.name as user_name FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id ${where}
      ORDER BY al.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize))
    return reply.send({ success: true, data: logs, total, page: Number(page), pageSize: Number(pageSize) })
  })

  // ===== 類別管理 =====
  fastify.get('/api/admin/categories', { preHandler: [requirePermission('categories', 'view')] }, async (request, reply) => {
    const { type } = request.query as any
    const cats = type
      ? db.prepare('SELECT * FROM categories WHERE type = ? ORDER BY sort_order').all(type)
      : db.prepare('SELECT * FROM categories ORDER BY type, sort_order').all()
    return reply.send({ success: true, data: cats })
  })

  fastify.post('/api/admin/categories', { preHandler: [requirePermission('categories', 'create')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { type, parent_id, name, sort_order, code, color } = request.body as any
    if (!type || !name) return reply.code(400).send({ success: false, error: '類別類型和名稱為必填' })
    const r = db.prepare('INSERT INTO categories (type,parent_id,name,sort_order,code,color) VALUES (?,?,?,?,?,?)')
      .run(type, parent_id ?? null, name, sort_order ?? 0, code ?? null, color ?? null)
    createAuditLog(request, cu.id, { action: 'create', module: '類別管理', target_name: name })
    return reply.code(201).send({ success: true, data: { id: r.lastInsertRowid } })
  })

  fastify.put('/api/admin/categories/:id', { preHandler: [requirePermission('categories', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const { name, sort_order, is_active, code, color } = request.body as any
    const existing = db.prepare('SELECT id FROM categories WHERE id=?').get(Number(id))
    if (!existing) return reply.code(404).send({ success: false, error: '類別不存在' })
    db.prepare('UPDATE categories SET name=?,sort_order=?,is_active=?,code=?,color=? WHERE id=?')
      .run(name, sort_order ?? 0, is_active ?? 1, code ?? null, color ?? null, Number(id))
    createAuditLog(request, cu.id, { action: 'update', module: '類別管理', target_id: Number(id), target_name: name })
    return reply.send({ success: true, message: '類別已更新' })
  })

  fastify.delete('/api/admin/categories/:id', { preHandler: [requirePermission('categories', 'delete')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { id } = request.params as any
    const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(Number(id)) as any
    if (cat?.is_protected) return reply.code(403).send({ success: false, error: '此類別為系統保護，無法刪除' })
    db.prepare('DELETE FROM categories WHERE id = ?').run(Number(id))
    createAuditLog(request, cu.id, { action: 'delete', module: '類別管理', target_id: Number(id) })
    return reply.send({ success: true, message: '類別已刪除' })
  })

  // ===== 系統設定 =====
  const SENSITIVE_SETTINGS = new Set([
    'jwt_secret', 'machine_fingerprint',
    'line_channel_access_token', 'line_channel_secret',
    'gcal_client_id', 'gcal_client_secret',
    'ai_api_key',
  ])
  fastify.get('/api/admin/settings', { preHandler: [requirePermission('settings', 'view')] }, async (_, reply) => {
    const rows = db.prepare('SELECT * FROM settings').all() as any[]
    const result: Record<string, string | boolean | null> = {}
    rows.forEach(s => {
      if (isSecretSettingKey(s.key)) {
        result[`${s.key}_configured`] = !!s.value
        return
      }
      if (!SENSITIVE_SETTINGS.has(s.key)) result[s.key] = s.value
    })
    result.backup_path = process.env.BACKUPS_PATH || ''
    return reply.send({ success: true, data: result })
  })

  // C-4: System alerts endpoint
  fastify.get('/api/admin/alerts', { preHandler: [authenticate] }, async (_, reply) => {
    const alerts = db.prepare(
      `SELECT id, detail, created_at FROM audit_logs WHERE target_type='system_alert' ORDER BY created_at DESC LIMIT 30`
    ).all() as any[]
    const data = alerts.map(row => {
      try { return { ...row, detail: JSON.parse(row.detail) } } catch { return row }
    })
    return reply.send({ success: true, data })
  })

  const ALLOWED_SETTINGS = new Set([
    'office_name', 'office_address', 'office_contact', 'office_phone', 'office_fax', 'office_email',
    'auto_backup_enabled', 'auto_backup_interval', 'backup_path',
    'data_retention_enabled', 'retention_audit_archive_days', 'retention_client_error_days', 'retention_soft_deleted_voter_days',
    'idle_timeout', 'login_lock_attempts', 'login_lock_minutes',
    'stats_exclude_inactive', 'election_year_mode',
    'line_channel_access_token', 'line_channel_secret',
    'gcal_client_id', 'gcal_client_secret',
    'first_run',
  ])

  fastify.put('/api/admin/settings', { preHandler: [requirePermission('settings', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const updates = request.body as Record<string, string>
    const illegal = Object.keys(updates).filter(k => !ALLOWED_SETTINGS.has(k))
    if (illegal.length > 0) {
      return reply.code(400).send({ success: false, error: `不允許修改的設定項目：${illegal.join(', ')}` })
    }
    if (updates.first_run === 'false' && await hasDefaultAdminPassword()) {
      return reply.code(400).send({ success: false, error: '請先完成首次管理員密碼修改，才能結束首次執行精靈' })
    }
    db.exec('BEGIN')
    try {
      for (const [k, v] of Object.entries(updates)) setSetting(k as any, v as any)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    createAuditLog(request, cu.id, { action: 'update', module: '系統設定' })
    return reply.send({ success: true, message: '設定已儲存' })
  })

  // ===== E-1: Staff Transfer (Handover) =====
  fastify.post('/api/admin/users/:userId/transfer', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { userId } = request.params as any
    const { transfer_to_user_id, include_petitions = true, include_tasks = true } = request.body as any
    if (!transfer_to_user_id) return reply.code(400).send({ success: false, error: 'transfer_to_user_id 為必填' })

    const sourceUser = db.prepare('SELECT * FROM users WHERE id=?').get(Number(userId)) as any
    if (!sourceUser) return reply.code(404).send({ success: false, error: '來源使用者不存在' })

    const targetUser = db.prepare('SELECT * FROM users WHERE id=? AND is_active=1').get(Number(transfer_to_user_id)) as any
    if (!targetUser) return reply.code(404).send({ success: false, error: '目標使用者不存在或已停用' })

    let petitionCount = 0, taskCount = 0
    db.exec('BEGIN')
    try {
      if (include_petitions) {
        const result = db.prepare(`UPDATE petitions SET assignee_id=? WHERE assignee_id=? AND status NOT IN ('closed','cancelled')`).run(Number(transfer_to_user_id), Number(userId))
        petitionCount = Number(result.changes)
      }
      if (include_tasks) {
        const result = db.prepare(`UPDATE tasks SET assignee_id=? WHERE assignee_id=? AND status NOT IN ('done','cancelled')`).run(Number(transfer_to_user_id), Number(userId))
        taskCount = Number(result.changes)
      }
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }

    const detail = JSON.stringify({ from: sourceUser.name, to: targetUser.name, petitions: petitionCount, tasks: taskCount })
    createAuditLog(request, cu.id, { action: 'transfer', module: '帳號管理', target_type: 'user', target_id: Number(userId), target_name: sourceUser.name, detail } as any)
    return reply.send({ success: true, message: '交接完成', data: { petitions_transferred: petitionCount, tasks_transferred: taskCount } })
  })

  // E-1: Disable user with mandatory transfer check
  fastify.put('/api/admin/users/:userId/disable', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { userId } = request.params as any
    const { force = false } = request.body as any

    const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(userId)) as any
    if (!user) return reply.code(404).send({ success: false, error: '使用者不存在' })
    const protectedResponse = guardProtectedUserDisable(reply, cu.id, user, Number(userId))
    if (protectedResponse) return protectedResponse

    const openPetitions = (db.prepare(`SELECT COUNT(*) as c FROM petitions WHERE assignee_id=? AND status NOT IN ('closed','cancelled')`).get(Number(userId)) as any).c
    const openTasks = (db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status NOT IN ('done','cancelled')`).get(Number(userId)) as any).c

    if ((openPetitions > 0 || openTasks > 0) && !force) {
      return reply.code(400).send({
        success: false,
        error: `此帳號尚有進行中的陳情 ${openPetitions} 件、待辦 ${openTasks} 件，請先使用 /transfer 交接，或傳入 force=true 強制停用`,
        open_petitions: openPetitions,
        open_tasks: openTasks,
        hint: `POST /api/admin/users/${userId}/transfer`,
      })
    }

    db.prepare("UPDATE users SET is_active=0,updated_at=datetime('now','localtime') WHERE id=?").run(Number(userId))
    createAuditLog(request, cu.id, { action: 'delete', module: '帳號管理', target_type: 'user', target_id: Number(userId), target_name: user.name, detail: JSON.stringify({ force, open_petitions: openPetitions, open_tasks: openTasks }) } as any)
    return reply.send({ success: true, message: '使用者已停用' })
  })

  // ===== F-1: System Health Dashboard =====
  fastify.get('/api/admin/system-health', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    // Database size
    const pageCountRow = db.prepare('PRAGMA page_count').get() as any
    const pageSizeRow = db.prepare('PRAGMA page_size').get() as any
    const sizeMb = Number(((pageCountRow.page_count * pageSizeRow.page_size) / 1024 / 1024).toFixed(2))

    // Tables by row count — batch in a read transaction for speed
    const tableNames = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[]).map(r => r.name)
    const tableRows: Array<{ name: string; rows: number }> = []
    const failedTables: string[] = []
    try {
      db.exec('BEGIN')
      for (const tname of tableNames) {
        try {
          const cnt = (db.prepare(`SELECT COUNT(*) as c FROM "${tname}"`).get() as any).c
          tableRows.push({ name: tname, rows: cnt })
        } catch (e) {
          failedTables.push(tname)
          console.warn(`[SystemHealth] count failed for table ${tname}:`, e instanceof Error ? e.message : e)
        }
      }
      db.exec('COMMIT')
    } catch (e) {
      console.warn('[SystemHealth] table-count transaction failed:', e instanceof Error ? e.message : e)
      try {
        db.exec('ROLLBACK')
      } catch (rollbackErr) {
        console.warn('[SystemHealth] rollback failed:', rollbackErr instanceof Error ? rollbackErr.message : rollbackErr)
      }
    }
    tableRows.sort((a, b) => b.rows - a.rows)
    const topTables = tableRows.slice(0, 8)

    // WAL file
    const walExists = fs.existsSync(dbPath + '-wal')

    // Last vacuum from settings
    const lastVacuumRow = db.prepare("SELECT value FROM settings WHERE key='last_vacuum'").get() as any
    const lastVacuum = lastVacuumRow?.value ?? null

    // Backup info
    const bDir = process.env.BACKUPS_PATH && fs.existsSync(process.env.BACKUPS_PATH) ? process.env.BACKUPS_PATH : null
    let lastBackup: string | null = null
    let backupCount = 0
    if (bDir) {
      try {
        const files = fs.readdirSync(bDir).filter(f => f.endsWith('.db'))
        backupCount = files.length
        if (files.length > 0) {
          const sorted = files.map(f => ({ f, mtime: fs.statSync(path.join(bDir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime)
          lastBackup = new Date(sorted[0].mtime).toISOString()
        }
      } catch (e) {
        failedTables.push('backup_directory')
        console.warn('[SystemHealth] backup directory scan failed:', e instanceof Error ? e.message : e)
      }
    }
    const lastBackupSetting = (db.prepare("SELECT value FROM settings WHERE key='last_auto_backup'").get() as any)?.value ?? null
    if (!lastBackup && lastBackupSetting) lastBackup = lastBackupSetting

    const lastVerifyRow = db.prepare("SELECT value FROM settings WHERE key='scheduler_last_run_backup_verify'").get() as any
    const lastVerifyResult = lastVerifyRow?.value ?? null

    // Scheduler last runs
    const getSchedulerRun = (key: string) => {
      const row = db.prepare("SELECT value FROM settings WHERE key=?").get(`scheduler_last_run_${key}`) as any
      return { last_run: row?.value ?? null }
    }

    // Schema version
    let schemaVersion: string | null = null
    try {
      const sv = db.prepare("SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1").get() as any
      schemaVersion = sv?.version ?? null
    } catch (e) {
      failedTables.push('schema_migrations')
      console.warn('[SystemHealth] schema_migrations lookup failed:', e instanceof Error ? e.message : e)
    }

    // Errors last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    const errorCount = (db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action IN ('api_error','fatal_error') AND created_at >= ?`).get(since24h) as any).c
    const lastErrorRow = db.prepare(`SELECT detail FROM audit_logs WHERE action IN ('api_error','fatal_error') ORDER BY created_at DESC LIMIT 1`).get() as any
    const lastError = lastErrorRow?.detail ?? null

    return reply.send({
      success: true,
      data: {
        database: { size_mb: sizeMb, tables: topTables, wal_exists: walExists, last_vacuum: lastVacuum },
        backup: { last_backup: lastBackup, backup_count: backupCount, last_verify_result: lastVerifyResult },
        scheduler: {
          consistency_check: getSchedulerRun('consistency_check'),
          daily_alerts: getSchedulerRun('daily_alerts'),
          backup_verify: getSchedulerRun('backup_verify'),
        },
        schema: { version: schemaVersion },
        errors: { last_24h_count: errorCount, last_error: lastError },
        failed_tables: failedTables,
      }
    })
  })

  // ===== Data Quality Scan =====
  fastify.get('/api/admin/data-quality', { preHandler: [requirePermission('admin', 'view')] }, async (_request, reply) => {
    const duplicateMobiles = db.prepare(`
      SELECT mobile, COUNT(*) as count, GROUP_CONCAT(id) as voter_ids
      FROM voters
      WHERE is_active=1 AND mobile IS NOT NULL AND TRIM(mobile) <> ''
      GROUP BY mobile
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 50
    `).all() as any[]

    const duplicateIdNumbers = db.prepare(`
      SELECT id_number, COUNT(*) as count, GROUP_CONCAT(id) as voter_ids
      FROM voters
      WHERE is_active=1 AND id_number IS NOT NULL AND TRIM(id_number) <> ''
      GROUP BY id_number
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 50
    `).all() as any[]

    const invalidMobiles = db.prepare(`
      SELECT id, name, mobile
      FROM voters
      WHERE is_active=1
        AND mobile IS NOT NULL
        AND TRIM(mobile) <> ''
        AND (LENGTH(mobile) != 10 OR mobile NOT LIKE '09%' OR mobile GLOB '*[^0-9]*')
      ORDER BY updated_at DESC
      LIMIT 50
    `).all() as any[]

    const orphanAttachmentRows = db.prepare(`
      SELECT ref_type, COUNT(*) as count
      FROM attachments a
      WHERE ref_type NOT IN ('petition','voter','document','consultation','ceremony','event','proposal')
        OR (ref_type='petition' AND NOT EXISTS (SELECT 1 FROM petitions p WHERE p.id=a.ref_id))
        OR (ref_type='voter' AND NOT EXISTS (SELECT 1 FROM voters v WHERE v.id=a.ref_id))
        OR (ref_type='document' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=a.ref_id))
        OR (ref_type='consultation' AND NOT EXISTS (SELECT 1 FROM consultation_appointments c WHERE c.id=a.ref_id))
        OR (ref_type='ceremony' AND NOT EXISTS (SELECT 1 FROM ceremony_records cr WHERE cr.id=a.ref_id))
        OR (ref_type='event' AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id=a.ref_id))
        OR (ref_type='proposal' AND NOT EXISTS (SELECT 1 FROM proposals pr WHERE pr.id=a.ref_id))
      GROUP BY ref_type
    `).all() as any[]

    const uploadBase = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
    const attachmentRows = db.prepare('SELECT id, file_name, file_path FROM attachments ORDER BY id DESC LIMIT 1000').all() as any[]
    const missingFiles = attachmentRows
      .filter(row => {
        const filePath = path.resolve(uploadBase, row.file_path || '')
        return filePath.startsWith(path.resolve(uploadBase) + path.sep) && !fs.existsSync(filePath)
      })
      .slice(0, 50)

    const orphanRelations = db.prepare(`
      SELECT COUNT(*) as count
      FROM voter_relations vr
      WHERE NOT EXISTS (SELECT 1 FROM voters v WHERE v.id=vr.voter_id)
         OR NOT EXISTS (SELECT 1 FROM voters v WHERE v.id=vr.related_voter_id)
    `).get() as any

    const orphanGroupMembers = db.prepare(`
      SELECT COUNT(*) as count
      FROM group_members gm
      WHERE NOT EXISTS (SELECT 1 FROM groups g WHERE g.id=gm.group_id)
         OR NOT EXISTS (SELECT 1 FROM voters v WHERE v.id=gm.voter_id)
    `).get() as any

    const checks = [
      { key: 'duplicate_mobiles', label: '重複手機', severity: 'high', count: duplicateMobiles.length, sample: duplicateMobiles.slice(0, 10) },
      { key: 'duplicate_id_numbers', label: '重複身分證號', severity: 'high', count: duplicateIdNumbers.length, sample: duplicateIdNumbers.slice(0, 10) },
      { key: 'invalid_mobiles', label: '手機格式異常', severity: 'medium', count: invalidMobiles.length, sample: invalidMobiles.slice(0, 10) },
      { key: 'orphan_attachments', label: '孤兒附件關聯', severity: 'medium', count: orphanAttachmentRows.reduce((sum, row) => sum + Number(row.count || 0), 0), sample: orphanAttachmentRows },
      { key: 'missing_attachment_files', label: '附件檔案遺失', severity: 'medium', count: missingFiles.length, sample: missingFiles.slice(0, 10) },
      { key: 'orphan_voter_relations', label: '選民關係孤兒資料', severity: 'medium', count: Number(orphanRelations?.count || 0), sample: [] },
      { key: 'orphan_group_members', label: '團體成員孤兒資料', severity: 'medium', count: Number(orphanGroupMembers?.count || 0), sample: [] },
    ]
    const issueCount = checks.reduce((sum, check) => sum + check.count, 0)
    const highIssueCount = checks.filter(check => check.severity === 'high').reduce((sum, check) => sum + check.count, 0)

    const responseBody = {
      checked_at: new Date().toISOString(),
      summary: {
        issue_count: issueCount,
        high_issue_count: highIssueCount,
        status: issueCount === 0 ? 'ok' : highIssueCount > 0 ? 'attention' : 'warning',
      },
      checks,
    }

    // CSV mode: ?format=csv triggers download of a flat CSV report so the
    // user can paste into Excel for cleanup work without copy-paste from UI.
    const fmt = (_request.query as any)?.format
    if (fmt === 'csv') {
      const escape = (v: unknown): string => {
        const s = v == null ? '' : String(v)
        if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
      }
      const safeCsvCell = (v: unknown): string => {
        const s = v == null ? '' : String(v)
        return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
      }
      const lines: string[] = []
      lines.push(['檢查項目', '嚴重度', '計數', '範例詳情'].map(escape).join(','))
      for (const c of checks) {
        const baseRow = [c.label, c.severity, c.count]
        if (!c.sample || c.sample.length === 0) {
          lines.push(baseRow.map(v => escape(safeCsvCell(v))).join(',') + ',')
          continue
        }
        for (const item of c.sample) {
          // Flatten sample object to "key=value; key=value"
          const detail = Object.entries(item)
            .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join('; ')
          lines.push([...baseRow, detail].map(v => escape(safeCsvCell(v))).join(','))
        }
      }
      const csv = '﻿' + lines.join('\n') // BOM for Excel UTF-8
      const fname = `data-quality-${new Date().toISOString().slice(0, 10)}.csv`
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`)
      return reply.send(csv)
    }

    return reply.send({ success: true, data: responseBody })
  })

  // ===== Data Retention =====
  fastify.get('/api/admin/data-retention/preview', { preHandler: [requirePermission('admin', 'view')] }, async (_request, reply) => {
    const policy = getDataRetentionPolicy(db)
    return reply.send({
      success: true,
      data: {
        enabled: policy.enabled,
        policy,
        counts: previewDataRetention(db, policy),
      },
    })
  })

  fastify.post('/api/admin/data-retention/run', { preHandler: [requirePermission('admin', 'edit')] }, async (request, reply) => {
    const cu = (request as any).currentUser
    const { confirm } = request.body as any
    const policy = getDataRetentionPolicy(db)
    if (!policy.enabled) {
      return reply.code(400).send({ success: false, error: '資料保留政策尚未啟用' })
    }
    if (confirm !== 'RUN_RETENTION') {
      return reply.code(400).send({ success: false, error: '請輸入確認字串 RUN_RETENTION 後再執行' })
    }
    const result = applyDataRetention(db, policy)
    createAuditLog(request, cu.id, {
      action: 'delete',
      module: '資料保留',
      target_type: 'data_retention',
      detail: JSON.stringify({ policy, result }),
    } as any)
    return reply.send({ success: true, message: '資料保留清理已完成', data: result })
  })

  // ===== F-3: Frontend Error Collection =====
  // POST /api/client-errors — IP-based rate limit: max 20 req / 10 min
  const clientErrorCounts = new Map<string, { count: number; resetAt: number }>()
  fastify.post('/api/client-errors', { preHandler: [authenticate] }, async (request, reply) => {
    const ip = request.ip || 'unknown'
    const now = Date.now()
    const windowMs = 10 * 60 * 1000
    const entry = clientErrorCounts.get(ip)
    if (entry && now < entry.resetAt) {
      if (entry.count >= 20) return reply.code(429).send({ success: false, error: '請求過於頻繁' })
      entry.count++
    } else {
      clientErrorCounts.set(ip, { count: 1, resetAt: now + windowMs })
    }
    // Truncate fields to prevent log flooding
    const { message, source, stack, url } = request.body as any
    const user_id = (request as any).currentUser?.id ?? null
    const user_agent = request.headers['user-agent'] ?? null
    db.prepare(`INSERT INTO client_errors(message,source,stack,user_agent,user_id,url) VALUES(?,?,?,?,?,?)`)
      .run(
        String(message ?? '').slice(0, 500),
        String(source ?? '').slice(0, 200),
        String(stack ?? '').slice(0, 2000),
        user_agent,
        user_id,
        String(url ?? '').slice(0, 500)
      )
    return reply.send({ success: true })
  })

  // GET /api/client-errors
  fastify.get('/api/client-errors', { preHandler: [requirePermission('admin', 'view')] }, async (request, reply) => {
    const errors = db.prepare('SELECT * FROM client_errors ORDER BY created_at DESC LIMIT 50').all()
    return reply.send({ success: true, data: errors })
  })

  // ===== E-2: System Updates (lightweight polling) =====
  // Requires petitions.view as minimum — prevents zero-permission roles from polling audit activity
  fastify.get('/api/system/updates', { preHandler: [requirePermission('petitions', 'view')] }, async (request, reply) => {
    const since = (request.query as any).since || new Date(Date.now() - 60000).toISOString()
    const changes = db.prepare(`
      SELECT target_type, target_id, action, created_at
      FROM audit_logs
      WHERE created_at > ? AND action IN ('create','update','delete','merge')
      ORDER BY created_at DESC LIMIT 50
    `).all(since)
    return reply.send({ success: true, data: changes, server_time: new Date().toISOString() })
  })

  // ===== App 版本檢查（半自動 auto-update）=====
  // 緩存 1 小時避免 GitHub API rate limit
  let versionCheckCache: { fetchedAt: number; data: any } | null = null
  const VERSION_CHECK_TTL = 60 * 60 * 1000 // 1h
  fastify.get('/api/system/version-check', { preHandler: [authenticate] }, async (_request, reply) => {
    const currentVersion = String(process.env.npm_package_version || require('../../package.json').version || '0.0.0')

    // 從快取取
    if (versionCheckCache && Date.now() - versionCheckCache.fetchedAt < VERSION_CHECK_TTL) {
      return reply.send({ success: true, data: { current: currentVersion, ...versionCheckCache.data, cached: true } })
    }

    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const resp = await fetch('https://api.github.com/repos/Sterio068/voter-service-system/releases/latest', {
        headers: { 'User-Agent': 'voter-service-system' },
        signal: ctrl.signal,
      }).catch(() => null)
      clearTimeout(timer)
      if (!resp || !resp.ok) {
        return reply.send({ success: true, data: { current: currentVersion, latest: null, has_update: false, reason: 'github_unreachable' } })
      }
      const json = await resp.json() as { tag_name?: string; html_url?: string; published_at?: string; body?: string }
      const latestTag = String(json.tag_name || '').replace(/^v/, '')
      const has_update = !!latestTag && cmpVersion(latestTag, currentVersion) > 0
      const data = {
        latest: latestTag,
        latest_url: json.html_url,
        latest_published: json.published_at,
        latest_notes: String(json.body || '').slice(0, 1000),
        has_update,
      }
      versionCheckCache = { fetchedAt: Date.now(), data }
      return reply.send({ success: true, data: { current: currentVersion, ...data, cached: false } })
    } catch (e) {
      return reply.send({ success: true, data: { current: currentVersion, latest: null, has_update: false, reason: 'check_failed' } })
    }
  })
}

// semver 簡化比較：只比 major.minor.patch，回 -1 / 0 / 1
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}
