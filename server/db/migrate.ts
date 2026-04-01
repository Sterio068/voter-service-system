import { db } from './index'
import bcrypt from 'bcrypt'

export function runMigrations() {
  // D-2: Schema migrations version table (must be first)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now','localtime')),
      description TEXT
    )`)
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT NOT NULL UNIQUE,
      password    TEXT NOT NULL,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'assistant',
      email       TEXT,
      phone       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      action      TEXT NOT NULL,
      module      TEXT NOT NULL,
      target_type TEXT,
      target_id   INTEGER,
      target_name TEXT,
      detail      TEXT,
      ip_address  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS voters (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT NOT NULL,
      gender              TEXT,
      birth_date          TEXT,
      id_number           TEXT,
      mobile              TEXT,
      phone               TEXT,
      line_id             TEXT,
      email               TEXT,
      household_city      TEXT,
      household_district  TEXT,
      household_village   TEXT,
      household_neighbor  TEXT,
      household_address   TEXT,
      mailing_address     TEXT,
      occupation          TEXT,
      company             TEXT,
      job_title           TEXT,
      election_area       TEXT,
      note                TEXT,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_by          INTEGER,
      created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS voter_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id    INTEGER NOT NULL,
      tag         TEXT NOT NULL,
      FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voter_relations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id          INTEGER NOT NULL,
      related_voter_id  INTEGER NOT NULL,
      relation_type     TEXT NOT NULL,
      note              TEXT,
      FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE,
      FOREIGN KEY (related_voter_id) REFERENCES voters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      category      TEXT,
      leader_id     INTEGER,
      contact_id    INTEGER,
      phone         TEXT,
      address       TEXT,
      member_count  INTEGER,
      note          TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_by    INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (leader_id) REFERENCES voters(id),
      FOREIGN KEY (contact_id) REFERENCES voters(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    INTEGER NOT NULL,
      voter_id    INTEGER NOT NULL,
      role        TEXT,
      joined_at   TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE,
      UNIQUE(group_id, voter_id)
    );

    CREATE TABLE IF NOT EXISTS petitions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number     TEXT NOT NULL UNIQUE,
      petition_date   TEXT NOT NULL,
      voter_id        INTEGER,
      channel         TEXT,
      category        TEXT,
      subcategory     TEXT,
      content         TEXT NOT NULL,
      area_city       TEXT,
      area_district   TEXT,
      area_village    TEXT,
      area_address    TEXT,
      urgency         TEXT DEFAULT 'normal',
      status          TEXT DEFAULT 'pending',
      assignee_id     INTEGER,
      satisfaction    TEXT,
      closed_at       TEXT,
      created_by      INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (voter_id) REFERENCES voters(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS petition_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      petition_id   INTEGER NOT NULL,
      action_type   TEXT NOT NULL,
      content       TEXT NOT NULL,
      referred_to   TEXT,
      created_by    INTEGER,
      created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (petition_id) REFERENCES petitions(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_number            TEXT NOT NULL UNIQUE,
      doc_type              TEXT NOT NULL,
      doc_date              TEXT NOT NULL,
      org_name              TEXT,
      org_doc_number        TEXT,
      org_doc_date          TEXT,
      subject               TEXT NOT NULL,
      content_summary       TEXT,
      category              TEXT,
      assignee_id           INTEGER,
      status                TEXT DEFAULT 'pending',
      deadline              TEXT,
      related_doc_id        INTEGER,
      related_petition_id   INTEGER,
      created_by            INTEGER,
      created_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (related_petition_id) REFERENCES petitions(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      title                 TEXT NOT NULL,
      start_time            TEXT NOT NULL,
      end_time              TEXT,
      schedule_type         TEXT,
      location              TEXT,
      attendees             TEXT,
      related_voter_ids     TEXT,
      related_group_ids     TEXT,
      related_petition_id   INTEGER,
      note                  TEXT,
      is_recurring          INTEGER DEFAULT 0,
      recurrence_rule       TEXT,
      status                TEXT DEFAULT 'scheduled',
      reminder_minutes      INTEGER DEFAULT 30,
      created_by            INTEGER,
      created_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (related_petition_id) REFERENCES petitions(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_type    TEXT NOT NULL,
      ref_id      INTEGER NOT NULL,
      file_name   TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      file_size   INTEGER,
      mime_type   TEXT,
      created_by  INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      parent_id   INTEGER,
      name        TEXT NOT NULL,
      sort_order  INTEGER DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS seq_numbers (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_voters_name ON voters(name);
    CREATE INDEX IF NOT EXISTS idx_voters_mobile ON voters(mobile);
    CREATE INDEX IF NOT EXISTS idx_voters_active ON voters(is_active);
    CREATE INDEX IF NOT EXISTS idx_voters_city ON voters(household_city);
    CREATE INDEX IF NOT EXISTS idx_voter_tags_tag ON voter_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_voter_tags_voter ON voter_tags(voter_id);
    CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status);
    CREATE INDEX IF NOT EXISTS idx_petitions_voter ON petitions(voter_id);
    CREATE INDEX IF NOT EXISTS idx_petitions_date ON petitions(petition_date);
    CREATE INDEX IF NOT EXISTS idx_petitions_assignee ON petitions(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_petitions_urgency ON petitions(urgency);
    CREATE INDEX IF NOT EXISTS idx_petition_logs_petition ON petition_logs(petition_id);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(doc_date);
    CREATE INDEX IF NOT EXISTS idx_documents_deadline ON documents(deadline);
    CREATE INDEX IF NOT EXISTS idx_schedules_start ON schedules(start_time);
    CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
    CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(is_active);
    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_voter ON group_members(voter_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
    CREATE INDEX IF NOT EXISTS idx_attachments_ref ON attachments(ref_type, ref_id);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

    CREATE TABLE IF NOT EXISTS contact_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER REFERENCES voters(id),
      contact_date TEXT NOT NULL,
      contact_type TEXT DEFAULT 'phone',
      content TEXT NOT NULL,
      result TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_contact_records_voter_id ON contact_records(voter_id);

    CREATE TABLE IF NOT EXISTS election_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT,
      district TEXT,
      area_code TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_date TEXT,
      assignee_id INTEGER REFERENCES users(id),
      related_voter_id INTEGER REFERENCES voters(id),
      related_petition_id INTEGER REFERENCES petitions(id),
      related_document_id INTEGER REFERENCES documents(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      end_date TEXT,
      location TEXT,
      event_type TEXT DEFAULT 'general',
      description TEXT,
      organizer TEXT,
      capacity INTEGER,
      status TEXT DEFAULT 'planned',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id),
      voter_id INTEGER NOT NULL REFERENCES voters(id),
      role TEXT DEFAULT 'participant',
      attendance INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(event_id, voter_id)
    );

    CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_participants_voter ON event_participants(voter_id);

    CREATE TABLE IF NOT EXISTS voter_engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER NOT NULL UNIQUE REFERENCES voters(id),
      support_level INTEGER DEFAULT 3,
      is_key_supporter INTEGER DEFAULT 0,
      is_volunteer INTEGER DEFAULT 0,
      activity_count INTEGER DEFAULT 0,
      last_contact_date TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'app',
      target_type TEXT DEFAULT 'all',
      target_filter TEXT,
      status TEXT DEFAULT 'draft',
      sent_count INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS notification_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL REFERENCES notifications(id),
      voter_id INTEGER NOT NULL REFERENCES voters(id),
      status TEXT DEFAULT 'pending',
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS survey_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL REFERENCES surveys(id),
      question TEXT NOT NULL,
      question_type TEXT DEFAULT 'text',
      options TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL REFERENCES surveys(id),
      voter_id INTEGER REFERENCES voters(id),
      respondent_name TEXT,
      answers TEXT NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);

    CREATE TABLE IF NOT EXISTS consultation_appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER REFERENCES voters(id),
      voter_name TEXT NOT NULL,
      voter_phone TEXT,
      appointment_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      issue_summary TEXT,
      status TEXT DEFAULT 'pending',
      attorney_note TEXT,
      related_petition_id INTEGER REFERENCES petitions(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS consultation_time_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      max_capacity INTEGER DEFAULT 3,
      is_active INTEGER DEFAULT 1,
      note TEXT,
      UNIQUE(slot_date, slot_time)
    );
    CREATE INDEX IF NOT EXISTS idx_consult_date ON consultation_appointments(appointment_date);

    CREATE TABLE IF NOT EXISTS daily_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date TEXT NOT NULL UNIQUE,
      highlights TEXT,
      new_cases_summary TEXT,
      completed_summary TEXT,
      pending_handover TEXT,
      director_note TEXT,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `)

  // Add is_active to schedules if not exists (migration)
  try { db.exec("ALTER TABLE schedules ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1") } catch {}
  // Add is_active to petitions if not exists
  try { db.exec("ALTER TABLE petitions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1") } catch {}
  // Add due_date, source, result_type to petitions if not exists
  try { db.exec("ALTER TABLE petitions ADD COLUMN due_date TEXT") } catch {}
  try { db.exec("ALTER TABLE petitions ADD COLUMN source TEXT") } catch {}
  try { db.exec("ALTER TABLE petitions ADD COLUMN result_type TEXT") } catch {}
  try { db.exec("ALTER TABLE petitions ADD COLUMN satisfaction_rating INTEGER") } catch {}

  // Add transfer fields to documents if not exists (F10)
  try { db.exec('ALTER TABLE documents ADD COLUMN transfer_to TEXT') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN transfer_date TEXT') } catch {}
  try { db.exec('ALTER TABLE documents ADD COLUMN transfer_note TEXT') } catch {}

  // F-N5: Petition follow-up date
  try { db.exec("ALTER TABLE petitions ADD COLUMN follow_up_date TEXT") } catch {}
  try { db.exec("ALTER TABLE petitions ADD COLUMN follow_up_note TEXT") } catch {}

  // F-N7: Petition contact phone (陳情人聯絡電話，非選民檔案)
  try { db.exec("ALTER TABLE petitions ADD COLUMN contact_phone TEXT") } catch {}

  // G-1: Google Calendar integration
  db.exec(`CREATE TABLE IF NOT EXISTS google_calendar_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    email       TEXT,
    access_token  TEXT,
    refresh_token TEXT NOT NULL,
    expiry_date   INTEGER,
    calendar_id   TEXT NOT NULL DEFAULT 'primary',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`)
  try { db.exec("ALTER TABLE schedules ADD COLUMN gcal_sync_data TEXT") } catch {}

  // F-N6: Voter interest topics
  db.exec(`CREATE TABLE IF NOT EXISTS voter_topics (
    voter_id INTEGER NOT NULL REFERENCES voters(id),
    topic TEXT NOT NULL,
    PRIMARY KEY (voter_id, topic)
  )`)

  // F-N7: Contact record type expansion
  try { db.exec("ALTER TABLE contact_records ADD COLUMN result_type TEXT") } catch {}
  try { db.exec("ALTER TABLE contact_records ADD COLUMN follow_up_date TEXT") } catch {}

  // F-N11: Voter source + referrer
  try { db.exec("ALTER TABLE voters ADD COLUMN source TEXT") } catch {}
  try { db.exec("ALTER TABLE voters ADD COLUMN referrer_id INTEGER REFERENCES voters(id)") } catch {}

  // D-2: Address standardization columns
  try { db.exec("ALTER TABLE voters ADD COLUMN addr_city TEXT") } catch {}
  try { db.exec("ALTER TABLE voters ADD COLUMN addr_district TEXT") } catch {}
  try { db.exec("ALTER TABLE voters ADD COLUMN addr_village TEXT") } catch {}
  try { db.exec("ALTER TABLE voters ADD COLUMN household_key TEXT") } catch {}

  // D-2: Populate household_key from existing data
  try {
    db.exec(`UPDATE voters SET household_key = LOWER(TRIM(COALESCE(household_city,'') || COALESCE(household_district,'') || COALESCE(household_address,''))) WHERE household_key IS NULL AND (household_city IS NOT NULL OR household_address IS NOT NULL)`)
  } catch {}

  // D-6: Normalize ROC-format birth dates to ISO
  try {
    const rows = db.prepare("SELECT id, birth_date FROM voters WHERE birth_date IS NOT NULL AND birth_date != '' AND LENGTH(birth_date) <= 9").all() as any[]
    for (const row of rows) {
      const raw = String(row.birth_date).replace(/[^0-9]/g, '')
      if (raw.length === 7) {
        const rocYear = parseInt(raw.substring(0, 3))
        const month = raw.substring(3, 5)
        const day = raw.substring(5, 7)
        const adYear = rocYear + 1911
        db.prepare("UPDATE voters SET birth_date=? WHERE id=?").run(`${adYear}-${month}-${day}`, row.id)
      }
    }
  } catch {}

  // D-3: Settings seed for stats_exclude_inactive
  try { db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('stats_exclude_inactive','true')").run() } catch {}

  // Settings description column
  try { db.exec("ALTER TABLE settings ADD COLUMN description TEXT") } catch(e: any) { if (!e.message.includes('duplicate column')) throw e }

  // F-5: Do-not-contact blacklist flag
  try { db.exec("ALTER TABLE voters ADD COLUMN is_blacklisted INTEGER DEFAULT 0") } catch(e: any) { if (!e.message.includes('duplicate column')) throw e }

  // F-6: Election year mode setting
  try { db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES('election_year_mode','0','選舉年模式：開啟後強調選民經營指標')").run() } catch {}

  // W-10: linked_survey_id on events
  try { db.exec("ALTER TABLE events ADD COLUMN linked_survey_id INTEGER REFERENCES surveys(id)") } catch(e: any) { if (!e.message.includes('duplicate column')) throw e }

  // D-13: Voter activity score history
  db.exec(`CREATE TABLE IF NOT EXISTS voter_activity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voter_id INTEGER NOT NULL,
    activity_score INTEGER DEFAULT 0,
    snapshot_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(voter_id) REFERENCES voters(id)
  )`)

  // A-1: voter_merge_history table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS voter_merge_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_voter_id INTEGER NOT NULL,
      new_voter_id INTEGER NOT NULL,
      merged_by INTEGER,
      merged_at TEXT DEFAULT (datetime('now','localtime')),
      affected_records TEXT,
      FOREIGN KEY(merged_by) REFERENCES users(id)
    )`)
  } catch {}

  // A-2: Active DB Views
  try { db.exec('DROP VIEW IF EXISTS active_voters') } catch {}
  try { db.exec('CREATE VIEW active_voters AS SELECT * FROM voters WHERE is_active = 1') } catch {}
  try { db.exec('DROP VIEW IF EXISTS open_petitions') } catch {}
  try { db.exec("CREATE VIEW open_petitions AS SELECT * FROM petitions WHERE status NOT IN ('closed','cancelled')") } catch {}
  try { db.exec('DROP VIEW IF EXISTS active_tasks') } catch {}
  try { db.exec("CREATE VIEW active_tasks AS SELECT * FROM tasks WHERE status NOT IN ('done','cancelled')") } catch {}

  // D-1: Audit log and voter indexes
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_user_date ON audit_logs(user_id, created_at)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_household ON voters(household_key)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_mobile ON voters(mobile)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voter_engagement_support ON voter_engagement(support_level, is_key_supporter)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_assignee ON petitions(assignee_id, status)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_date ON petitions(petition_date)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_contact_records_voter ON contact_records(voter_id, contact_date)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_survey_responses_voter ON survey_responses(voter_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules(schedule_type)') } catch {}

  // B-1: Index for birthday lookups (month-day portion)
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_voters_birth_date ON voters(birth_date) WHERE birth_date IS NOT NULL") } catch {}

  // F-2: Archive audit logs table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS archive_audit_logs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      action TEXT,
      module TEXT,
      target_type TEXT,
      target_id INTEGER,
      target_name TEXT,
      detail TEXT,
      ip TEXT,
      created_at TEXT
    )`)
  } catch {}

  // F-3: Client errors table
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS client_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT,
      source TEXT,
      stack TEXT,
      user_agent TEXT,
      user_id INTEGER,
      url TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`)
  } catch {}

  // D-2: Insert schema version record
  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('4.1.0', 'v4.0 audit optimizations: merge history, views, indexes')
  } catch {}

  seedDefaultData()
}

async function seedDefaultData() {
  const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any
  if (!adminExists.count) {
    const hashed = await bcrypt.hash('admin123', 12)
    db.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'admin')").run('admin', hashed, '系統管理員')
    console.log('✅ 預設管理員帳號：admin / admin123（請盡速修改密碼）')
  }

  const catExists = db.prepare("SELECT COUNT(*) as count FROM categories").get() as any
  if (!catExists.count) {
    const ins = db.prepare("INSERT INTO categories (type, parent_id, name, sort_order) VALUES (?, ?, ?, ?)")
    db.exec('BEGIN')
    try {
      for (const [i, n] of ['市政建設', '社會福利', '教育文化', '環境衛生', '交通運輸', '都市計畫', '法律諮詢', '就業服務', '其他'].entries())
        ins.run('petition_category', null, n, i + 1)
      for (const [i, n] of ['樁腳', '志工', '捐款者', '支持者', '意見領袖'].entries())
        ins.run('voter_tag', null, n, i + 1)
      for (const [i, n] of ['宗教團體', '社區發展協會', '工會', '商會', '同鄉會', '校友會', '慈善團體', '其他'].entries())
        ins.run('group_category', null, n, i + 1)
      for (const [i, n] of ['一般事項', '陳情轉介', '活動邀請', '行政聯繫', '其他'].entries())
        ins.run('doc_category', null, n, i + 1)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
  }

  const settingsExist = db.prepare("SELECT COUNT(*) as count FROM settings").get() as any
  if (!settingsExist.count) {
    const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
    db.exec('BEGIN')
    try {
      for (const [k, v] of [
        ['office_name', '服務處'], ['network_mode', 'local'], ['port', '8080'],
        ['idle_timeout', '30'], ['login_lock_attempts', '5'], ['login_lock_minutes', '15'],
        ['backup_path', './backups'], ['first_run', 'true'],
        ['auto_backup_enabled', '0'], ['auto_backup_interval', 'daily'],
        ['last_auto_backup', ''],
      ]) ins.run(k, v)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
  }
}

if (require.main === module && !process.versions.electron) {
  runMigrations()
  console.log('✅ 資料庫初始化完成')
  process.exit(0)
}
