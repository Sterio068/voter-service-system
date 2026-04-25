# 選民服務系統 — 交接文件

這個資料夾包含讓新的 AI 或開發者接手本專案所需的所有文件。

## 📚 文件索引

| 檔案 | 用途 | 適合誰 |
|------|------|--------|
| **[HANDOFF.md](./HANDOFF.md)** | 主交接文件：系統本質、技術棧、架構、開發流程、發佈流程 | 第一份要讀的文件 |
| **[API_REFERENCE.md](./API_REFERENCE.md)** | 全部 205 個 API 端點完整列表 | 做前後端整合時 |
| **[DB_SCHEMA.md](./DB_SCHEMA.md)** | 41 張表的欄位、關係、索引、規則 | 改資料模型時 |
| **[DEVELOPMENT_PITFALLS.md](./DEVELOPMENT_PITFALLS.md)** | 踩過的 36 個坑 + 正確做法 | **改程式前務必讀** |
| **[ROADMAP.md](./ROADMAP.md)** | 接續開發優先順序、測試/資安/UI/UX 路線圖 | 規劃下一個 Sprint 時 |
| **[PHASE_EXECUTION.md](./PHASE_EXECUTION.md)** | Phase 1-4 已完成與下一步工作追蹤 | 長線推進與交接時 |
| **[FULL_SYSTEM_TEST_PLAN.md](./FULL_SYSTEM_TEST_PLAN.md)** | 全系統全功能測試矩陣、角色巡檢與缺陷記錄格式 | 實機登入後做全功能測試時 |

## 🧭 Runbooks

| 檔案 | 用途 |
|------|------|
| **[BACKUP_RESTORE.md](../runbooks/BACKUP_RESTORE.md)** | 備份、簽章驗證、還原與失敗處理 |
| **[DATA_PROTECTION.md](../runbooks/DATA_PROTECTION.md)** | 個資匯出、保存、稽核與疑似外洩處理 |
| **[DATA_QUALITY.md](../runbooks/DATA_QUALITY.md)** | 重複資料、孤兒附件、壞關聯資料修復流程 |
| **[RELEASE.md](../runbooks/RELEASE.md)** | 發布前驗證、版本、安裝檔 smoke test |
| **[INSTALL_TROUBLESHOOTING.md](../runbooks/INSTALL_TROUBLESHOOTING.md)** | macOS/Windows 安裝與啟動疑難排解 |
| **[INCIDENT_RESPONSE.md](../runbooks/INCIDENT_RESPONSE.md)** | P0/P1/P2 事故分級、復原與事後檢討 |

## 🚀 快速上手流程

1. 先讀 [HANDOFF.md](./HANDOFF.md) § 1-4（系統本質、技術棧、結構、開發環境）
2. 跑起來 dev 環境：`npm ci && npm run dev`
3. 讀 [HANDOFF.md](./HANDOFF.md) § 17（檔案閱讀順序）讀關鍵程式碼
4. 改 bug 前先 scan [DEVELOPMENT_PITFALLS.md](./DEVELOPMENT_PITFALLS.md)
5. 查 API 時翻 [API_REFERENCE.md](./API_REFERENCE.md)
6. 改 schema 時參考 [DB_SCHEMA.md](./DB_SCHEMA.md)
7. 安排工作優先序時參考 [ROADMAP.md](./ROADMAP.md)

## 🔗 其他資源

- GitHub repo: https://github.com/Sterio068/voter-service-system
- 使用者手冊: `docs/user-manual.html`
- 安裝指南: `docs/installation-guide.html`
- 維運 Runbooks: `docs/runbooks/`
- Release: https://github.com/Sterio068/voter-service-system/releases

## 最後狀態快照（2026-04-25）

- **版本**：v1.0.13
- **最後已發佈 tag**：`v1.0.12`
- **重大未處理事項**：
  - 自動化測試已建立可重建 SQLite API harness；目前覆蓋 auth、fresh-install 預設設定、permissions、voter/petition lifecycle、petition import/export、attachments、schedule conflict、consultation capacity、backup/restore、restore-on-startup、voter import/export、data retention、PII masking、secrets round-trip 與多個 security utility；CI 可跑 typecheck/test/build/audit，release workflow 另補 Playwright E2E 與 draft release gate
  - AI API key、Google Client Secret、LINE secrets、JWT secret 與 Google tokens 已加入 at-rest encryption；設定 API 不回傳完整 secret，JWT 與 generic secret round-trip 已有測試
  - API 已加入全域 rate limiting；登入與 LINE webhook 有較嚴格 route-level 限制
  - 已加入全域安全標頭/CSP；附件上傳改用 MIME allowlist + 基本檔頭驗證；備份還原會檢查 integrity 與必要 schema，本機備份已加入 metadata sidecar/HMAC 簽章
  - 後台已有資料品質掃描 API/入口，可回報重複手機/身分證、孤兒附件與關聯資料異常
  - Electron 機器綁定密碼已改由 `VOTER_SERVICE_VENDOR_PASSWORD` / `VENDOR_PASSWORD` 環境變數提供；未設定時正式版可啟動，但不啟用 vendor lock
  - Excel 套件已從 `xlsx` 換成 `@e965/xlsx`；選民匯出預設遮罩 PII，完整匯出需 admin + reason 並在 UI 以警示 Modal 收理由，選民與陳情匯入/匯出已有 integration test，仍需補團體匯入 round-trip
  - Playwright E2E smoke/navigation/role-access 已建立並跑通 Chromium：登入、Dashboard 今日工作台 deep-link、主要模組 compact page shell、全主要路由無 ErrorBoundary 崩潰、設定頁資料保留控制、UI 新增選民、UI 新增陳情、備份建立、完整匯出理由 Modal 與下載，以及 assistant / supervisor / volunteer 權限、列印路由與頁內 CRUD 按鈕巡檢；目前 smoke/navigation/role-access 共 18 條皆可通過
  - 2026-04-25 已完成正式版隔離驗收：fresh install 會正確 seed `first_run` / `office_name` / `idle_timeout`，且 `backup_path` 預設會跟隨 `BACKUPS_PATH`；pending restore 會在重啟時真正套用，正式版隔離驗收已跑通
  - 2026-04-25 已完成大量資料 smoke：隔離正式版在 12,000 筆選民、1,500 筆陳情、300 筆行程下，API 查詢仍維持毫秒級回應，列表頁可正常開啟與顯示總數
  - 2026-04-25 已補 `VendorPage` / `ProposalsPage` 長表單 Modal scrollable body，正式版 1280×768 視窗下不再看不到主要操作按鈕
  - 2026-04-25 已補 restore-on-startup rollback：若 pending restore 套用失敗，系統會回復原主 DB、保留 `*.restore.failed-*`，正式版會顯示「還原未套用」提示，而不是直接把主資料庫留在不確定狀態
  - 2026-04-25 已補 voters merge completeness：`voter_activity_history` 會跟著轉移、`voter_engagement` 會做欄位級合併，duplicate `group_members` / `event_participants` 不再導致 merge rollback
  - 2026-04-25 Electron main process 已補本機 Fastify watchdog；連續 health check 失敗時會嘗試自動重啟，且 scheduler 已做 idempotent 防重複啟動
  - 2026-04-25 首次執行精靈已改為必須完成管理員密碼修改後才能結束，不再允許略過或在修改失敗時靜默進入完成步驟；`/api/admin/settings` 也會阻擋預設密碼仍為 `admin123` 時把 `first_run=false`
  - 2026-04-25 `/api/client-errors` 已改為僅登入後客戶端可寫入，前端全域錯誤上報也只會在本機已有 JWT session 時送出，避免匿名寫入
  - 2026-04-25 `DELETE /api/voters/:id/anonymize` 已與資料保留匿名化規則統一：會清主檔延伸欄位與 tags/topics/relations/engagement 等關聯；`mode=full` 另外會去識別 contact / petition / consultation / survey / ceremony 的歷史快照，相關 integration test 已補齊
  - 2026-04-25 已完成最新版正式包本機 smoke：`/Applications/選民服務系統.app` 可正常啟動，`/api/health` 回 `ok`；正式包內匿名 `POST /api/client-errors` 會回 `401`、登入後可回 `200`，且建立臨時選民後執行 `mode=full` 匿名化會實際清空 `mobile / phone / line_id / company / note / household_*`
  - 前端主路由已改用 `React.lazy` + `Suspense` 拆成 route-level chunks，降低初始載入壓力
  - Dashboard 已重構為 Today Command Center 今日工作台；新增 `PageScaffold`、`WorkspaceToolbar`、`EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar`、`MetricCard`、`ActionQueue` 作為 UI/UX 重構基礎，主要業務/後台/報表/列印/輔助頁已統一套用 compact page shell、共用篩選工具列、空狀態、表單 footer 與表單分段
  - 前端主路由、導覽、Dashboard 快速入口與快捷鍵已改用共用 permission map 收斂，避免未授權角色看到不該進入的模組或被 deep-link 帶入受限頁面
  - 新增 `shared/permissions.ts` 作為前後端共用 RBAC 基線；E2E session helper 會先用快取 token 再透過 `/api/auth/me` 刷新目前角色，避免測試被 stale session 汙染
  - 報表、稽核、類別頁已補 read-only / manage 分層，assistant 可查看 reports/categories，supervisor 可查看 audit logs，類別編輯按鈕則只對實際擁有 categories mutation 權限的角色顯示
  - `ceremonies`、`expenses` 與三個 import template API 已補齊後端權限；禮儀與收支頁面也改成 read-only / manage 分層，assistant 只看不改、volunteer 不再看到收支統計
  - production audit 已清零；完整 audit 仍有 Vite 5/esbuild dev-only moderate，需規劃 Vite major upgrade
  - 文件已對齊正式版提供方式：production 前端不是 `file://`，而是由 Fastify 在 `http://127.0.0.1:8080` 提供 built assets
