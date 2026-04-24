# Phase 1-4 執行計畫

本文件承接 `ROADMAP.md`，用來追蹤「從穩定基線一路推進到長期架構」的實作順序。每一批變更都應以 `npm run verify` 或 CI 等價流程收尾。

## Phase 1：穩定、安全、測試與交付

已完成：
- 建立 `npm test` 與 `npm run typecheck` / `npm run verify` 指令。
- CI 在 PR/main 執行 typecheck、test、build、production audit。
- Release workflow 在打包前執行 typecheck、test、production audit。
- 加入全域 rate limiting，並對登入、LINE webhook、附件上傳、備份/還原等路由加 route-level 限制。
- 加入全域 CSP/security headers。
- Secrets at-rest encryption：JWT、AI、Google/LINE secrets、Google tokens。
- 備份還原驗證：SQLite integrity check + 必要系統 schema。
- 啟動時自動套用待還原資料庫：若存在 `voter-service.db.restore`，server 開啟 DB 前會先覆寫主 DB 並清除舊 WAL/SHM sidecar，正式版啟動後顯示「還原完成」提示。
- restore-on-startup 已補 rollback：若 pending restore 在啟動時套用失敗，系統會自動回復原主 DB、保留 `*.restore.failed-*` 供排查，並在正式版顯示「還原未套用」警告。
- fresh install 預設設定改成逐 key `INSERT OR IGNORE`：即使 secret migration 先寫入 settings，`first_run`、`office_name`、`idle_timeout`、`backup_path` 等基線設定仍會正確 seed。
- `backup_path` 預設會跟隨 `BACKUPS_PATH`，正式版乾淨安裝不會再意外退回 `./backups`。
- 備份簽章/metadata：本機備份建立 `.meta.json` sidecar，verify API 回報 signed/signature/trust level。
- 備份目錄白名單：支援 `VOTER_SERVICE_BACKUP_ALLOWED_ROOTS` / `BACKUP_ALLOWED_ROOTS` 部署層限制。
- 附件安全：MIME allowlist、基本檔頭驗證、父資源存在檢查、路徑防穿越。
- voters merge 已補完整轉移：`voter_activity_history` 會跟著轉移，`voter_engagement` 會做欄位級合併，且 duplicate `group_members` / `event_participants` 不再因 UNIQUE 衝突導致整筆 merge rollback。
- Electron 本機 server 已補健康檢查 watchdog，Fastify 若連續 health check 失敗會自動重啟；`startSchedules()` 也已改成 idempotent，避免重啟後掛出重複排程。
- 建立可重建 SQLite API integration test harness，已覆蓋 auth、role permission、voter lifecycle/audit、voter merge completeness、petition lifecycle/audit、petition import/export、attachments upload/download、schedule conflict/update conflict、consultation capacity、backup signed verify、restore valid/invalid marker、voter export masking/full export reason、Excel import dry-run/commit、secrets round-trip。
- `npm run typecheck` 已納入 `typecheck:test`，測試碼也會進 TypeScript 品質門。
- 新增 Playwright E2E smoke/navigation/role access，已覆蓋登入、Dashboard 今日工作台 deep-link、主要模組 compact page shell、全主要路由無 ErrorBoundary 崩潰、設定頁資料保留控制、UI 新增選民、UI 新增陳情、備份建立與完整個資匯出理由/下載，以及 assistant / supervisor / volunteer 前端權限矩陣、列印路由與頁內 CRUD 按鈕權限。
- 已完成正式版隔離驗收：fresh install wizard、pending restore 重啟套用、`backup_path` 初始值與 12k/1.5k/300 大量資料 smoke。

下一步：
- 備份 metadata 匯出/匯入 UX：讓下載備份可一併保存 sidecar 或改用 ZIP 封裝。
- Google/LINE/AI route-level secrets round-trip：補設定 API 儲存、遮罩、讀回、使用時解密的整合測試。
- E2E smoke 下一步：補 Google Calendar 失敗不阻擋、資料品質掃描、選民合併與權限矩陣。

## Phase 2：效能、UI 與 UX

已完成：
- 後台新增資料品質掃描入口，回報重複手機/身分證、孤兒附件、附件檔案遺失與關聯孤兒資料。
- SettingsPage `last_auto_backup` 改用 `Form.useWatch`，避免 render 時機問題。
- SettingsPage 備份清單顯示簽章狀態，支援單筆備份驗證，備份目錄白名單啟用時顯示提示。
- 選民 Excel 匯出預設遮罩 PII；完整個資匯出需 admin + 匯出理由，並寫入 audit detail。
- 選民列表完整匯出已改為 admin-only 警示 Modal，必填理由後才會送出完整個資匯出。
- 選民列表已啟用 Ant Design virtual table 與固定 scroll 區域，大量資料時降低 DOM 壓力。
- 前端主路由已改用 `React.lazy` + `Suspense`，production build 會把 Dashboard、選民、陳情、行程、報表、設定等頁面拆成 route-level chunks，降低初始 bundle 壓力。
- 新增 UI/UX 共用基礎元件：`PageScaffold`、`WorkspaceToolbar`、`EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar`、`MetricCard`、`ActionQueue`，並建立 `vss-*` 共用視覺語言。
- 長表單 Modal 已補共用 scrollable body 樣式；`VendorPage`、`ProposalsPage` 在 1280×768 正式版視窗下不再把 primary action footer 擠出畫面。
- Dashboard 已重構為「Today Command Center」今日工作台，集中待分派、逾期、回訪、今日行程、待辦完成度、近期案件、生日關懷與服務健康。
- `PageScaffold` 已推廣到主要列表、詳情、後台、報表、列印、行程、公文、提案、通知、問卷、禮儀、電話拜訪、員工交接與使用說明；`compact` 模式統一標題、描述與 action bar。
- `WorkspaceToolbar` 已推廣到選民、陳情、團體、稽核、公文、行程、提案、禮儀與列印控制面板；搜尋、篩選、統計與次要操作有一致容器。
- `EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar` 已套用到 Dashboard、選民、陳情、公文、團體、活動與行程等高頻流程，統一無資料、儲存取消、表單分段與批次選取體驗。
- 前端主路由、側邊欄、手機導覽、Dashboard 快捷入口與快捷鍵已改用共用 permission map 收斂；未授權角色不再看到不該進入的模組，也不會被 deep-link 或快捷鍵帶進受限頁面。
- 選民、陳情、待辦等高頻列表頁的新增/編輯/刪除/批次操作按鈕，已改用共用 module permission 收斂；列印名冊、地址標籤與陳情統計列印頁也已補 route guard。
- `ReportsPage`、`AuditLogPage`、`CategoryPage` 已補 read-only / manage 分層：assistant 可查看報表與類別定義、supervisor 可查看稽核紀錄，類別頁只對具 create/edit/delete 權限者顯示操作按鈕。
- `ceremonies`、`expenses` 與三個 import template API 已補回後端 module permission；`CeremonyPage` 與 `ExpensePage` 也同步改成 read-only / manage 分層，assistant 僅可唯讀禮儀與收支、volunteer 查看禮儀時不再看到收支統計卡。
- 新增 `FULL_SYSTEM_TEST_PLAN.md`，整理實機登入後的全系統全功能測試矩陣、角色巡檢、橫向場景與缺陷記錄格式。
- `TasksPage` 已支援 `/tasks?focus=today` deep-link，Dashboard 與快捷鍵導向今日焦點時不會落回一般列表。
- 行程查詢與更新衝突檢查改用 time-range overlap 邏輯，跨日行程不會被區間查詢漏掉。
- 新增行程/諮詢相關索引，改善 overlap 查詢與同時段容量檢查。
- SettingsPage 新增資料保留政策設定、預覽與確認執行；會封存舊 audit、刪除舊 client_errors、去識別停用選民。
- 備份狀態新增自動備份最後錯誤提示，排程失敗會寫入 settings 並在 UI 顯示。

下一步：
- 匯入 dry-run UI：新增/更新/錯誤列統計與錯誤原因。
- 將 `MetricCard` / `ActionQueue` 往報表、詳情頁與後台健康頁推廣，並補齊 Modal/Drawer 錯誤顯示與送出前摘要。
- 來電處理與新增陳情流程整合重複選民提示。

## Phase 3：業務模組深化與桌面交付

下一步：
- 陳情 SLA 狀態統一到 Dashboard、列表、詳情、報表。
- 活動/問卷/通知/提案/禮儀支出模組補整合測試與稽核完整性。
- Electron 更新流程：自動更新狀態、更新失敗提示與回滾 runbook。
- Mac/Windows 發佈文件補簽署、notarize、Gatekeeper 與 Windows 安裝注意事項。

## Phase 4：文件、Runbook 與長期架構

已完成：
- `docs/handoff/` 增補 Roadmap、API、DB、Pitfalls 與本文件。
- 新增 `docs/runbooks/`：備份還原、資料保護、資料品質修復、發布、安裝疑難排解、事故處理。

下一步：
- 設計事件/背景任務邊界，將自動備份、資料品質掃描、通知排程逐步服務化。
- 評估 Repository/Service 分層策略，先從 backup、attachments、voters、petitions 四個高風險模組開始。
- Postgres 遷移預備：schema compatibility、ID/transaction 策略、migration diff 工具。

## 完成度快照（本地端/區網部署定位）

| 面向 | 完成度 | 備註 |
|------|--------|------|
| 資安 | 85% | secrets encryption、rate limiting、CSP、附件與備份驗證已到位；仍需 HTTPS/DB encryption 規劃 |
| 個資保護 | 86% | 預設遮罩、完整匯出理由/audit、資料保留 TTL、runbook 已完成；仍需跨機加密部署規範 |
| 測試/CI | 95% | typecheck/test/build/audit、54 個 Node tests、18 條 Playwright smoke/navigation/role-access 與正式版隔離驗收已建立；仍需 coverage 報表 |
| 可靠性 | 95% | restore validation、startup rollback、signed backup、啟動時套用 pending restore、fresh install baseline settings、桌面本機 server watchdog、備份 E2E、正式版隔離驗收、runbooks 已到位；仍需 auto-update 收尾 |
| 效能 | 88% | WAL、索引、列表 virtual scroll、route-level lazy loading/code split、Dashboard derived chart memoization 已補，正式版 12k/1.5k/300 大量資料 smoke 通過；仍需匯入 bulk 化 |
| UI/UX | 96% | 今日工作台、compact page shell、共用篩選工具列、空狀態、表單 footer、表單分段與批次選取列已覆蓋主要高頻/輔助流程，長表單 modal footer 也已收斂；下一步聚焦報表卡片與錯誤回饋 |
| 可維護性 | 94% | handoff/API/DB/pitfalls/runbooks、全功能測試矩陣、Playwright config、測試碼 typecheck、E2E auth helper/session cache refresh、shared permission matrix、前端共用 permission map、UI primitives、共用頁面骨架/工具列/空狀態/表單 footer/表單分段已補；仍需 Service/Repository 分層 |
