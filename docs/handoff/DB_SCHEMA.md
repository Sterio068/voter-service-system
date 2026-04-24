# 資料庫 Schema 完整參考

**資料庫**：SQLite 3 (better-sqlite3 12.x)
**檔名**：`voter.db`（使用者資料目錄下）
**配置**：WAL、foreign_keys=ON、synchronous=NORMAL

共 41 張表。本檔列出每張表的欄位、關係、特殊規則。

---

## 1. 使用者與權限

### `users`
```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,           -- bcrypt hash (cost=12)
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'assistant',  -- admin/supervisor/assistant/volunteer
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
)
```
- 預設管理員：`admin` / `admin123`（首次啟動自動建立）
- role 決定權限範圍（見 HANDOFF.md §7）

### `settings`
```sql
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
)
```
- 系統 KV 設定表
- 關鍵 keys：`office_name`, `idle_timeout`, `first_run`, `jwt_secret`, `backup_path`, `gcal_client_id`, `gcal_client_secret`, `line_channel_access_token`, `line_channel_secret`, `ai_provider`, `ai_api_key`, `machine_fingerprint`, `data_retention_enabled`, `retention_audit_archive_days`, `retention_client_error_days`, `retention_soft_deleted_voter_days`
- 敏感 keys 以 `enc:v1:` 格式加密儲存：`ai_api_key`, `gcal_client_secret`, `jwt_secret`, `line_channel_access_token`, `line_channel_secret`

---

## 2. 選民核心

### `voters`
```sql
CREATE TABLE voters (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  gender              TEXT,          -- 男/女/其他
  birth_date          TEXT,          -- YYYY-MM-DD
  id_number           TEXT,          -- 身分證，加密/明文依設定
  mobile              TEXT,          -- 09xxxxxxxx
  phone               TEXT,
  line_id             TEXT,
  email               TEXT,
  household_city      TEXT,          -- 戶籍縣市
  household_district  TEXT,          -- 戶籍鄉鎮區
  household_village   TEXT,          -- 戶籍里
  household_address   TEXT,          -- 戶籍地址
  mailing_address     TEXT,          -- 通訊地址
  occupation          TEXT,
  company             TEXT,
  job_title           TEXT,
  election_area       TEXT,
  tags                TEXT,          -- 舊 schema 用 JSON array，新 schema 用 voter_tags 表
  note                TEXT,
  is_active           INTEGER DEFAULT 1,  -- 軟刪除
  is_blacklisted      INTEGER DEFAULT 0,
  merged_into         INTEGER,       -- 被合併到哪個選民
  source              TEXT,          -- 來源（活動/介紹/LINE）
  referrer_id         INTEGER,       -- 介紹人
  addr_city           TEXT,          -- 新 schema 通訊地址拆解
  addr_district       TEXT,
  addr_village        TEXT,
  household_key       TEXT,          -- 戶籍代號
  title               TEXT,          -- 稱謂
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT DEFAULT (datetime('now','localtime')),
  updated_at          TEXT DEFAULT (datetime('now','localtime'))
)
```

**狀態組合**：
- `is_active=1, is_blacklisted=0, merged_into=NULL` → 正常
- `is_active=1, is_blacklisted=1, merged_into=NULL` → 黑名單（可查但標記）
- `is_active=0, is_blacklisted=0, merged_into=NULL` → 軟刪除
- `is_active=0, is_blacklisted=0, merged_into=N` → 被合併

**索引**：
- `idx_voters_city_district`, `idx_voters_city_district_village`
- `idx_voters_birth_date`（生日查詢用）

### `voter_tags`
```sql
CREATE TABLE voter_tags (
  voter_id  INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  tag       TEXT,
  PRIMARY KEY (voter_id, tag)
)
```
- 選民可有多個標籤
- 常見 tag：樁腳、志工、支持者、捐款者、意見領袖、LINE:xxx

### `voter_engagement`
```sql
CREATE TABLE voter_engagement (
  voter_id           INTEGER PRIMARY KEY REFERENCES voters(id) ON DELETE CASCADE,
  support_level      INTEGER DEFAULT 0,      -- 0~5 支持度
  is_key_supporter   INTEGER DEFAULT 0,
  is_volunteer       INTEGER DEFAULT 0,
  notes              TEXT,
  updated_at         TEXT DEFAULT (datetime('now','localtime'))
)
```

### `voter_topics`
```sql
CREATE TABLE voter_topics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id  INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  topic     TEXT,
  note      TEXT
)
```
- 選民關注議題

### `voter_relations`
```sql
CREATE TABLE voter_relations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id          INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  related_voter_id  INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  relation_type     TEXT,  -- 配偶/父母/子女/兄弟姊妹/親戚/鄰居/同事/朋友/樁腳/里長/其他
  note              TEXT
)
```

### `voter_activity_history`
```sql
CREATE TABLE voter_activity_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id      INTEGER REFERENCES voters(id),
  activity_type TEXT,      -- contact / petition / event / survey
  activity_date TEXT,
  description   TEXT,
  score         INTEGER
)
```

### `voter_merge_history`
```sql
CREATE TABLE voter_merge_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  old_voter_id     INTEGER,
  new_voter_id     INTEGER,
  merged_by        INTEGER REFERENCES users(id),
  merged_at        TEXT DEFAULT (datetime('now','localtime')),
  affected_records TEXT   -- JSON: {petitions, contacts, ...}
)
```
- 合併操作的審計記錄

---

## 3. 陳情

### `petitions`
```sql
CREATE TABLE petitions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number     TEXT UNIQUE NOT NULL,    -- 2026-00001
  petition_date   TEXT NOT NULL,
  voter_id        INTEGER REFERENCES voters(id),
  contact_phone   TEXT,
  channel         TEXT,                     -- 電話/現場/LINE/Email/轉介
  category        TEXT,
  subcategory     TEXT,
  content         TEXT NOT NULL,
  area_city       TEXT,
  area_district   TEXT,
  area_village    TEXT,
  area_address    TEXT,
  urgency         TEXT DEFAULT 'normal',   -- normal/urgent/critical
  status          TEXT DEFAULT 'pending',  -- pending/processing/waiting_external/waiting_applicant/replied/closed/cancelled
  assignee_id     INTEGER REFERENCES users(id),
  due_date        TEXT,
  closed_at       TEXT,
  satisfaction    INTEGER,                  -- 1~5
  is_active       INTEGER DEFAULT 1,
  source          TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
)
```

**索引**：
- `idx_petitions_status_created`
- `idx_petitions_active_status` (is_active, status, created_at)
- `idx_petitions_active_date` (is_active, petition_date, created_at)
- `idx_petitions_content` (content)

**SLA 顏色**（前端）：
- < 3 天：綠
- 3~7 天：黃
- 7~14 天：橘
- > 14 天：紅

### `petition_logs`
```sql
CREATE TABLE petition_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  petition_id     INTEGER REFERENCES petitions(id) ON DELETE CASCADE,
  action_type     TEXT,   -- 受理/轉介/回覆/結案/追蹤/重新分派/備註/補充/電話聯絡/親訪
  content         TEXT,
  referred_to     TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now','localtime'))
)
```

---

## 4. 聯絡紀錄

### `contact_records`
```sql
CREATE TABLE contact_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id        INTEGER REFERENCES voters(id),
  contact_date    TEXT NOT NULL,
  contact_type    TEXT,   -- 電話/面訪/LINE/Email/通知
  content         TEXT,
  result_type     TEXT,   -- no_answer/contacted/pending_reply/unreachable/completed
  follow_up_date  TEXT,
  petition_id     INTEGER REFERENCES petitions(id),
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT DEFAULT (datetime('now','localtime'))
)
```

**索引**：
- `idx_contact_records_voter_id`
- `idx_contact_records_voter_date` (voter_id, contact_date DESC)
- `idx_contact_records_created`

---

## 5. 團體

### `groups`
```sql
CREATE TABLE groups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT,
  leader_id     INTEGER REFERENCES voters(id),
  contact_id    INTEGER REFERENCES voters(id),
  phone         TEXT,
  address       TEXT,
  member_count  INTEGER,
  note          TEXT,
  is_active     INTEGER DEFAULT 1,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT,
  updated_at    TEXT
)
```

### `group_members`
```sql
CREATE TABLE group_members (
  group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  voter_id   INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  role       TEXT,
  joined_at  TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (group_id, voter_id)
)
```

---

## 6. 行程 / 諮詢 / 禮儀

### `schedules`
```sql
CREATE TABLE schedules (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT NOT NULL,
  start_time            TEXT NOT NULL,
  end_time              TEXT,
  schedule_type         TEXT,                    -- meeting/consultation/ceremony/public_memorial/...
  location              TEXT,
  attendees             TEXT,
  related_voter_ids     TEXT,                    -- JSON array
  related_group_ids     TEXT,                    -- JSON array
  related_petition_id   INTEGER REFERENCES petitions(id),
  note                  TEXT,
  is_recurring          INTEGER DEFAULT 0,
  recurrence_rule       TEXT,                    -- RRULE string
  status                TEXT DEFAULT 'confirmed',-- confirmed/tentative/cancelled
  reminder_minutes      INTEGER,
  funeral_info          TEXT,                    -- JSON: public_memorial 用
  gcal_event_id         TEXT,
  gcal_account_id       INTEGER REFERENCES google_calendar_accounts(id),
  gcal_sync_data        TEXT,
  is_active             INTEGER DEFAULT 1,
  created_by            INTEGER REFERENCES users(id),
  created_at            TEXT,
  updated_at            TEXT
)
```

**索引**：
- `idx_schedules_active_start` (is_active, start_time)
- `idx_schedules_overlap` (is_active, status, start_time, end_time)

### `consultation_time_slots`
```sql
CREATE TABLE consultation_time_slots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_date     TEXT NOT NULL,
  slot_time     TEXT NOT NULL,
  max_capacity  INTEGER DEFAULT 3,
  note          TEXT,
  is_active     INTEGER DEFAULT 1,
  UNIQUE(slot_date, slot_time)
)
```

### `consultation_appointments`
```sql
CREATE TABLE consultation_appointments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  voter_id            INTEGER REFERENCES voters(id),
  voter_name          TEXT NOT NULL,
  voter_phone         TEXT,
  appointment_date    TEXT NOT NULL,
  time_slot           TEXT NOT NULL,
  issue_summary       TEXT,
  status              TEXT DEFAULT 'pending',    -- pending/confirmed/completed/cancelled
  attorney_note       TEXT,
  related_petition_id INTEGER REFERENCES petitions(id),
  created_by          INTEGER,
  created_at          TEXT
)
```
- **額滿檢查**：`COUNT(*) < max_capacity`（用 IMMEDIATE transaction 保護）
- **索引**：`idx_consultation_slot_capacity` (appointment_date, time_slot, status)

### `ceremony_records`
```sql
CREATE TABLE ceremony_records (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id           INTEGER REFERENCES schedules(id),
  voter_id              INTEGER REFERENCES voters(id),
  ceremony_type         TEXT,    -- birthday/wedding/funeral/visit/other
  recipient_name        TEXT NOT NULL,
  recipient_relation    TEXT,
  event_date            TEXT,
  event_location        TEXT,
  is_joint              INTEGER DEFAULT 0,
  joint_note            TEXT,
  status                TEXT DEFAULT 'planned',  -- planned/executed/cancelled
  total_amount          INTEGER,
  note                  TEXT,
  created_by            INTEGER,
  created_at            TEXT,
  updated_at            TEXT
)
```

### `ceremony_items`
```sql
CREATE TABLE ceremony_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ceremony_id     INTEGER REFERENCES ceremony_records(id) ON DELETE CASCADE,
  category_id     INTEGER REFERENCES gift_categories(id),
  item_name       TEXT,
  vendor_id       INTEGER REFERENCES vendors(id),
  quantity        INTEGER DEFAULT 1,
  unit_price      INTEGER DEFAULT 0,
  amount          INTEGER,
  payment_method  TEXT DEFAULT 'cash',
  payment_status  TEXT DEFAULT 'pending',   -- pending/paid
  receipt_no      TEXT,
  note            TEXT
)
```

### `gift_categories`
```sql
CREATE TABLE gift_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  unit          TEXT DEFAULT '份',
  default_price INTEGER DEFAULT 0,
  sort_order    INTEGER,
  is_active     INTEGER DEFAULT 1
)
```

### `vendors`
```sql
CREATE TABLE vendors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  category        TEXT,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  note            TEXT,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT,
  updated_at      TEXT
)
```

### `expense_budgets`
```sql
CREATE TABLE expense_budgets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_type TEXT,        -- total/category
  year        INTEGER,
  month       INTEGER,
  category    TEXT,
  amount      INTEGER,
  note        TEXT,
  created_at  TEXT
)
```

---

## 7. 待辦 / 公文 / 活動 / 問卷

### `tasks`
```sql
CREATE TABLE tasks (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT NOT NULL,
  description           TEXT,
  priority              TEXT DEFAULT 'medium', -- low/medium/high
  status                TEXT DEFAULT 'todo',   -- todo/doing/done/cancelled
  due_date              TEXT,
  assignee_id           INTEGER REFERENCES users(id),
  related_voter_id      INTEGER REFERENCES voters(id),
  related_petition_id   INTEGER REFERENCES petitions(id),
  is_today_focus        INTEGER DEFAULT 0,
  created_by            INTEGER REFERENCES users(id),
  created_at            TEXT,
  updated_at            TEXT
)
```
索引：`idx_tasks_assignee_status`

### `documents`
```sql
CREATE TABLE documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_number      TEXT UNIQUE NOT NULL,
  doc_type        TEXT,          -- incoming(收文)/outgoing(發文)
  doc_date        TEXT,
  subject         TEXT NOT NULL,
  category        TEXT,
  org_name        TEXT,          -- 來文/受文機關
  org_doc_number  TEXT,          -- 來文字號
  org_doc_date    TEXT,
  content         TEXT,
  deadline        TEXT,
  assignee_id     INTEGER REFERENCES users(id),
  voter_id        INTEGER REFERENCES voters(id),
  related_petition_id INTEGER REFERENCES petitions(id),
  status          TEXT DEFAULT 'pending',  -- pending/processing/replied/archived
  transfer_to     TEXT,
  transfer_date   TEXT,
  transfer_note   TEXT,
  is_active       INTEGER DEFAULT 1,
  created_by      INTEGER,
  created_at      TEXT,
  updated_at      TEXT
)
```

### `events`
```sql
CREATE TABLE events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  event_date        TEXT,
  location          TEXT,
  description       TEXT,
  linked_survey_id  INTEGER REFERENCES surveys(id),
  status            TEXT DEFAULT 'planned', -- planned/completed/cancelled
  is_active         INTEGER DEFAULT 1,
  created_by        INTEGER,
  created_at        TEXT
)
```

### `event_participants`
```sql
CREATE TABLE event_participants (
  event_id       INTEGER REFERENCES events(id) ON DELETE CASCADE,
  voter_id       INTEGER REFERENCES voters(id) ON DELETE CASCADE,
  participated   INTEGER DEFAULT 0,
  note           TEXT,
  PRIMARY KEY (event_id, voter_id)
)
```

### `surveys`
```sql
CREATE TABLE surveys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'draft',   -- draft/active/closed
  start_date  TEXT,
  end_date    TEXT,
  is_active   INTEGER DEFAULT 1,
  created_by  INTEGER,
  created_at  TEXT
)
```

### `survey_questions`
```sql
CREATE TABLE survey_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id     INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT,
  question_type TEXT,   -- single_choice/multi_choice/text/scale
  options       TEXT,   -- JSON array
  is_required   INTEGER DEFAULT 0,
  sort_order    INTEGER
)
```

### `survey_responses`
```sql
CREATE TABLE survey_responses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id  INTEGER REFERENCES surveys(id) ON DELETE CASCADE,
  voter_id   INTEGER REFERENCES voters(id),
  voter_name TEXT,
  answers    TEXT,   -- JSON: { [qid]: answer }
  note       TEXT,
  created_at TEXT
)
```

---

## 8. 通知

### `notifications`
```sql
CREATE TABLE notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT,
  content        TEXT,
  channel        TEXT,              -- sms/email/line/app
  target_type    TEXT,              -- all/filter
  target_filter  TEXT,              -- JSON criteria
  status         TEXT DEFAULT 'draft',  -- draft/sent/failed
  sent_count     INTEGER DEFAULT 0,
  sent_at        TEXT,
  created_by     INTEGER,
  created_at     TEXT
)
```

### `notification_recipients`
```sql
CREATE TABLE notification_recipients (
  notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
  voter_id        INTEGER REFERENCES voters(id),
  delivered       INTEGER DEFAULT 0,
  delivered_at    TEXT,
  PRIMARY KEY (notification_id, voter_id)
)
```

---

## 9. 提案

### `proposals`
```sql
CREATE TABLE proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_number TEXT UNIQUE,
  proposal_date   TEXT,
  subject         TEXT NOT NULL,
  category        TEXT,
  proposal_type   TEXT,              -- 質詢/提案/附議/臨時動議
  session         TEXT,              -- 屆次
  meeting_name    TEXT,
  proposer        TEXT,
  co_proposers    TEXT,              -- JSON array
  status          TEXT,              -- drafted/submitted/reviewing/passed/rejected/withdrawn
  review_result   TEXT,
  source_url      TEXT,
  track_note      TEXT,
  is_active       INTEGER DEFAULT 1,
  created_by      INTEGER,
  created_at      TEXT,
  updated_at      TEXT
)
```

---

## 10. 系統 / 日誌 / 附件

### `daily_logs`
```sql
CREATE TABLE daily_logs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date           TEXT UNIQUE NOT NULL,
  highlights         TEXT,
  new_cases_summary  TEXT,
  completed_summary  TEXT,
  pending_handover   TEXT,
  director_note      TEXT,
  created_by         INTEGER,
  updated_by         INTEGER,
  updated_at         TEXT
)
```

### `attachments`
```sql
CREATE TABLE attachments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type     TEXT,      -- petition/voter/document/...
  target_id       INTEGER,
  filename        TEXT,
  original_name   TEXT,
  mime_type       TEXT,
  file_size       INTEGER,
  file_path       TEXT,
  uploaded_by     INTEGER,
  created_at      TEXT
)
```
**限制**：20MB、僅 PDF/JPEG/PNG/GIF/WebP/HEIC

### `audit_logs`
```sql
CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  action       TEXT,   -- create/update/delete/login/logout/export/import/print/query/merge/check/blacklist
  module       TEXT,   -- 選民管理/陳情管理/...
  target_type  TEXT,
  target_id    INTEGER,
  target_name  TEXT,
  before       TEXT,   -- JSON snapshot
  after        TEXT,   -- JSON snapshot
  detail       TEXT,
  ip_address   TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime'))
)
```

**索引**：`idx_audit_logs_created_desc`, `idx_audit_logs_user_created`

### `archive_audit_logs`
- 啟用資料保留政策後，`audit_logs` 超過 `retention_audit_archive_days` 會封存至此表

### `categories`（動態類別共用表）
```sql
CREATE TABLE categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,   -- voter_tag/petition_category/petition_area/document_category/group_category/schedule_type
  name          TEXT NOT NULL,
  code          TEXT,
  color         TEXT,
  sort_order    INTEGER,
  is_active     INTEGER DEFAULT 1,
  UNIQUE(type, name)
)
```

### `election_areas`
```sql
CREATE TABLE election_areas (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER
)
```

### `seq_numbers`
```sql
CREATE TABLE seq_numbers (
  name   TEXT PRIMARY KEY,   -- petition_2026, document_2026
  value  INTEGER DEFAULT 0
)
```

### `google_calendar_accounts`
```sql
CREATE TABLE google_calendar_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  label           TEXT,
  email           TEXT,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TEXT,
  calendar_id     TEXT DEFAULT 'primary',
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT
)
```
- `access_token` / `refresh_token` 以 `enc:v1:` 格式加密儲存，runtime 讀取時解密。

### `client_errors`
```sql
CREATE TABLE client_errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT,
  stack      TEXT,
  source     TEXT,
  url        TEXT,
  user_agent TEXT,
  user_id    INTEGER,
  created_at TEXT
)
```
- 啟用資料保留政策後，超過 `retention_client_error_days` 會刪除

### `schema_migrations`
```sql
CREATE TABLE schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT
)
```

---

## 11. 重要資料流關係

```
users (1) ─┬─ voters.created_by
           ├─ petitions.created_by / assignee_id
           ├─ tasks.assignee_id
           └─ audit_logs.user_id

voters (1) ─┬─ voter_tags (*)
            ├─ voter_engagement (1)
            ├─ voter_topics (*)
            ├─ voter_relations (*)  [related_voter_id 也指向 voters]
            ├─ contact_records (*)
            ├─ petitions (*)
            ├─ group_members (*)
            ├─ event_participants (*)
            ├─ survey_responses (*)
            ├─ notification_recipients (*)
            └─ ceremony_records (*)

petitions (1) ─┬─ petition_logs (*)
               ├─ contact_records (*)
               ├─ tasks (*)
               └─ documents (*)

schedules (1) ─┬─ ceremony_records (*)
               └─ consultation_appointments (間接 by date)

ceremony_records (1) ─ ceremony_items (*)
                       ceremony_items.vendor_id → vendors

groups (1) ─┬─ group_members (*)
            └─ schedules (via related_group_ids JSON)

surveys (1) ─┬─ survey_questions (*)
             ├─ survey_responses (*)
             └─ events.linked_survey_id (0..1)
```

---

## 12. 資料遷移 / migration 策略

`server/db/migrate.ts` 的模式：

1. `CREATE TABLE IF NOT EXISTS` — 首次執行建立
2. `try { db.exec("ALTER TABLE x ADD COLUMN y ...") } catch {}` — 容忍已存在
3. Migration 版本記錄在 `schema_migrations`
4. 啟動時自動跑（`server/index.ts` 開頭 import 並執行）

**新增欄位**的正確做法：
```typescript
// 1. CREATE TABLE 加上新欄位
CREATE TABLE IF NOT EXISTS voters (
  ...
  new_field TEXT,   -- 新加
  ...
)

// 2. 舊 DB 用 ALTER 補上
try { db.exec("ALTER TABLE voters ADD COLUMN new_field TEXT") } catch {}
```

---

## 13. 備份 / 還原

**備份位置**：
- macOS: `~/Library/Application Support/選民服務系統/backups/`
- Windows: `%APPDATA%/選民服務系統/backups/`
- 可在系統設定改

**自動備份**：`server/services/autoBackup.ts`，每天凌晨 3 點

**手動備份**：`POST /api/admin/backup`

**備份 metadata**：本機備份會建立同名 `.db.meta.json` sidecar，內含 SHA-256、schema version、Node version 與 HMAC-SHA256 簽章。

**還原驗證**：透過 `PRAGMA integrity_check`（v1.0.5 後修正為 `.all()` 檢查多行），並檢查必要資料表與 `schema_migrations`。

**備份目錄白名單**：可用 `VOTER_SERVICE_BACKUP_ALLOWED_ROOTS` / `BACKUP_ALLOWED_ROOTS` 限制 `POST /api/admin/backup/path` 可設定的根目錄。

---

**End of DB_SCHEMA.md**
