import { db } from './index'
import bcrypt from 'bcrypt'
import { migrateSecretsAtRest } from '../utils/secrets'

export async function runMigrations() {
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
    CREATE INDEX IF NOT EXISTS idx_voters_city_district ON voters(household_city, household_district);
    CREATE INDEX IF NOT EXISTS idx_voters_city_district_village ON voters(household_city, household_district, household_village);
    CREATE INDEX IF NOT EXISTS idx_voter_tags_tag ON voter_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_voter_tags_voter ON voter_tags(voter_id);
    CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status);
    CREATE INDEX IF NOT EXISTS idx_petitions_status_created ON petitions(status, created_at);
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
  // 複合索引：縣市/區篩選 + 陳情 status+created_at 排序優化
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_city_district ON voters(household_city, household_district)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_city_district_village ON voters(household_city, household_district, household_village)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_status_created ON petitions(status, created_at)') } catch {}

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

  // E-1: 禮儀 / 廠商 / 收支模組
  db.exec(`CREATE TABLE IF NOT EXISTS gift_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    unit        TEXT DEFAULT '份',
    default_price INTEGER DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER DEFAULT 0
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS vendors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category        TEXT DEFAULT 'other',
    contact_person  TEXT,
    phone           TEXT,
    line_id         TEXT,
    address         TEXT,
    bank_account    TEXT,
    note            TEXT,
    rating          INTEGER DEFAULT 0,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS ceremony_records (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id       INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
    voter_id          INTEGER REFERENCES voters(id) ON DELETE SET NULL,
    ceremony_type     TEXT NOT NULL DEFAULT 'other',
    recipient_name    TEXT NOT NULL,
    recipient_relation TEXT,
    event_date        TEXT,
    event_location    TEXT,
    is_joint          INTEGER DEFAULT 0,
    joint_note        TEXT,
    status            TEXT NOT NULL DEFAULT 'planned',
    total_amount      INTEGER DEFAULT 0,
    note              TEXT,
    created_by        INTEGER REFERENCES users(id),
    created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS ceremony_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ceremony_id     INTEGER NOT NULL REFERENCES ceremony_records(id) ON DELETE CASCADE,
    category_id     INTEGER REFERENCES gift_categories(id) ON DELETE SET NULL,
    item_name       TEXT NOT NULL,
    vendor_id       INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
    quantity        INTEGER DEFAULT 1,
    unit_price      INTEGER DEFAULT 0,
    amount          INTEGER DEFAULT 0,
    payment_method  TEXT DEFAULT 'cash',
    payment_status  TEXT DEFAULT 'pending',
    receipt_no      TEXT,
    note            TEXT
  )`)

  db.exec(`CREATE TABLE IF NOT EXISTS expense_budgets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    year            INTEGER NOT NULL,
    month           INTEGER,
    budget_type     TEXT DEFAULT 'total',
    reference_id    TEXT,
    amount          INTEGER NOT NULL DEFAULT 0,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`)

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_schedule ON ceremony_records(schedule_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_voter ON ceremony_records(voter_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_date ON ceremony_records(event_date)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_type ON ceremony_records(ceremony_type)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_items_ceremony ON ceremony_items(ceremony_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_ceremony_items_vendor ON ceremony_items(vendor_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active)') } catch {}

  // E-2: 公祭特殊行程資訊欄位
  try { db.exec("ALTER TABLE schedules ADD COLUMN funeral_info TEXT") } catch {}
  // E-3: 選民頭銜、團體成員頭銜
  try { db.exec("ALTER TABLE voters ADD COLUMN title TEXT") } catch {}
  try { db.exec("ALTER TABLE group_members ADD COLUMN title TEXT") } catch {}

  // E-4: categories 擴充欄位（行程類型用）
  try { db.exec("ALTER TABLE categories ADD COLUMN code TEXT") } catch {}
  try { db.exec("ALTER TABLE categories ADD COLUMN color TEXT") } catch {}
  try { db.exec("ALTER TABLE categories ADD COLUMN is_protected INTEGER DEFAULT 0") } catch {}

  // E-4: 預設行程類型 seed
  try {
    const existing = db.prepare("SELECT COUNT(*) as c FROM categories WHERE type='schedule_type'").get() as any
    if (!existing.c) {
      const ins = db.prepare("INSERT INTO categories (type,code,name,color,sort_order,is_protected) VALUES (?,?,?,?,?,?)")
      db.exec('BEGIN')
      try {
        for (const [i, [code, name, color, prot]] of [
          ['meeting',        '會議',   '#007AFF', 0],
          ['visit',          '拜訪',   '#52c41a',  0],
          ['inspection',     '會勘',   '#fa8c16',  0],
          ['event',          '活動',   '#722ed1',  0],
          ['dinner',         '餐敘',   '#13c2c2',  0],
          ['service',        '選民服務', '#36cfc9', 0],
          ['consultation',   '法律諮詢','#fa541c',  0],
          ['wedding',        '婚禮',   '#f759ab',  0],
          ['public_memorial','公祭',   '#4a1942',  1],
          ['other',          '其他',   '#8c8c8c',  0],
        ].entries()) ins.run('schedule_type', code, name, color, i + 1, prot)
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK') }
    }
  } catch {}

  // E-1: Seed default gift categories
  try {
    const existing = db.prepare("SELECT COUNT(*) as c FROM gift_categories").get() as any
    if (!existing.c) {
      const ins = db.prepare("INSERT INTO gift_categories (name, unit, default_price, sort_order) VALUES (?,?,?,?)")
      db.exec('BEGIN')
      try {
        for (const [i, [n, u, p]] of [
          ['現金紅包', '包', 2000],
          ['奠儀', '包', 2000],
          ['喜儀', '包', 2000],
          ['花籃', '個', 1200],
          ['花圈', '個', 1500],
          ['禮盒', '份', 800],
          ['餐盒', '份', 150],
          ['贈品', '份', 500],
        ].entries()) ins.run(n, u, p, i + 1)
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK') }
    }
  } catch {}

  // Security: voters.mobile UNIQUE index（防止競態條件產生重複選民）
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_voters_mobile_unique ON voters(mobile) WHERE mobile IS NOT NULL AND mobile != \'\'') } catch {}

  // group_members.title 欄位（供群組成員頭銜使用）
  try { db.exec("ALTER TABLE group_members ADD COLUMN title TEXT") } catch {}

  // Performance: 複合索引優化
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_active_status ON petitions(is_active, status, created_at)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_contact_records_voter_date ON contact_records(voter_id, contact_date DESC)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_desc ON audit_logs(created_at DESC)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_schedules_active_start ON schedules(is_active, start_time)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_schedules_overlap ON schedules(is_active, status, start_time, end_time)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_consultation_slot_capacity ON consultation_appointments(appointment_date, time_slot, status)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_active_date ON petitions(is_active, petition_date, created_at)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_content ON petitions(content)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_contact_records_created ON contact_records(created_at DESC)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voter_tags_voter ON voter_tags(voter_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voter_relations_voter ON voter_relations(voter_id)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status)') } catch {}

  // Performance v2: 補強查詢/JOIN 索引（audit 2026-04）
  // petitions: follow-up / due-date / closed-at 經常被 WHERE / ORDER 使用
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_follow_up_date ON petitions(follow_up_date) WHERE follow_up_date IS NOT NULL') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_due_date ON petitions(due_date) WHERE due_date IS NOT NULL') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_closed_at ON petitions(closed_at) WHERE closed_at IS NOT NULL') } catch {}
  // petitions: voter_id + is_active 加速合併預覽 / 熱區報表 JOIN
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_voter_active ON petitions(voter_id, is_active)') } catch {}
  // petitions: case_number 用於 generateCaseNumber MAX 掃描，現為全表掃
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_petitions_case_number ON petitions(case_number)') } catch {}
  // documents: doc_type + doc_number 用於 generateDocNumber MAX 掃描
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_documents_doc_type_number ON documents(doc_type, doc_number)') } catch {}
  // voters: id_number 用於登入查重 / 匯入 / data-quality 重複偵測
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_id_number ON voters(id_number) WHERE id_number IS NOT NULL') } catch {}
  // voters: referrer_id 用於 D-14 介紹人迴圈檢查與 key-influencer 報表 JOIN
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voters_referrer ON voters(referrer_id) WHERE referrer_id IS NOT NULL') } catch {}
  // users: username 已是 UNIQUE 欄位（CREATE TABLE 時 SQLite 自動建立 unique
  // index），登入查詢 SELECT * FROM users WHERE username=? 直接走那個索引；
  // 額外建一個 non-unique idx_users_username 只會在每次寫入多維護一棵 b-tree
  // 卻不會被 query planner 採用，所以省略。
  // tasks: related_voter_id 在合併與選民詳情頁被頻繁 JOIN/UPDATE
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_related_voter ON tasks(related_voter_id)') } catch {}
  // tasks: due_date + status 用於 /api/tasks/today 掃描
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_date, status)') } catch {}
  // proposals: is_active + proposal_date DESC + id DESC 用於分頁列表 ORDER
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_proposals_active_date ON proposals(is_active, proposal_date DESC, id DESC)') } catch {}
  // consultation_appointments: voter_id 用於合併與匿名化清理
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_consultation_voter ON consultation_appointments(voter_id)') } catch {}
  // voter_relations: related_voter_id 用於合併雙向 redirect 與匿名化清理
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_voter_relations_related ON voter_relations(related_voter_id)') } catch {}
  // notification_recipients: voter_id 用於合併 redirect
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notif_recipients_voter ON notification_recipients(voter_id)') } catch {}
  // archive_audit_logs / client_errors: 資料保留作業按 created_at 範圍掃描
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_archive_audit_created ON archive_audit_logs(created_at)') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at)') } catch {}
  // notifications: sent_at 用於 reach-rate 報表 /reports/notification-reach
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at) WHERE sent_at IS NOT NULL') } catch {}
  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.5.0', 'Performance: 查詢/JOIN 索引補強（陳情 follow_up/due/closed/case、文件序號、選民身分證/介紹人、任務關聯選民、提案分頁等）')
  } catch {}

  // D-2: Insert schema version record
  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('4.1.0', 'v4.0 audit optimizations: merge history, views, indexes')
  } catch {}
  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.0.0', 'E-1: 禮儀 / 廠商 / 收支模組')
  } catch {}
  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.1.0', 'Security: mobile unique index, group_members.title, compound indexes')
  } catch {}

  // P-1: 提案追蹤模組
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS proposals (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      session             TEXT,
      meeting             TEXT,
      proposal_number     TEXT,
      proposal_date       TEXT,
      title               TEXT NOT NULL,
      category            TEXT,
      proposal_type       TEXT DEFAULT '議員提案',
      proposer            TEXT,
      co_signers          TEXT,
      content             TEXT,
      status              TEXT NOT NULL DEFAULT 'pending',
      result              TEXT,
      track_note          TEXT,
      source_url          TEXT,
      related_petition_ids TEXT DEFAULT '[]',
      created_by          INTEGER REFERENCES users(id),
      created_at          TEXT DEFAULT (datetime('now','localtime')),
      updated_at          TEXT DEFAULT (datetime('now','localtime')),
      is_active           INTEGER NOT NULL DEFAULT 1
    )`)
    db.exec('CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, created_at)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_proposals_date ON proposals(proposal_date)')
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.2.0', 'P-1: 提案追蹤模組')
  } catch(e: any) { if (!e.message?.includes('already exists')) console.error('proposals migration:', e.message) }

  // AI-1: AI 設定
  try {
    db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES(?,?,?)").run('ai_provider', 'none', 'AI 供應商：none / anthropic / openai / ollama')
    db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES(?,?,?)").run('ai_model', '', 'AI 模型名稱')
    db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES(?,?,?)").run('ai_api_key', '', 'AI API 金鑰（Anthropic 或 OpenAI）')
    db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES(?,?,?)").run('ai_base_url', 'http://localhost:11434', 'Ollama 本地端點（預設 http://localhost:11434）')
    db.prepare("INSERT OR IGNORE INTO settings(key,value,description) VALUES(?,?,?)").run('ai_max_tokens', '1024', 'AI 最大回覆 Token 數')
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.3.0', 'AI-1: AI 設定')
  } catch(e: any) { if (!e.message?.includes('already exists') && !e.message?.includes('UNIQUE')) console.error('AI migration:', e.message) }

  try {
    migrateSecretsAtRest(db)
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.4.0', 'Encrypt secrets at rest')
  } catch (e: any) {
    console.error('secret encryption migration:', e.message)
  }

  // Security M-1: JWT 撤銷清單（登出後使 token 立即失效）
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti         TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      revoked_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      expires_at  TEXT NOT NULL
    )`)
    db.exec('CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at)')
  } catch (e: any) {
    if (!e.message?.includes('already exists')) console.error('revoked_tokens migration:', e.message)
  }

  // Security M-2: 登入失敗鎖定持久化（避免重啟即解鎖）
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
      username      TEXT PRIMARY KEY,
      count         INTEGER NOT NULL DEFAULT 0,
      locked_until  TEXT
    )`)
  } catch (e: any) {
    if (!e.message?.includes('already exists')) console.error('login_attempts migration:', e.message)
  }

  try {
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,description) VALUES(?,?)").run('5.6.0', 'Security: JWT 撤銷清單 + 登入失敗鎖定持久化（M-1 / M-2）')
  } catch {}

  await seedDefaultData()
}

async function seedDefaultData() {
  const defaultBackupPath = process.env.BACKUPS_PATH || './backups'

  const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any
  if (!adminExists.count) {
    const hashed = await bcrypt.hash('admin123', 12)
    db.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'admin')").run('admin', hashed, '系統管理員')
    if (process.env.NODE_ENV !== 'test') {
      console.log('✅ 預設管理員帳號：admin / admin123（請盡速修改密碼）')
    }
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

  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
  db.exec('BEGIN')
  try {
    for (const [k, v] of [
      ['office_name', '服務處'], ['network_mode', 'local'], ['port', '8080'],
      ['idle_timeout', '30'], ['login_lock_attempts', '5'], ['login_lock_minutes', '15'],
      ['backup_path', defaultBackupPath], ['first_run', 'true'],
      ['auto_backup_enabled', '0'], ['auto_backup_interval', 'daily'],
      ['data_retention_enabled', '0'],
      ['retention_audit_archive_days', '90'],
      ['retention_client_error_days', '90'],
      ['retention_soft_deleted_voter_days', '365'],
      ['last_auto_backup', ''],
    ]) ins.run(k, v)
    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
}

if (require.main === module && !process.versions.electron) {
  runMigrations()
    .then(() => {
      console.log('✅ 資料庫初始化完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('資料庫初始化失敗：', error)
      process.exit(1)
    })
}
