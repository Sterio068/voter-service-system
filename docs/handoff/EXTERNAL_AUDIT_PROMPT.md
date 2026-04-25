# External Audit Prompt

請你扮演「**交付前最終審計 AI**」，對我提供的專案做**完整、嚴格、可落地的正式審計**。

## 你的任務

你要審計的是一套台灣服務處使用的「選民服務系統（Voter Service System）」桌面應用。這個系統包含選民、陳情、公文、行程、禮儀、通知、問卷、報表、備份與還原等模組。

這次審計的主軸不是法遵作文，也不是只列安全清單，而是要找出：

- 阻擋正式交付的問題
- 會造成資料錯亂、權限錯位、流程斷裂、安裝或發版失敗的問題
- 測試、CI/CD、release、UI/UX、可靠性、文件一致性的真缺口
- 需要立即修正的 `P0 / P1`
- 可以接受但必須明確標記的已知風險

請務必：

- **直接讀取本機檔案**，不要要求我貼內容；以下會提供絕對路徑
- 以**實際 source code 與文件**為準，不要只依賴口述規格
- 先讀文件，再對照實作與測試
- 清楚區分「已驗證事實」與「你的推論」
- 如果文件、測試、程式碼三者不一致，請明確點出
- 優先找出**阻擋正式交付**或**造成營運/驗收風險**的問題
- 不要給泛泛建議；所有建議都要盡量綁定到實際檔案、模組、流程或測試缺口
- 除非某個安全/個資問題會**直接阻擋交付**，否則不要把它當成這次審計的主軸

## 專案背景

- 系統名稱：選民服務系統（Voter Service System）
- 版本：`v1.0.13`
- 類型：Electron 桌面應用，本機 Fastify API + SQLite
- 前端：React 18 + TypeScript + Ant Design 5 + Vite 5
- 後端：Fastify 5 + better-sqlite3 + Zod
- 桌面：Electron 41
- DB：SQLite（WAL）
- 打包：electron-builder
- 使用情境：本地單機 / 區網共用後端，處理服務處日常業務

## 專案根目錄與檔案位置

你可以直接讀取本機工作區，請不要要求我額外貼檔案內容，直接以這個專案根目錄為基準開始讀取：

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
  - `Go`
  - `Conditional Go`
  - `No-Go`

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

1. 功能完整度與主流程可用性
2. 權限控制 / RBAC / privilege escalation
3. 程式碼品質與型別安全
4. 架構一致性與模組邊界
5. 業務邏輯正確性
6. 備份 / 還原 / 災難復原 / 資料一致性
7. Electron 與桌面行為一致性
8. 測試完整性與測試盲區
9. CI/CD 與 release readiness
10. 效能與大量資料可用性
11. 可靠性與維運風險
12. 文件、實作、測試三方一致性
13. 整體交付成熟度

## 你應特別留意的關鍵點

請特別檢查：

- fresh install 是否真的可用
- `first_run`、`backup_path`、初始化 seed 是否正確
- pending restore 是否真的在重啟後套用
- restore fail path 是否會把資料留在半套狀態
- 資料位置切換、備份、還原、附件、匯出是否會造成資料混亂或使用者誤解
- 前端按鈕可見性、前端 route guard、後端 permission middleware 是否一致
- 列印、Word/Excel 匯出、報表、合併、批次匯入匯出是否真的能走完
- Electron 主程序、內嵌 server、正式版 app 啟動流程是否穩定
- CI / release 是否會產生半套產物、假綠燈、未驗證發版
- 測試是否真的覆蓋高風險流程，而不是只做 happy path
- 列表大資料量下 UI 與 API 是否有明顯瓶頸
- 如果你發現安全/個資問題，只有在它**直接阻擋交付**時才列為高優先

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

- 功能完整度
- 程式碼品質
- 架構
- 業務邏輯
- 權限/RBAC
- 備份還原
- Electron/桌面
- 測試
- CI/CD / Release
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

### E. 交付判定

請明確判定：

- 是否可交付給內部正式使用
- 是否可交付給外部客戶部署
- 若不可，最少還需要補哪些項目

### F. 改進路線圖

請給：

- 7 天內立即修正
- 30 天內中短期改善
- 60-90 天內長期架構演進

## 審計原則

- 如果你不能從檔案中直接證明，請標記為「推論」
- 如果某項風險已被測試或近期修正覆蓋，也請明確註記，不要誤判成未處理
- 如果你發現「文件說有，但程式碼沒有」或「測試有，但正式版流程仍可能失敗」，請視為高價值 finding
- 請嚴格，但要務實；避免提出與這個專案規模完全不相稱的空泛 enterprise 建議
- 不要把資料安全、法遵、加密或合規建議當成預設主軸；除非它們會直接阻擋交付、驗收或穩定運行

最後，請以**繁體中文**輸出。
