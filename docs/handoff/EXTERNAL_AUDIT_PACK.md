# External Audit Pack

這份文件是給「其他 AI / 外部顧問 / 第三方審計者」使用的完整審計入口。目標是讓對方不需要先問一輪背景，就能直接開始做架構、資安、個資、程式品質、業務邏輯、可靠性、效能與可維護性審計。

## 1. 審計目標

請以「**實際 source code 與文件**」作為唯一真相來源，不要只依賴舊規格或口述描述。

本系統已進入可交付前收斂階段，審計重點不是只找顯而易見的 bug，而是：

- 找出仍可能阻擋正式交付的高風險缺口
- 驗證目前資安與個資保護是否足以支撐選民資料系統
- 檢查文件、實作、測試與安裝包行為是否一致
- 區分「已修正並被測試覆蓋」與「仍待處理」的項目

## 2. 系統快照

- 系統名稱：選民服務系統（Voter Service System）
- 版本：`v1.0.8`
- 類型：Electron 桌面應用 + 本機 Fastify API + SQLite
- 部署型態：單機本地端 / 區網共用後端
- 前端：React 18 + TypeScript + Ant Design 5 + Vite 5
- 後端：Fastify 5 + better-sqlite3 + Zod
- 桌面：Electron 41
- 資料庫：SQLite（WAL）
- 打包：electron-builder

重要提醒：

- 舊規格曾提到 `node:sqlite`，**但目前實際 source code 已是 `better-sqlite3`**。
- 審計時請以 [package.json](/Users/sterio/Workspace/選務系統/voter-service-system/package.json) 與 source code 為準。

## 3. 建議上傳範圍

### 最小審計集

若外部 AI 有 token / context 限制，至少上傳：

- [README.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/README.md)
- [HANDOFF.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/HANDOFF.md)
- [API_REFERENCE.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/API_REFERENCE.md)
- [DB_SCHEMA.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DB_SCHEMA.md)
- [DEVELOPMENT_PITFALLS.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DEVELOPMENT_PITFALLS.md)
- [PHASE_EXECUTION.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/PHASE_EXECUTION.md)
- [FULL_SYSTEM_TEST_PLAN.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/FULL_SYSTEM_TEST_PLAN.md)
- [package.json](/Users/sterio/Workspace/選務系統/voter-service-system/package.json)
- [server/index.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/index.ts)
- [server/db/migrate.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/db/migrate.ts)
- [server/db/index.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/db/index.ts)
- [server/db/restoreOnStartup.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/db/restoreOnStartup.ts)
- [server/middleware/auth.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/middleware/auth.ts)
- [server/routes/auth.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/auth.ts)
- [server/routes/admin.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/admin.ts)
- [server/routes/backup.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/backup.ts)
- [server/routes/voters.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/voters.ts)
- [server/routes/petitions.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/petitions.ts)
- [server/routes/documents.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/documents.ts)
- [server/routes/schedules.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/schedules.ts)
- [server/routes/importExport.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/importExport.ts)
- [server/utils/secrets.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/secrets.ts)
- [server/utils/securityHeaders.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/securityHeaders.ts)
- [server/utils/fileSecurity.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/fileSecurity.ts)
- [server/utils/piiMasking.ts](/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/piiMasking.ts)
- [electron/main.ts](/Users/sterio/Workspace/選務系統/voter-service-system/electron/main.ts)
- [electron/security.ts](/Users/sterio/Workspace/選務系統/voter-service-system/electron/security.ts)
- [client/App.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/App.tsx)
- [client/pages/LoginPage.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/LoginPage.tsx)
- [client/pages/Dashboard.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/Dashboard.tsx)
- [client/pages/admin/SettingsPage.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/admin/SettingsPage.tsx)
- [client/pages/voters/VoterListPage.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/voters/VoterListPage.tsx)
- [client/pages/petitions/PetitionListPage.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/petitions/PetitionListPage.tsx)
- [client/components/FirstRunWizard.tsx](/Users/sterio/Workspace/選務系統/voter-service-system/client/components/FirstRunWizard.tsx)
- [shared/permissions.ts](/Users/sterio/Workspace/選務系統/voter-service-system/shared/permissions.ts)
- [tests/server/apiIntegration.test.ts](/Users/sterio/Workspace/選務系統/voter-service-system/tests/server/apiIntegration.test.ts)
- [tests/server/restoreOnStartup.test.ts](/Users/sterio/Workspace/選務系統/voter-service-system/tests/server/restoreOnStartup.test.ts)
- [e2e/smoke.spec.ts](/Users/sterio/Workspace/選務系統/voter-service-system/e2e/smoke.spec.ts)
- [e2e/navigation.spec.ts](/Users/sterio/Workspace/選務系統/voter-service-system/e2e/navigation.spec.ts)
- [e2e/role-access.spec.ts](/Users/sterio/Workspace/選務系統/voter-service-system/e2e/role-access.spec.ts)

### 完整審計集

若外部 AI 可以吃整個專案，建議直接上傳或掛載整個 repo，至少包含：

- `docs/`
- `server/`
- `client/`
- `electron/`
- `shared/`
- `tests/`
- `e2e/`
- `package.json`
- `vite.config.ts`
- `playwright.config.ts`

## 4. 文件閱讀順序

建議外部 AI 依這個順序讀：

1. [README.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/README.md)
2. [HANDOFF.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/HANDOFF.md)
3. [PHASE_EXECUTION.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/PHASE_EXECUTION.md)
4. [API_REFERENCE.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/API_REFERENCE.md)
5. [DB_SCHEMA.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DB_SCHEMA.md)
6. [DEVELOPMENT_PITFALLS.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DEVELOPMENT_PITFALLS.md)
7. [FULL_SYSTEM_TEST_PLAN.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/FULL_SYSTEM_TEST_PLAN.md)
8. `server/`、`electron/`、`client/`、`shared/`
9. `tests/`、`e2e/`

## 5. 審計重點

請特別關注以下面向：

### 資安

- JWT / secret 管理
- 本機資料保護與 at-rest encryption 邊界
- CORS / CSP / security headers
- rate limiting
- Electron attack surface
- 備份下載 / 上傳 / 還原流程
- 路徑穿越、任意檔案讀寫、附件驗證

### 個資與合規

- 敏感欄位儲存、遮罩、匯出
- 操作稽核是否足夠
- 資料保留政策
- 軟刪、匿名化、備份與還原的個資風險

### 程式品質

- 型別安全
- migration 與 seed 邏輯
- route / UI / docs 契約一致性
- 權限矩陣是否前後端一致
- 測試覆蓋的盲區

### 業務邏輯

- 案號 / 文號遞增
- 跨日行程與衝突檢查
- 匯入匯出一致性
- 選民合併 / 軟刪 / 稽核
- 首次執行精靈與正式版部署路徑

### 可靠性與交付

- fresh install 是否真的可用
- 還原後重啟是否真的套用
- 備份 sidecar / metadata / 簽章是否可信
- 大資料量下列表、查詢與 UI 能否穩定工作
- 安裝包是否足以正式交付

## 6. 已知已完成項目

這些不是要外部 AI 忽略，而是要它驗證「是否真的完成、是否還有殘留風險」：

- `settings` secrets 已做 at-rest encryption
- 全域 rate limiting 已加上
- CSP / security headers 已加上
- 附件 MIME + magic-byte 基本驗證已加上
- 備份會產生 `.meta.json` 簽章 sidecar
- restore upload 會做 integrity + schema 驗證
- pending restore 會在重啟時真正套用
- fresh install 會 seed `first_run` / `office_name` / `idle_timeout` / `backup_path`
- 前後端共用 RBAC 基線在 `shared/permissions.ts`
- E2E 已覆蓋 smoke / navigation / role access
- 正式版隔離驗收已跑過 fresh install、restore-on-restart、大量資料 smoke

## 7. 已知仍可能是風險的地方

這些是外部 AI 應該優先 challenge 的區塊：

- macOS 安裝檔尚未 code sign / notarize
- SQLite 本體未做 DB-level encryption
- 區網部署模式下仍缺 HTTPS / mTLS 之類的傳輸保護
- 部分列表與匯入流程仍有進一步效能優化空間
- 文件與實作可能仍存在局部漂移

## 8. 目前驗證狀態

最近一輪已完成：

- `npm run verify`
- `npm run test:e2e -- --project=chromium e2e/smoke.spec.ts e2e/navigation.spec.ts e2e/role-access.spec.ts`
- `npm run dist:mac`
- 正式版隔離 fresh install 驗收
- 正式版隔離 restore-on-restart 驗收
- 正式版隔離 load smoke：`12,000` 選民 / `1,500` 陳情 / `300` 行程

## 9. 期望審計輸出

請外部 AI 至少回覆：

1. Executive summary
2. 前 10 大立即處理風險
3. 逐面向完整審計結果
4. 每項風險的等級、原因、影響面與具體修法
5. 是否適合處理含個資的選民資訊系統
6. 是否達到可交付 / 可上線 / 僅限內部試運行
7. 30 / 60 / 90 天改善路線圖

## 10. 搭配提示詞

請直接搭配這份提示詞使用：

- [EXTERNAL_AUDIT_PROMPT.md](/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/EXTERNAL_AUDIT_PROMPT.md)
