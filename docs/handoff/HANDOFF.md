# 選民服務系統 — 完整交接文件

**版本**：v1.0.8（2026-04-25）
**授權**：私有專案
**Repo**：https://github.com/Sterio068/voter-service-system

這份文件目標：**讓下一個 AI 或開發者能在 30 分鐘內理解整個系統架構，並在 1 小時內能開始修 bug / 加功能**。

---

## 1. 系統本質

**一句話**：台灣議員服務處本地桌面端選民／陳情／公文／禮儀管理系統。

**架構類型**：Electron 桌面應用（單一 exe/dmg 安裝檔）
- 後端：Fastify + SQLite（better-sqlite3）跑在 localhost:8080
- 前端：React 18 + Vite + Ant Design 5 跑在 file://（production）或 localhost:5173（dev）
- 資料庫：單一 .db 檔（SQLite WAL 模式）放使用者目錄

**不是 web 服務**：沒有多使用者共享伺服器，每台電腦獨立安裝、獨立資料庫。但透過 LAN IP 可讓同辦公室多人連同一後端。

**目前交付狀態補充**：
- restore-on-startup 已有 rollback 保護：pending restore 套用失敗時，系統會回復原主 DB，並保留 `*.restore.failed-*` 供排查。
- `POST /api/voters/:id/merge` 已補 `voter_activity_history`、`voter_engagement` 與 duplicate membership 處理，實務上較不容易在髒資料下 rollback。
- Electron main process 已補本機 Fastify watchdog，連續 health check 失敗時會嘗試自動重啟；server scheduler 已做 idempotent 保護。

---

## 2. 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| Shell | Electron | 41.1.1 |
| 後端 | Fastify | 5.8.4 |
| 資料庫 | better-sqlite3 | 12.8.0 |
| 驗證 | JWT (jsonwebtoken) + bcrypt | - |
| API 驗證 | Zod | 4.3.6 |
| 前端 | React | 18.2.0 |
| 前端工具 | Vite | 5.1.4 |
| UI | Ant Design | 5.14.0 |
| 路由 | React Router | 6.22.0 |
| 狀態 | Zustand | 4.5.1 |
| HTTP | Axios | 1.6.7 |
| 日期 | dayjs | 1.11.10 |
| 圖表 | Recharts | 2.12.2 |
| 日曆 | FullCalendar | 6.1.11 |
| 檔案 | @e965/xlsx（SheetJS 相容 fork）+ docx | - |
| 外部整合 | googleapis、openai | - |
| 打包 | electron-builder | 26.8.1 |

---

## 3. 專案結構

```
voter-service-system/
├── electron/                    # Electron 主程序（Node.js）
│   ├── main.ts                 # 主進程：視窗、tray、fingerprint unlock
│   ├── preload.ts              # IPC bridge（渲染程序可用的 API）
│   └── preload-unlock.ts       # 授權解鎖視窗專用 preload（contextIsolated）
│
├── server/                      # 後端 Fastify 伺服器
│   ├── index.ts                # Fastify 實例、CORS、JWT、全部 route 註冊
│   ├── db/
│   │   ├── index.ts           # DB 連線（WAL、pragma 調優）
│   │   └── migrate.ts         # 所有 CREATE TABLE + migration
│   ├── middleware/
│   │   ├── auth.ts            # authenticate、requirePermission、rolePermissions
│   │   └── audit.ts           # createAuditLog helper
│   ├── routes/                 # 34 支路由檔案（每個模組一支）
│   │   ├── auth.ts            # /api/auth/* 登入登出
│   │   ├── voters.ts          # /api/voters/* 選民 CRUD + merge + anonymize
│   │   ├── petitions.ts       # /api/petitions/* 陳情案件
│   │   ├── groups.ts          # /api/groups/* 團體
│   │   ├── schedules.ts       # /api/schedules/* 行程
│   │   ├── tasks.ts           # /api/tasks/* 待辦
│   │   ├── documents.ts       # /api/documents/* 公文
│   │   ├── events.ts          # /api/events/* 活動
│   │   ├── surveys.ts         # /api/surveys/* 問卷
│   │   ├── contactRecords.ts  # /api/voters/:id/contacts/*
│   │   ├── notifications.ts   # /api/notifications/*
│   │   ├── ceremonies.ts      # /api/ceremonies/* 禮儀記錄
│   │   ├── vendors.ts         # /api/vendors/* 廠商
│   │   ├── expenses.ts        # /api/expenses/* 支出預算
│   │   ├── proposals.ts       # /api/proposals/* 提案追蹤
│   │   ├── consultations.ts   # /api/consultations/* 法律諮詢
│   │   ├── dailyLogs.ts       # /api/daily-logs/*
│   │   ├── reports.ts         # /api/reports/*
│   │   ├── search.ts          # /api/search 全域搜尋
│   │   ├── admin.ts           # /api/admin/* 系統管理
│   │   ├── backup.ts          # /api/backup/*
│   │   ├── importExport.ts    # /api/*/import、/api/*/export
│   │   ├── attachments.ts     # /api/attachments/* 檔案上傳
│   │   ├── ai.ts              # /api/ai/* OpenAI/Claude 整合
│   │   ├── googleCalendar.ts  # /api/integrations/gcal/*
│   │   ├── lineWebhook.ts     # /api/line/webhook
│   │   └── electionAreas.ts   # /api/election-areas
│   ├── services/               # 背景服務
│   │   └── autoBackup.ts      # 自動備份排程
│   └── utils/                  # 工具函式
│
├── client/                      # 前端 React
│   ├── App.tsx                 # 根元件 + BrowserRouter + 所有 Route 定義
│   ├── main.tsx               # React 入口
│   ├── pages/                  # 56 個頁面元件
│   │   ├── Dashboard.tsx      # Today Command Center 今日工作台（首頁）
│   │   ├── LoginPage.tsx
│   │   ├── voters/            # 選民管理 (ListPage、DetailPage、各 Tab)
│   │   ├── petitions/         # 陳情管理
│   │   ├── groups/            # 團體管理
│   │   ├── schedules/         # 行程管理
│   │   ├── tasks/             # 待辦
│   │   ├── documents/         # 公文
│   │   ├── events/            # 活動
│   │   ├── surveys/           # 問卷
│   │   ├── notifications/     # 通知
│   │   ├── ceremonies/        # 禮儀管理、廠商、支出
│   │   ├── proposals/         # 提案追蹤
│   │   ├── reports/           # 進階報表
│   │   ├── admin/             # 後台管理（使用者、類別、設定、備份、交接、日誌）
│   │   └── print/             # 列印專用頁
│   ├── components/
│   │   ├── Layout/MainLayout.tsx   # 側邊欄、Header、路由出口
│   │   ├── ai/AIButton.tsx         # AI 功能按鈕（各頁複用）
│   │   ├── CallHandlerModal.tsx    # 來電處理 Modal
│   │   ├── AttachmentUpload.tsx
│   │   ├── GlobalSearch.tsx
│   │   ├── ScheduleReminder.tsx
│   │   └── FirstRunWizard.tsx
│   ├── stores/                 # Zustand
│   │   ├── authStore.ts       # user, token, login/logout
│   │   └── themeStore.ts      # 明暗主題
│   ├── hooks/
│   │   ├── useDataSync.ts     # 跨視窗資料同步
│   │   └── useKeyboardShortcuts.ts
│   ├── utils/
│   │   ├── api.ts             # axios 實例 + interceptor（JWT、401、網路錯誤）
│   │   └── constants.ts       # 顏色/標籤對照表
│   └── styles/                 # global CSS
│
├── scripts/                     # 建置腳本
│   ├── build-electron.mjs     # 打包 Electron main
│   ├── build-preload.mjs      # 打包 preload + preload-unlock
│   └── generate-icons.mjs     # 從 resources 產生各平台 icons
│
├── resources/                   # App icons (icon.icns/.ico/.png)
├── dist/                       # vite build 輸出（frontend）
├── dist-electron/              # esbuild 輸出（main、preload）
├── release/                    # electron-builder 輸出的安裝檔
├── docs/                       # 文件
│   ├── user-manual.html       # 使用者手冊
│   ├── installation-guide.html
│   ├── handoff/               # ← 你正在看的交接文件
│   └── runbooks/              # 備份還原、資料保護、資料品質、發布、安裝、事故處理
│
├── .github/workflows/ci.yml        # PR / main: typecheck + test + build + production audit
├── .github/workflows/release.yml   # tag v* 時自動 build Mac+Win 並發佈 Release
├── package.json
├── vite.config.ts             # 前端 build 設定（含 chunk split）
├── tsconfig.json              # 前端 TS 設定
├── tsconfig.server.json       # 後端 TS 設定
└── tsconfig.electron.json     # Electron TS 設定
```

> ✅ `server/` 下舊的 `.js` 編譯產物已清除；後續請以 `.ts` 作為唯一來源，避免重新把編譯產物放回 source tree。

---

## 4. 開發環境設定

### 首次 setup

```bash
git clone https://github.com/Sterio068/voter-service-system.git
cd voter-service-system
npm ci
npm run build:icons      # 產生 icon
```

### 啟動 dev

```bash
npm run dev
# 同時啟動三個程序：
# - dev:server  (tsx watch server/index.ts)  → http://localhost:8080
# - dev:client  (vite)                        → http://localhost:5173
# - dev:electron (wait-on 5173 && electron .) → 桌面視窗
```

### 常用指令

| 指令 | 用途 |
|------|------|
| `npm run dev` | 全端開發模式 |
| `npm run build` | build client + main + preload |
| `npm run typecheck` | client + server + Electron TypeScript 檢查 |
| `npm test` | Node test runner + tsx 執行單元測試 |
| `npm run test:e2e` | Playwright Chromium smoke / navigation / role-access 測試 |
| `npm run audit:prod` | production dependencies audit |
| `npm run verify` | typecheck + test + build + production audit |
| `npm run dist:mac` | 產生 Mac DMG |
| `npm run dist:win` | 產生 Windows EXE |
| `npm run dist:all` | 兩個平台都產生（需 macOS） |
| `npm run db:migrate` | 執行 DB migration（正常啟動時自動跑） |

### TypeScript 檢查

```bash
npm run typecheck
```

### better-sqlite3 native module 注意

如果切換 Node.js 版本，需要重新編譯：
```bash
npm rebuild better-sqlite3
# 或
./node_modules/.bin/electron-rebuild
```

---

## 5. 發佈流程

### 自動（CI）

1. 改 `package.json` 的 `version` 欄位
2. `git commit` + `git tag v1.x.x` + `git push origin main --tags`
3. GitHub Actions 會：
   - 在 `macos-latest` build Mac DMG（Intel + Apple Silicon）
   - 在 `windows-latest` build Windows EXE（NSIS 安裝版 + portable 免安裝版）
   - 直接上傳到 Release（跳過 artifact 步驟，避免配額問題）

### 手動本機 build

Mac（本機是 macOS）：
```bash
npm run dist:mac
# 輸出：release/選民服務系統-{version}-arm64.dmg
#      release/選民服務系統-{version}.dmg
```

Windows 無法從 macOS cross-compile（native modules 問題），只能從 CI 下載或在 Windows 機器 build。

### 從 CI Release 下載安裝檔

```bash
gh release download v1.0.8 --repo Sterio068/voter-service-system --dir release
```

---

## 6. 資料庫 Schema

### 41 張表一覽

| 分類 | 表名 | 用途 |
|------|------|------|
| **核心** | voters | 選民主檔 |
| | voter_tags | 選民標籤（多對多） |
| | voter_topics | 選民關注議題 |
| | voter_engagement | 支持度、志工標記 |
| | voter_relations | 選民關係網（夫妻、親友、樁腳等） |
| | voter_activity_history | 選民活動歷史 |
| | voter_merge_history | 選民合併記錄（稽核） |
| **陳情** | petitions | 陳情案件 |
| | petition_logs | 案件處理日誌 |
| **聯絡** | contact_records | 聯絡紀錄（每筆案件底下） |
| **團體** | groups | 團體主檔 |
| | group_members | 團體成員（多對多） |
| **行程** | schedules | 行程／諮詢／禮儀主檔 |
| | consultation_time_slots | 法律諮詢可預約時段 |
| | consultation_appointments | 法律諮詢預約 |
| **禮儀** | ceremony_records | 禮儀記錄 |
| | ceremony_items | 禮儀品項明細 |
| | gift_categories | 禮品類別 |
| | vendors | 廠商 |
| | expense_budgets | 支出預算 |
| **待辦** | tasks | 待辦事項 |
| **公文** | documents | 公文主檔 |
| **活動** | events | 活動 |
| | event_participants | 活動參與者 |
| **問卷** | surveys | 問卷主檔 |
| | survey_questions | 問卷題目 |
| | survey_responses | 問卷回答 |
| **通知** | notifications | 通知主檔 |
| | notification_recipients | 通知收件者 |
| **提案** | proposals | 議會提案追蹤 |
| **日誌** | daily_logs | 每日工作日誌 |
| **附件** | attachments | 通用檔案附件（polymorphic） |
| **系統** | users | 帳號 |
| | audit_logs | 操作稽核 |
| | archive_audit_logs | 稽核封存 |
| | settings | 系統設定 KV |
| | categories | 動態類別（陳情類別、禮儀類別等共用表） |
| | election_areas | 選舉區域 |
| | google_calendar_accounts | Google 日曆綁定帳號 |
| | seq_numbers | 案件／文號流水號 |
| | schema_migrations | 資料庫版本 |
| | client_errors | 前端錯誤回報 |

### DB 調優（server/db/index.ts）

```
PRAGMA journal_mode = WAL        # Write-Ahead Logging
PRAGMA busy_timeout = 15000      # 鎖定等待 15 秒
PRAGMA cache_size = -2000        # 2 MB cache
PRAGMA synchronous = NORMAL
PRAGMA temp_store = MEMORY
PRAGMA foreign_keys = ON
```

### 關鍵索引（server/db/migrate.ts）

- `idx_voters_city_district_village` — 選民按戶籍地址查詢
- `idx_petitions_active_status` — 案件按 `is_active, status, created_at` 查詢
- `idx_contact_records_voter_date` — 聯絡紀錄按選民時序
- `idx_audit_logs_created_desc` / `idx_audit_logs_user_created`
- `idx_schedules_active_start`
- `idx_voter_tags_voter`, `idx_voter_relations_voter`, `idx_tasks_assignee_status`

### 軟刪除規則

- **主檔表** (voters、petitions、groups、schedules、vendors、notifications): 用 `is_active=0` 軟刪除
- **關聯表** (voter_tags、ceremony_items、group_members、survey_responses、contact_records): 用 `DELETE FROM` 硬刪除
- **稽核表** (audit_logs): 永不刪除，滿一定量會 archive 到 archive_audit_logs

---

## 7. 權限系統

### 4 種角色（`server/middleware/auth.ts`）

| 角色 | 說明 | 典型操作 |
|------|------|---------|
| `admin` | 管理員 | 全部操作 + 帳號管理 |
| `supervisor` | 主管 | 看全部、改全部、但不能改帳號設定 |
| `assistant` | 助理 | 看全部、建立/編輯、不能刪除敏感資料 |
| `volunteer` | 志工 | 僅檢視，不可修改 |

### 權限模組

每個模組定義 `view`, `create`, `edit`, `delete`, `export`, `print` 等 action。

```typescript
rolePermissions = {
  admin: {
    voters: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    petitions: [...], groups: [...], documents: [...],
    schedules: [...], tasks: [...], notifications: [...],
    reports: [...], events: [...], surveys: [...],
    contact_records: [...], proposals: [...],
    vendors: [...], ceremonies: [...], expenses: [...],
    ai: ['use', 'view'],
    admin: [...], users: [...], audit_logs: [...],
    categories: [...], settings: [...]
  },
  supervisor: {...},
  assistant: {...},
  volunteer: {...}
}
```

### 使用方式

```typescript
// 路由層
fastify.post('/api/voters', { 
  preHandler: [requirePermission('voters', 'create')] 
}, async (req, reply) => { ... })

// 前端條件渲染
{user?.role === 'admin' && <AdminButton />}
```

---

## 8. API 端點總覽

**Base URL**：`http://localhost:8080/api`  
**認證**：所有端點（除了 `/api/auth/*`、`/api/line/webhook`）都需要 `Authorization: Bearer <JWT>`

### 主要路由群

| 前綴 | 檔案 | 代表端點 |
|------|------|---------|
| `/api/auth` | `auth.ts` | `POST /login`, `POST /logout`, `GET /me` |
| `/api/voters` | `voters.ts` | GET、POST、PUT、DELETE、`/search`、`/duplicates`、`/:id/merge`、`/:id/anonymize`、`/:id/tags`、`/:id/topics`、`/:id/engagement`、`/:id/contacts`、`/:id/relations`、`/:id/activity-history`、`/birthdays` |
| `/api/petitions` | `petitions.ts` | 列表、CRUD、`/stats`、`/overdue-count`、`/follow-ups`、`/:id/logs`、`/import/template`、`/import`、`/export` |
| `/api/groups` | `groups.ts` | CRUD + members |
| `/api/schedules` | `schedules.ts` | CRUD |
| `/api/consultations` | `consultations.ts` | `/slots`、`/slots/manage`、`/today` |
| `/api/tasks` | `tasks.ts` | CRUD、`/today` |
| `/api/documents` | `documents.ts` | CRUD |
| `/api/events` | `events.ts` | CRUD + participants |
| `/api/surveys` | `surveys.ts` | CRUD + questions + responses + stats |
| `/api/notifications` | `notifications.ts` | CRUD + `/:id/send` |
| `/api/ceremonies` | `ceremonies.ts` | CRUD + items |
| `/api/vendors` | `vendors.ts` | CRUD + `/:id/stats` |
| `/api/expenses` | `expenses.ts` | CRUD + `/budgets` |
| `/api/proposals` | `proposals.ts` | CRUD + `/export` + `/stats` |
| `/api/daily-logs` | `dailyLogs.ts` | 列表、`/:date` 取得 or upsert |
| `/api/reports` | `reports.ts` | `/petition-yearly`、`/voter-activity`、`/no-contact-voters` 等 |
| `/api/search` | `search.ts` | 全域搜尋 |
| `/api/admin` | `admin.ts` | `/users`、`/categories`、`/settings`、`/audit-logs`、`/handover`、`/alerts` |
| `/api/backup` | `backup.ts` | `/create`、`/list`、`/restore` |
| `/api/attachments` | `attachments.ts` | 檔案上傳／下載 |
| `/api/ai` | `ai.ts` | `/chat`、`/summarize`、`/extract` 等 7 個 |
| `/api/integrations/gcal` | `googleCalendar.ts` | OAuth + 同步 |
| `/api/line/webhook` | `lineWebhook.ts` | LINE Messaging API 入口 |

### 統一回應格式

```typescript
{
  success: boolean
  data?: T
  error?: string   // 當 success=false
  total?: number   // 分頁列表
}
```

### 錯誤碼約定

- `400` — Zod 驗證失敗 或 業務邏輯錯誤（必填未填、格式錯）
- `401` — JWT 過期 / 無效
- `403` — 權限不足（`requirePermission` 擋下）
- `404` — 資源不存在
- `409` — 衝突（時段額滿、名稱重複）
- `500` — 後端例外

---

## 9. 前端路由

**`client/App.tsx`** 定義（所有需登入的路由都在 `<MainLayout>` 下）：

> 目前頁面元件已用 `React.lazy` + `Suspense` 做 route-level code splitting；新增頁面時請沿用 lazy import，避免把大型頁面重新塞回初始 bundle。

```
/                            → Dashboard
/login                       → LoginPage

/voters                      → VoterListPage
/voters/merge                → VoterMergePage
/voters/call-bank            → CallBankPage
/voters/:id                  → VoterDetailPage（含 6 個 Tab）

/petitions                   → PetitionListPage
/petitions/:id               → PetitionDetailPage
/petitions/stats             → PetitionStatsPage

/groups                      → GroupListPage
/groups/:id                  → GroupDetailPage

/schedules                   → SchedulePage（FullCalendar）
/documents                   → DocumentListPage
/tasks                       → TasksPage
/events                      → EventsPage
/surveys                     → SurveysPage
/notifications               → NotificationsPage
/proposals                   → ProposalsPage
/reports                     → ReportsPage（多種報表）
/print/voters                → PrintVoterListPage
/print/labels                → PrintLabelPage

/ceremonies                  → CeremonyPage
/vendors                     → VendorPage
/expenses                    → ExpensePage

/admin/users                 → UserManagePage
/admin/audit-logs            → AuditLogPage
/admin/categories            → CategoryPage
/admin/settings              → SettingsPage
/admin/handover              → HandoverPage
/admin/daily-log             → DailyLogPage

/help                        → HelpPage
```

### 全域 Layout 功能（MainLayout.tsx）

- 側邊欄導覽（可收合）
- 上方 Header：office name + 主題切換 + 全域搜尋（Ctrl+K）+ 通知鈴鐺 + 使用者頭像
- 快捷鍵：Ctrl+N 新陳情、Ctrl+V 新選民、Ctrl+T 新待辦、Ctrl+B 今日行程
- 閒置自動登出（預設 30 分鐘，可在設定調）
- Mobile 響應式（< 768px 切換為底部 Tab）

---

## 10. 外部整合

### Google Calendar（雙向同步）

- 檔案：`server/routes/googleCalendar.ts`
- OAuth 2.0 flow：使用者在設定頁綁定 Google 帳號
- 寫：`schedules` 新增/更新/刪除時 → 同步到 Google Calendar
- 讀：GET `/api/integrations/gcal/accounts` 取得已綁定帳號清單
- 失敗不擋主操作：`syncScheduleToGCal(...).catch(logGCalError)`
- 設定：`gcal_client_id`、`gcal_client_secret` 存 settings 表；secret 由 `server/utils/secrets.ts` 加密
- 設定頁重新儲存時，`client_secret` 留空代表保留舊 secret，不會把既有憑證清空

### LINE（單向接收）

- 檔案：`server/routes/lineWebhook.ts`
- 公開端點 `POST /api/line/webhook`（無認證，LINE 官方呼叫）
- 綁定 LINE user ID 到選民（在 `voters.tags` 欄位以 `LINE:xxx` 標籤儲存）
- 接收 LINE 訊息自動建立聯絡紀錄
- 設定：`line_channel_access_token`、`line_channel_secret` 存 settings 表；secret 由 `server/utils/secrets.ts` 加密
- Webhook 有 route-level rate limit，且簽章驗證失敗一律拒絕

### OpenAI / AI 助理

- 檔案：`server/routes/ai.ts`、`server/utils/aiClient.ts`
- 支援：OpenAI、Anthropic、Gemini（透過 provider 切換）
- 端點：
  - `/api/ai/chat` — 通用對話
  - `/api/ai/summarize` — 摘要陳情/文件
  - `/api/ai/extract` — 從長文抽取結構化資料
  - `/api/ai/draft-reply` — 撰寫回覆草稿
- API key 儲存在 settings 表，透過 `server/utils/secrets.ts` 加密；前端只取得遮罩值
- 前端 `<AIButton>` 元件統一觸發

### API 節流與邊界保護

- 檔案：`server/index.ts`、`server/routes/auth.ts`、`server/routes/lineWebhook.ts`
- 全域 `@fastify/rate-limit` 預設 `600 requests / minute`，可用 `RATE_LIMIT_MAX`、`RATE_LIMIT_WINDOW` 調整
- 登入端點額外限制 `10 requests / 15 minutes`，並保留既有 username-based login lockout
- LINE webhook 額外限制 `120 requests / minute`
- 備份下載/建立/還原與附件上傳有較低 route-level rate limit，避免重 I/O 路由被濫用
- 429 回應固定為泛化訊息，不回傳內部錯誤或 stack

### 安全標頭、附件與備份驗證

- 檔案：`server/utils/securityHeaders.ts`、`server/utils/fileSecurity.ts`、`server/routes/attachments.ts`、`server/routes/backup.ts`
- 全域回應會加 `Content-Security-Policy`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-Content-Type-Options`
- CSP 目前允許 inline style 以支援 Ant Design CSS-in-JS，但不允許 inline script
- 附件只允許 PDF/圖片 MIME，儲存副檔名由 MIME 決定，並做基本 magic-byte 驗證
- 附件 list/download 會確認父資源存在且角色具備對應模組 view 權限；未知 `ref_type` 一律拒絕
- 備份還原除了 `PRAGMA integrity_check`，也會檢查必要資料表與 `schema_migrations`，避免任意 SQLite 檔被當成本系統備份
- 本機備份會產生 `.meta.json` sidecar，記錄 SHA-256、schema version、Node version 與 HMAC-SHA256 簽章；`/api/backup/verify/:filename` 會回報 signed/signature/trust_level
- 設定頁備份清單會顯示「已簽章 / 舊格式」，並可直接呼叫 verify API 驗證單筆備份
- 可用 `VOTER_SERVICE_BACKUP_ALLOWED_ROOTS` 或 `BACKUP_ALLOWED_ROOTS` 啟用備份目錄白名單；多個目錄用系統 path delimiter、分號或換行分隔

### Electron 授權解鎖

- 檔案：`electron/main.ts` 的 `showUnlockWindow()` + `electron/preload-unlock.ts`
- 機制：MAC 位址 + hostname → SHA256 雜湊 → 存 `settings.machine_fingerprint`
- 若有設定機器綁定密碼，首次安裝或換機時顯示解鎖視窗（要求輸入授權密碼）
- 授權密碼來源：`VOTER_SERVICE_VENDOR_PASSWORD`，相容舊環境變數 `VENDOR_PASSWORD`；未設定時正式版不啟用 vendor lock
- 開發模式跳過（`NODE_ENV !== 'production'`）

---

## 11. 已知的重要技術決策

### db.transaction() API

使用 better-sqlite3 的 transaction wrapper：

```typescript
const txn = db.transaction(() => { ... return result })
const result = txn()              // BEGIN DEFERRED
const result = txn.immediate()    // BEGIN IMMEDIATE（建議用在寫入）
const result = txn.exclusive()    // BEGIN EXCLUSIVE
```

巢狀 transaction 會自動生成 SAVEPOINT（支援部分 rollback）。

### Zod schema 必須 `.nullable().optional()`

**原因**：Antd Form 清空欄位會送 `null`，但 `.optional()` 只接受 `undefined`。
正確寫法：

```typescript
voter_id: z.number().nullable().optional(),
birth_date: z.string().nullable().optional(),
```

前端送出前也要過濾 `null`：
```typescript
const cleaned: Record<string, any> = {}
for (const [k, v] of Object.entries(values)) {
  if (v !== null && v !== undefined && v !== '') cleaned[k] = v
}
```

### AutoComplete vs Select

**當 options 可能為空時**（動態類別），**不要用 Select + showSearch**（空 options 會讓使用者無法打字）。改用 `AutoComplete`：

```tsx
<AutoComplete
  allowClear
  placeholder="選擇或輸入"
  options={categories.map(c => ({ value: c }))}
  filterOption={(input, option) => String(option?.value || '').toLowerCase().includes(input.toLowerCase())}
/>
```

### 條件渲染 Form.Item 的地雷

**禁止**：`{cond && <Form.Item name="x" />}` — unmount 時資料丟失  
**正確**：`<Form.Item name="x" hidden={!cond} />`

### initialValues 必須模組層常數

```typescript
// ❌ 每次 render 重建
<Form initialValues={{ channel: '電話' }}>

// ✅ 模組層級常數
const FORM_INITIAL = { channel: '電話' }
<Form initialValues={FORM_INITIAL}>
```

### 時區統一用 localtime

後端寫入時間統一用 `datetime('now','localtime')`，**不要** `new Date().toISOString()`（會寫入 UTC，跟其他欄位比較時差 8 小時）。

### JWT 過期時間 8 小時

`auth.ts:56`：`expiresIn: '8h'`。閒置時間由前端 `MainLayout` 的 idle timer 管（30 分鐘）。

---

## 12. 最近的除錯歷程（重要）

### v1.0.5 → v1.0.8 修了這些

**v1.0.5**：
- macOS Gatekeeper 阻擋 → 加 `gatekeeperAssess: false`、`hardenedRuntime: false`
- 提案追蹤匯出、批量匯入陳情/團體
- 選民關係 (voter_relations) 前端 UI
- 每日日誌 CRUD

**v1.0.6**：
- 廠商／禮儀／支出權限設定（之前沒加進 rolePermissions）

**v1.0.7**：⚠️ **大 bug**
- Zod schema `z.number().optional()` 拒絕 null → 前端送 `voter_id: null` 導致 400，但 catch 只顯示「立案失敗」看不出原因
- 全部改 `.nullable().optional()`，前端過濾 null

**v1.0.8**：
- voters schema 同樣問題修掉（20+ 欄位）
- 陳情類別空 Select 改 AutoComplete
- voters PUT 的 tags 更新納入同一 transaction
- voters merge 的內層 `try {} catch {}` 改 `safeRedirect`（只容忍 schema 差異）
- DocumentListPage 條件 Form.Item 改 `hidden`
- axios interceptor 加網路錯誤統一提示

### 如果下個版本又出現類似症狀

- **「新增完全沒反應、列表沒更新」**：99% 是 Zod schema 拒絕了某個欄位。按 F12 看 Network tab 的 400 回應，看 `error` 欄位內容。
- **「欄位打不進字」**：99% 是 Select showSearch 但 options 為空。改 AutoComplete 或 Input。
- **「切換選項後填過的資料消失」**：條件 Form.Item unmount。改 hidden prop。

---

## 13. 測試策略（剛建立基線）

**現狀**：已有 `npm test`，使用 Node 內建 test runner + `tsx` 執行 TypeScript 測試；目前覆蓋 vendor 授權密碼、secret 加密工具、安全標頭、附件檔案安全、備份 metadata、PII 遮罩工具，以及 Fastify + 暫存 SQLite 的 API integration tests（auth、fresh install 預設設定、permissions、voters、petitions、petition import/export、attachments、schedules、consultations、backup/restore、voter import/export、data retention、secrets round-trip、ceremonies/expenses/template RBAC），並新增 `restoreOnStartup` 測試驗證待還原資料庫會在啟動前真正套用到主 DB。CI 已新增 `typecheck client/server/electron/test`、`npm test`、`npm run build`、`npm audit --omit=dev`。Playwright E2E smoke/navigation/role-access 已可跑 `npm run test:e2e`，目前覆蓋登入、Dashboard 今日工作台 deep-link、主要模組 compact page shell 與共用篩選工具列、全主要路由無 ErrorBoundary 崩潰、設定頁資料保留控制、UI 新增選民、UI 新增陳情、備份建立、完整匯出理由 Modal 與下載，以及 assistant / supervisor / volunteer 的受限路由、列印頁、導覽、快捷鍵、Dashboard 入口、禮儀/收支 read-only 管控與頁內 CRUD 按鈕巡檢，smoke/navigation/role-access 共 18 條已可通過。UI primitives 已包含 `PageScaffold`、`WorkspaceToolbar`、`EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar`、`MetricCard`、`ActionQueue`，前端主路由、側邊欄與快捷鍵也已統一走共用 permission map；另外已新增 `shared/permissions.ts` 作為前後端共用 RBAC 基線，並把 reports / audit logs / categories / ceremonies / expenses 收斂成 read-only / manage 分層頁面。2026-04-25 另補上 `VendorPage`、`ProposalsPage` 長表單 Modal 的 scrollable body + 可見 footer，修正正式版 1280×768 視窗下 primary action 掉出畫面的 UX 缺陷；同日也補上 fresh install `settings` baseline seed、`backup_path` 跟隨 `BACKUPS_PATH`、正式版隔離 restore-on-restart 驗收與 12k/1.5k/300 packaged load smoke，最新版安裝包已完成 source 與 packaged app 雙驗證。

**建議下一步**：
- 後端：沿用 `tests/helpers/apiTestServer.ts` 的暫存 SQLite harness，繼續補 petition export/import、schedule conflict、consultation capacity、secrets round-trip 等 integration tests
- 前端：重要頁面用 Playwright E2E，下一批優先補 Dashboard 工作佇列項目、資料品質掃描、選民合併、Google Calendar 失敗不阻擋，並依 `FULL_SYSTEM_TEST_PLAN.md` 把人工巡檢缺陷轉成回歸測試
- 擴充既有 `npm test`，優先補 Google/LINE/AI 設定路由 secrets round-trip、團體匯入 round-trip、活動/問卷/通知模組稽核完整性

---

## 14. 常見開發任務

### 新增一個 CRUD 模組（例如「活動贊助商」）

1. **DB**：在 `server/db/migrate.ts` 加 `CREATE TABLE sponsors (...)` 與索引
2. **權限**：在 `server/middleware/auth.ts` 四個角色的 rolePermissions 加 `sponsors: [...]`
3. **後端**：新增 `server/routes/sponsors.ts` + 在 `server/index.ts` 註冊
4. **前端路由**：`client/App.tsx` 加 `<Route path="sponsors" element={<SponsorListPage />} />`
5. **前端頁面**：複製類似的 `client/pages/groups/GroupListPage.tsx` 改造
6. **導覽**：`client/components/Layout/MainLayout.tsx` 加 `<NavItem>`
7. **審計**：mutation 都要呼叫 `createAuditLog`
8. **Zod schema**：`.nullable().optional()` 防 null
9. **前端 handleSave**：過濾 null/空字串
10. **測試**：手動測 4 個角色的權限

### 修 bug 的流程

1. 看 Electron DevTools（Cmd+Option+I / Ctrl+Shift+I）的 Console + Network
2. 在 Network 看失敗請求的 Response body（通常有 `error` 訊息）
3. 後端 log 在 terminal（dev 模式）或 `~/Library/Logs/選民服務系統/`（安裝版）
4. `server/db/index.ts` 開啟 verbose log 可看每條 SQL

### 資料庫檢視

```bash
# 安裝版資料庫位置
# macOS: ~/Library/Application Support/選民服務系統/voter.db
# Windows: %APPDATA%/選民服務系統/voter.db

sqlite3 voter.db
.tables
.schema voters
SELECT * FROM settings;
```

---

## 15. 重要限制 / 非功能需求

- **離線優先**：所有核心功能都能離線用（AI/Google Calendar 除外）
- **單機 / 區網**：不設計多辦公室共享伺服器
- **資料量上限**：設計上支援單庫 10 萬筆選民 + 1 萬筆案件。再多需要分區或遷移 Postgres
- **繁體中文專屬**：不支援多語系（未來可加 i18n）
- **桌面端專屬**：沒有 mobile app（Electron 只打包桌面）

---

## 16. 緊急聯絡 / 下一步

**repo owner**：https://github.com/Sterio068  
**最後交接提交**：commit `dabe83f`（v1.0.8，2026-04-23）

**建議下個 AI / 開發者優先做**：
1. 補 Google Calendar、LINE、AI 設定路由的 secrets 儲存/遮罩/讀取整合測試
2. 擴充 E2E smoke：資料品質掃描、選民合併、權限矩陣與 Google Calendar 失敗不阻擋
3. 補活動、問卷、通知、Call Bank 等頁面的自動化驗證與業務流程測試
4. 補團體匯入完整 round-trip 測試，確認 `@e965/xlsx` 相容既有範本

---

## 17. 檔案閱讀順序（給 AI）

如果你是 AI 要快速上手，建議按這個順序讀：

1. `README.md` — 一頁概覽
2. `server/db/migrate.ts` — 資料模型（最重要）
3. `server/middleware/auth.ts` — 權限定義
4. `server/index.ts` — server 入口
5. `server/routes/voters.ts` — 最複雜的路由，涵蓋所有模式（transaction、audit、merge、schema）
6. `client/App.tsx` — 路由定義
7. `client/components/Layout/MainLayout.tsx` — 全域 UI
8. `client/pages/voters/VoterListPage.tsx` — 最複雜的頁面
9. `client/pages/voters/VoterDetailPage.tsx` + `components/*Tab.tsx` — Tab 模式
10. `client/utils/api.ts` — HTTP 層
11. `electron/main.ts` — Electron 主程序
12. 這份 HANDOFF.md ✓
13. `docs/handoff/FULL_SYSTEM_TEST_PLAN.md` — 實機登入後的全功能巡檢矩陣

讀完這 13 個檔案就能處理 95% 的 issue。

---

**End of HANDOFF.md** — 有問題看 `docs/handoff/` 下其他檔案或直接 grep 程式碼。
