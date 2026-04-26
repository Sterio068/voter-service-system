# 選民服務系統 — 接續開發 Roadmap

**基準版本**：v1.0.17（2026-04-25）
**定位**：Electron 本地桌面端選民／陳情／公文／禮儀管理系統。核心資料在單機 SQLite，外部整合包含 Google Calendar、LINE、AI provider。

本 Roadmap 依目前交接文件整理，目標是讓下一位開發者先補齊交付、穩定與品質基線，再擴充高價值工作流。優先順序：**P0 交付阻斷與穩定 → P1 核心體驗與流程完整度 → P2 維運與進階能力**。

---

## P0：必做交付與穩定基線

### 1. 建立自動化測試骨架 ✅ v1.0.17

- ✅ 已新增 `npm test`，使用 Node 內建 test runner 搭配既有 `tsx` 執行 TypeScript 測試。
- ✅ 已新增 `npm run typecheck` / `npm run verify`，CI 與 release workflow 會跑 typecheck、`npm test`、production audit；CI 也跑 build。
- ✅ 已建立 `tests/helpers/apiTestServer.ts`，每次 API integration test 使用暫存 `DATA_PATH` / `BACKUPS_PATH`。
- ✅ 85 個後端測試已涵蓋：登入、權限阻擋、選民新增/軟刪/audit、陳情 lifecycle/audit、陳情 import/export、附件 PDF、行程衝突、法律諮詢容量、備份簽章、restore marker、選民匯出、Excel import、data retention、secrets round-trip。
- ✅ 31 條 E2E smoke/navigation/role-access 已涵蓋：登入、Dashboard、主要模組、角色權限矩陣、列印路由、頁內 CRUD 按鈕、資料保留設定、備份與匯出流程。
- ✅ 測試碼 typecheck 已納入品質門檛。

### 2. 移除明文與硬編碼秘密 ✅ v1.0.14+

- ✅ Electron 機器綁定密碼已從程式碼移到環境變數。
- ✅ AI/Google/LINE secrets 已加入 at-rest encryption 與 round-trip 測試。
- ✅ 設定頁顯示遮罩值，不回傳秘密原文到前端。
- ✅ JWT secret 解密失敗會中止啟動。
- ⚠️ Google/LINE/AI 設定路由仍需補 route-level 整合測試。

### 3. 修補已知依賴與清理風險檔案 ✅ v1.0.14+

- ✅ CVE `xlsx` 已替換為 `@e965/xlsx`。
- ✅ `server/` 舊 `.js` 編譯產物已清除。
- ✅ `npm audit` 納入 release 驗證流程。
- ✅ production audit 已清零。
- ✅ 死代碼（v1.0.17）、unused imports 已清理。

### 4. 鞏固 API 驗證與錯誤回饋 ✅ v1.0.14-17

- ✅ 所有 Zod schema 支援 `.nullable().optional()`；前端過濾 null/undefined/空字串。
- ✅ 全域 rate limiting + route-level 限制（登入、LINE、附件、備份）。
- ✅ 全域 CSP / security headers。
- ✅ 附件 MIME allowlist、檔頭驗證、路徑防穿越。
- ✅ 備份簽章驗證、完整性檢查、restore rollback、目錄白名單。
- ✅ 資料品質掃描 API + 設定頁入口。
- ✅ 資料保留 API + TTL 封存/清理/去識別。
- ⚠️ 下一步：備份 ZIP 下載、資料品質一鍵修復、Google/LINE/AI route-level secrets。

---

## P1：核心功能與 UI/UX 完整度

### 1. 選民與陳情工作流

- 強化「新增陳情時同步建立／連結選民」流程：重複電話、身分證、姓名相近時給合併或連結提示。
- 將陳情 SLA 狀態（綠／黃／橘／紅）在列表、詳情、Dashboard 保持一致。
- 補齊陳情轉派、追蹤、滿意度、待辦聯動的操作紀錄與稽核記錄。
- 選民合併後要驗證 petitions、contacts、tasks、events、survey responses 等關聯資料都正確改指向。
- 選民列表完整匯出已改為 admin-only 警示 Modal，必填理由後才會呼叫完整個資匯出；一般匯出固定遮罩。
- 前端主路由已改用 route-level lazy loading，Dashboard、選民、陳情、行程、報表、設定等頁面會拆成獨立 chunks，避免首次載入一次吞下所有頁面。
- Dashboard 已重構成「Today Command Center」今日工作台，集中待分派、逾期、待回訪、今日行程、待辦完成度、近期案件、生日關懷與服務健康。
- 已新增 `PageScaffold`、`WorkspaceToolbar`、`EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar`、`MetricCard`、`ActionQueue` 作為 UI/UX 重構基礎；主要列表、詳情、後台、報表、列印、公文、行程、提案、禮儀、電話拜訪、員工交接與使用說明頁已套用 compact page shell、共用篩選工具列、空狀態、表單 footer、表單分段與批次選取列。
- 前端主路由、側邊欄、行動版導覽、Dashboard 快速操作與 `Ctrl+N` / `Ctrl+Shift+V` / `Ctrl+T` 等快捷鍵，已統一走共用 permission map，避免 UI 顯示、deep-link 與實際權限矩陣不一致。
- 已新增 shared permission matrix，前端頁面功能權限與頁內 CRUD/批次操作改分層處理；`PrintVoterListPage`、`PrintLabelPage`、`PetitionStatsPage` 與 `VoterListPage` / `PetitionListPage` / `TasksPage` 的操作按鈕已收斂到同一套 RBAC 判斷。
- `ReportsPage`、`AuditLogPage`、`CategoryPage` 已往 read-only / manage 雙層權限收斂；assistant 現可查看報表與類別定義，supervisor 現可查看稽核紀錄，類別實際編輯權限則維持跟後端一致。
- `ceremonies`、`expenses` 與匯入範本下載 API 已補回後端權限檢查；`CeremonyPage`、`ExpensePage` 已改為依 module permission 顯示操作按鈕與收支資訊，避免出現「按得到但 API 403」的假操作。
- `TasksPage` 支援 `/tasks?focus=today`，Dashboard 與快捷鍵可穩定 deep-link 到今日焦點。

### 2. 公文、行程、法律諮詢與禮儀

- 公文收文／發文字段使用 `hidden` 保留表單值，避免條件渲染造成資料消失。
- 行程新增／更新時，Google Calendar 同步失敗不得阻擋主操作，但要有可追蹤錯誤與手動重試入口。
- 法律諮詢預約需維持 IMMEDIATE transaction 防超額；同一時段容量限制已有 integration test 覆蓋。
- 禮儀、廠商、支出權限需與 `rolePermissions` 保持同步，避免新頁面出現 403。

### 3. UI/UX 可用性整理

- 動態類別欄位如陳情類別、團體類別、行程類型，options 可能為空時用 `AutoComplete` 或 `Input`，不要用空 `Select showSearch`。
- 所有列表頁保留搜尋、篩選、分頁與返回後狀態，並優先使用 `WorkspaceToolbar` 收斂搜尋、篩選、統計與次要操作。
- 表格空狀態優先使用 `EmptyState`，Drawer/表單底部優先使用 `FormFooter`，長表單內容優先使用 `FormSection` 分段，批次選取操作優先使用 `SelectionActionBar`。
- Mobile `< 768px` 的底部 Tab 需覆蓋主要工作流：選民、陳情、行程、待辦、搜尋。
- 全域搜尋 Ctrl+K 結果需標示模組、狀態與可直接跳轉的目標。
- 匯入流程已提供 dry-run 結果與錯誤原因；下一步補新增/更新分類統計與 CSV 錯誤報告下載。

### 4. 後台與維運功能

- 後台系統健康頁補 DB size、備份狀態、最後備份時間、audit log 數量、前端錯誤數。
- 備份還原流程需在 UI 顯示 `PRAGMA integrity_check` 與 schema 驗證結果；不可只顯示成功。
- 每日日誌可自動帶入當日新增案件、完成案件、未完成交接事項，但允許人工編輯。
- 前端 `client_errors` 應能依日期、使用者、頁面篩選，方便排查安裝版問題。

---

## P2：進階能力與長期維護

### 1. 報表與洞察

- Dashboard 已整理成今日工作台；下一步將進階報表中的承辦負荷、資料品質與備份健康逐步轉為可操作的管理卡片。
- 對報表端點加快取或索引檢查，避免 10 萬選民資料量下卡頓。
- 活動 ROI、區域滲透、關鍵意見領袖等報表需明確定義計算口徑，避免同名指標不同算法。

### 2. 匯入匯出與資料治理

- 建立匯入欄位對照與錯誤報告標準，讓使用者可修正後重傳。
- 選民匯出已預設遮罩身分證、電話、生日、LINE、Email、地址等 PII；完整個資匯出需 admin + reason，並寫入 audit detail。
- 資料保留政策已支援 TTL：舊 audit 封存、舊 client_errors 刪除、停用選民去識別化。
- 補資料清理工具：重複選民、無效電話、缺行政區、壞 JSON、孤兒附件；資料品質修復流程已記錄於 `docs/runbooks/DATA_QUALITY.md`。

### 3. 發佈與安裝體驗

- Release CI 跑順序固定為 `verify`（typecheck + test + build + production audit）→ Playwright E2E（chromium）→ Mac/Windows 兩平台 build → 全部成功才開 draft Release，避免半套產物先公開。
- 正式包啟動時會由 Electron main 拉起 Fastify 在 `http://127.0.0.1:8080` 提供 `dist/` built assets 與 `/api/*`；驗收 release 時需以 `127.0.0.1:8080` 為準，不要再以 `file://` 模式假設路徑。
- 本機 packaged smoke 至少要驗 `/api/health=ok`、admin 登入、選民列表載入、匿名 `client-errors` 被擋、`mode=full` 匿名化會實際清欄位（v1.0.13 已驗，下版需照樣補）。
- 長期規劃 Apple Developer 簽署與 notarize，降低 macOS Gatekeeper 阻擋。
- Windows 版維持由 GitHub Actions `windows-latest` build，不從 macOS cross-compile。
- Release 前檢查 tag、版本號、Mac/Windows 安裝檔、portable 版與 release notes。
- 安裝版疑難排解流程已記錄於 `docs/runbooks/INSTALL_TROUBLESHOOTING.md`。

### 4. 架構觀察點

- 單機 SQLite 目標資料量為 10 萬選民與 1 萬案件；接近上限時再評估分區或 Postgres。
- 維持離線優先；AI、Google Calendar、LINE 都只能是加值功能，不能影響核心 CRUD。
- 新增模組時優先沿用 categories、attachments、audit_logs、rolePermissions，不重造平行機制。

---

## 測試策略

### 測試分層

- **Unit**：工具函式、Zod schema、時間格式、JSON parse fallback、權限判斷、序號產生。
- **Integration**：Fastify routes + 測試 DB，覆蓋 transaction、soft delete、audit log、import/export、schedule overlap、consultation capacity、backup verify。
- **E2E**：Playwright 跑 dev server，覆蓋登入、Dashboard deep-link、主要模組 compact shell、全主要路由 navigation、設定頁、選民新增、陳情新增、備份建立、完整匯出理由與下載，以及 assistant / supervisor / volunteer 角色權限、列印路由與頁內 CRUD 按鈕巡檢。
- **Manual smoke**：安裝版 Mac/Windows 啟動、登入、建資料、備份、匯出、重開後資料仍在。

### 第一批測試案例

- Auth：登入成功、密碼錯誤、停用帳號、JWT 過期、權限不足回 403。
- Voters：新增、更新含 null 欄位、軟刪、匿名化、重複偵測、合併與合併稽核。
- Petitions：已覆蓋新增含新選民、狀態更新、處理紀錄、匯入匯出與稽核；下一步補轉派產生待辦／通知、逾期計算。
- Schedules：已覆蓋跨日查詢、新增衝突偵測、更新衝突偵測；下一步補 Google Calendar 同步失敗不阻擋的 mock 測試。
- Consultations：已覆蓋同一時段額滿保護；下一步補真正並發壓測或 transaction-level race 測試。
- Backup：已覆蓋建立備份、metadata 簽章驗證、valid/invalid restore marker；下一步補下載 header、signed restore metadata 匯入 UX 與多行 integrity 錯誤判斷。

### 測試品質門檻

- P0 完成前：至少核心後端路由有可重跑測試，CI 能執行。
- P1 完成前：核心 CRUD 與 5 條以上 E2E 關鍵流程穩定。
- Release 前：TypeScript client/server/electron/test 檢查、`npm run verify`、`npm run test:e2e -- --project=chromium`、全功能人工測試矩陣重點場景全部通過。
- 目標覆蓋率 80% 以上；短期不足時，至少覆蓋 auth、permissions、voters、petitions、backup、import/export。

---

## 資安優先事項

1. 秘密不得硬編碼或明文儲存：包含授權密碼、AI API key、Google OAuth secret/token、LINE secret/token。
2. 所有使用者輸入以 Zod 或明確 schema 驗證，且允許 Antd 清空欄位送出的 `null`。
3. SQLite 查詢維持 prepared statements，不拼接使用者輸入。
4. 匯入檔案需限制大小、格式、欄位、錯誤列數量，避免記憶體暴增。
5. 附件維持 20MB 與白名單 MIME，下載需檢查權限與路徑穿越。
6. 匯出、列印、匿名化、合併、刪除、還原備份都必須寫 audit log。
7. 公開端點如 LINE webhook、Google OAuth callback、client-errors 需限制可接受資料與錯誤訊息。
8. 錯誤回應不得洩漏 token、檔案絕對路徑、SQL、stack trace 或完整秘密。

---

## 驗證清單

### 開發完成後

- [ ] `npx tsc -p tsconfig.json --noEmit`
- [ ] `npx tsc -p tsconfig.server.json --noEmit`
- [ ] `npx tsc -p tsconfig.electron.json --noEmit`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm audit` 或記錄無法修補項目的風險說明

### 功能驗證

- [x] 前端 admin、supervisor、assistant、volunteer 導覽、受限路由與快捷鍵權限符合預期，後續待補更多細部模組動作驗證。
- [ ] 新增／編輯表單清空欄位不會因 `null` 造成 400。
- [ ] 新增、更新、刪除、匯出、匯入、合併、匿名化都有稽核紀錄。
- [ ] 軟刪資料不出現在一般列表與搜尋結果。
- [ ] 備份檔可通過完整性檢查；還原前有清楚確認與錯誤提示。
- [ ] Electron production 由 Fastify 在 `http://127.0.0.1:8080` 提供 built assets：首頁、SPA 路由刷新、附件下載、`/api/health` 都應走同一 origin（不再是 `file://`）。
- [ ] 正式包本機 smoke：`/api/health=ok`、admin 登入、選民列表、匿名 `client-errors` 401、登入後 200、`mode=full` 匿名化清欄位都通過。

### Release 前

- [ ] `package.json` 版本號已更新。
- [ ] Mac DMG 可安裝並啟動；若未簽署，使用者文件有 Gatekeeper 繞過說明。
- [ ] Windows 安裝檔由 CI 或 Windows 環境產出，不在 macOS cross-compile。
- [ ] Release notes 包含新功能、修正、已知限制、資料庫 migration 注意事項。
- [ ] 已確認安裝版資料庫路徑、備份路徑、log 路徑符合文件。
- [ ] CI release workflow：verify → Playwright E2E → Mac/Win build → draft release 全鏈通過，沒有單一平台先公開的情況。
- [ ] 至少在一台 macOS 與一台 Windows 完成本機 packaged smoke：`http://127.0.0.1:8080` 可載入主介面、`/api/health=ok`、admin 登入、選民列表、`mode=full` 匿名化都正常。

---

## 開發守則摘要

- 寫入 SQLite 時間統一用 `datetime('now','localtime')`。
- 寫入交易用 `db.transaction(...).immediate()`；不要在 transaction callback 裡使用 async。
- JSON TEXT 欄位讀取一定要 try-catch。
- 新 CRUD 模組要同步更新 DB migration、route 註冊、rolePermissions、前端路由、導覽、audit log、測試。
- 表單條件顯示用 `hidden` 保留 `Form.Item`，不要用條件渲染造成值消失。
- 新增 mutation 後確認跨視窗資料同步會刷新相關頁面。
