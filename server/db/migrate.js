"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const index_1 = require("./index");
const bcrypt_1 = __importDefault(require("bcrypt"));
function runMigrations() {
    index_1.db.exec(`
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
  `);
    seedDefaultData();
}
async function seedDefaultData() {
    const adminExists = index_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
    if (!adminExists.count) {
        const hashed = await bcrypt_1.default.hash('admin123', 12);
        index_1.db.prepare("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, 'admin')").run('admin', hashed, '系統管理員');
        console.log('✅ 預設管理員帳號：admin / admin123（請盡速修改密碼）');
    }
    const catExists = index_1.db.prepare("SELECT COUNT(*) as count FROM categories").get();
    if (!catExists.count) {
        const ins = index_1.db.prepare("INSERT INTO categories (type, parent_id, name, sort_order) VALUES (?, ?, ?, ?)");
        index_1.db.exec('BEGIN');
        try {
            for (const [i, n] of ['市政建設', '社會福利', '教育文化', '環境衛生', '交通運輸', '都市計畫', '法律諮詢', '就業服務', '其他'].entries())
                ins.run('petition_category', null, n, i + 1);
            for (const [i, n] of ['樁腳', '志工', '捐款者', '支持者', '意見領袖'].entries())
                ins.run('voter_tag', null, n, i + 1);
            for (const [i, n] of ['宗教團體', '社區發展協會', '工會', '商會', '同鄉會', '校友會', '慈善團體', '其他'].entries())
                ins.run('group_category', null, n, i + 1);
            for (const [i, n] of ['一般事項', '陳情轉介', '活動邀請', '行政聯繫', '其他'].entries())
                ins.run('doc_category', null, n, i + 1);
            index_1.db.exec('COMMIT');
        }
        catch (e) {
            index_1.db.exec('ROLLBACK');
            throw e;
        }
    }
    const settingsExist = index_1.db.prepare("SELECT COUNT(*) as count FROM settings").get();
    if (!settingsExist.count) {
        const ins = index_1.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
        index_1.db.exec('BEGIN');
        try {
            for (const [k, v] of [
                ['office_name', '服務處'], ['network_mode', 'local'], ['port', '8080'],
                ['idle_timeout', '30'], ['login_lock_attempts', '5'], ['login_lock_minutes', '15'],
                ['backup_path', './backups'], ['first_run', 'true'],
                ['auto_backup_enabled', '0'], ['auto_backup_interval', 'daily'],
                ['last_auto_backup', ''],
            ])
                ins.run(k, v);
            index_1.db.exec('COMMIT');
        }
        catch (e) {
            index_1.db.exec('ROLLBACK');
            throw e;
        }
    }
}
if (require.main === module) {
    runMigrations();
    console.log('✅ 資料庫初始化完成');
    process.exit(0);
}
