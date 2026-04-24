# External Audit Prompt

請你扮演「**資深軟體架構師 + 資安工程師 + 個資保護審計顧問**」，對我提供的專案做**完整、嚴格、可落地的正式審計**。

## 你的任務

你要審計的是一套台灣服務處使用的「選民服務系統（Voter Service System）」桌面應用。這個系統處理選民個資、陳情案件、公文、行程、禮儀、通知、問卷、報表、備份與還原，因此請用**高敏感資料系統**的標準審視。

請務必：

- 以**實際 source code 與文件**為準，不要只依賴口述規格
- 先讀文件，再對照實作與測試
- 清楚區分「已驗證事實」與「你的推論」
- 如果文件、測試、程式碼三者不一致，請明確點出
- 優先找出**阻擋正式交付**或**造成個資/營運風險**的問題
- 不要給泛泛建議；所有建議都要盡量綁定到實際檔案、模組、流程或測試缺口

## 專案背景

- 系統名稱：選民服務系統（Voter Service System）
- 版本：`v1.0.8`
- 類型：Electron 桌面應用，本機 Fastify API + SQLite
- 前端：React 18 + TypeScript + Ant Design 5 + Vite 5
- 後端：Fastify 5 + better-sqlite3 + Zod
- 桌面：Electron 41
- DB：SQLite（WAL）
- 打包：electron-builder
- 使用情境：本地單機 / 區網共用後端，處理選民個資與服務處日常業務

## 專案根目錄與檔案位置

如果你可以直接讀取本機工作區，請以這個專案根目錄為基準：

- 專案根目錄：`/Users/sterio/Workspace/選務系統/voter-service-system`

關鍵文件位置：

- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/README.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/HANDOFF.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/API_REFERENCE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DB_SCHEMA.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DEVELOPMENT_PITFALLS.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/PHASE_EXECUTION.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/FULL_SYSTEM_TEST_PLAN.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/EXTERNAL_AUDIT_PACK.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/runbooks/BACKUP_RESTORE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/runbooks/RELEASE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/package.json`

關鍵程式碼位置：

- `/Users/sterio/Workspace/選務系統/voter-service-system/server/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/electron/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/shared/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/tests/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/e2e/`

高優先度後端檔案：

- `/Users/sterio/Workspace/選務系統/voter-service-system/server/index.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/db/index.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/db/migrate.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/db/restoreOnStartup.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/middleware/auth.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/auth.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/admin.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/backup.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/voters.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/petitions.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/documents.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/schedules.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/routes/importExport.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/secrets.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/securityHeaders.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/fileSecurity.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/server/utils/piiMasking.ts`

高優先度桌面與前端檔案：

- `/Users/sterio/Workspace/選務系統/voter-service-system/electron/main.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/electron/security.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/App.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/components/FirstRunWizard.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/LoginPage.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/Dashboard.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/admin/SettingsPage.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/voters/VoterListPage.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/pages/petitions/PetitionListPage.tsx`
- `/Users/sterio/Workspace/選務系統/voter-service-system/shared/permissions.ts`

高優先度測試檔案：

- `/Users/sterio/Workspace/選務系統/voter-service-system/tests/server/apiIntegration.test.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/tests/server/restoreOnStartup.test.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/e2e/smoke.spec.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/e2e/navigation.spec.ts`
- `/Users/sterio/Workspace/選務系統/voter-service-system/e2e/role-access.spec.ts`

重要：

- 舊規格可能提過 `node:sqlite`，但請以目前 source code 與 `package.json` 為準，**實際實作是 `better-sqlite3`**
- 此系統已完成一輪交付前收斂，請你判斷它目前是：
  - 可正式交付
  - 僅可內部試運行
  - 仍不適合處理真實個資

## 請先閱讀的內容

至少先讀：

- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/README.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/HANDOFF.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/API_REFERENCE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DB_SCHEMA.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/DEVELOPMENT_PITFALLS.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/PHASE_EXECUTION.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/handoff/FULL_SYSTEM_TEST_PLAN.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/runbooks/BACKUP_RESTORE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/docs/runbooks/RELEASE.md`
- `/Users/sterio/Workspace/選務系統/voter-service-system/package.json`

然後請對照以下程式碼區塊：

- `/Users/sterio/Workspace/選務系統/voter-service-system/server/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/client/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/electron/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/shared/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/tests/`
- `/Users/sterio/Workspace/選務系統/voter-service-system/e2e/`

## 你要審計的面向

請至少逐一審計這些面向：

1. 資安
2. 個資保護 / GDPR / 個資法風險
3. 權限控制 / RBAC / privilege escalation
4. 程式碼品質與型別安全
5. 架構一致性與模組邊界
6. 業務邏輯正確性
7. 備份 / 還原 / 災難復原
8. Electron 與桌面發佈安全
9. 測試完整性與測試盲區
10. 效能與大量資料可用性
11. 可靠性與交付風險
12. 文件、實作、測試三方一致性
13. 是否適合處理含個人資料的選民資訊系統

## 你應特別留意的關鍵點

請特別檢查：

- JWT / secret 管理是否足夠
- 備份 sidecar / metadata / restore-on-restart 是否可信
- fresh install 是否真的可用
- `first_run`、`backup_path`、初始化 seed 是否正確
- pending restore 是否真的在重啟後套用
- 設定頁對 secret 是否有遮罩與安全存取邊界
- Electron `contextIsolation`、`nodeIntegration`、preload IPC 暴露面
- SQLite / 備份 / 附件 / 匯出是否會造成個資外洩
- 匯入匯出、列印、完整匯出是否有權限與稽核缺口
- 前端按鈕可見性、前端 route guard、後端 permission middleware 是否一致
- 列表大資料量下 UI 與 API 是否有明顯瓶頸
- 測試是否真的覆蓋高風險流程，而不是只做 happy path
- 安裝包是否達到正式交付標準，還是仍有 release engineering 缺口

## 請你用這個格式回覆

### A. Executive Summary

用 5-10 句話總結：

- 系統目前成熟度
- 最大的風險是什麼
- 是否適合正式交付

### B. 立即需要處理的前 10 項

請列出：

- `風險等級`：`[嚴重/高/中/低/建議]`
- `標題`
- `影響`
- `依據`
- `修正建議`

### C. 完整審計結果

請按面向分節：

- 資安
- 個資保護
- 程式碼品質
- 架構
- 業務邏輯
- 備份還原
- 測試
- 效能
- 可靠性
- 可維護性
- 發佈與交付

每個 finding 都請包含：

- `風險等級`
- `問題說明`
- `影響範圍`
- `涉及檔案`
- `修正建議`

若可以，請盡量給：

- 檔案路徑
- 函式名稱
- API 路由
- 相關測試名稱

### D. 已驗證做得不錯的地方

不要只找缺點，也請指出目前實作中做得好的部分，尤其是：

- 已經有測試保護的設計
- 已經明顯優於一般小型內部系統的做法
- 已經接近交付標準的區塊

### E. 是否適合處理真實選民個資

請明確給結論，只能三選一：

1. `適合正式處理真實個資`
2. `僅適合內部試運行 / 受控環境`
3. `目前不建議處理真實個資`

並說明原因。

### F. 交付判定

請明確判定：

- 是否可交付給內部正式使用
- 是否可交付給外部客戶部署
- 若不可，最少還需要補哪些項目

### G. 改進路線圖

請給：

- 7 天內立即修正
- 30 天內中短期改善
- 60-90 天內長期架構演進

## 審計原則

- 如果你不能從檔案中直接證明，請標記為「推論」
- 如果某項風險已被測試或近期修正覆蓋，也請明確註記，不要誤判成未處理
- 如果你發現「文件說有，但程式碼沒有」或「測試有，但正式版流程仍可能失敗」，請視為高價值 finding
- 請嚴格，但要務實；避免提出與這個專案規模完全不相稱的空泛 enterprise 建議

最後，請以**繁體中文**輸出。
