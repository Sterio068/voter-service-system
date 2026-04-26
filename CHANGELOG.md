# 變更紀錄

本檔記錄各版本的重大改動。日期格式為 YYYY-MM-DD。  
[Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/) 風格。

> 從 v1.0.15 開始系統內建自動更新（Win NSIS 全自動 / Mac 抓 DMG 開啟），打開 App 5 秒後若有新版本會在右下顯示通知，按「立即更新」即可。

---

## [Unreleased]

## [1.0.22] - 2026-04-27

### Added
- **陳情批次操作**：清單可勾選多筆陳情，一次「批次轉派 / 批次結案 / 批次設定優先級」（新端點 `POST /api/petitions/bulk-update`，Zod 驗證、單一 transaction、1000 筆上限、完整稽核）。`status='closed'` 自動寫入 `closed_at`。

## [1.0.21] - 2026-04-26

### Added
- **選民活動時間軸**：選民詳情頁新增「活動時間軸」分頁，跨陳情／聯絡記錄／行程／禮儀／待辦／通知 6 個資料源依時間倒序整合呈現，點擊任一事件可跳到原始紀錄（端點 `/api/voters/:id/timeline`，50k 選民效能 1ms）。

## [1.0.20] - 2026-04-26

### Added
- **選民批次加標籤**：清單可勾選多筆選民，一次套用多個標籤（新端點 `POST /api/voters/bulk-tags`，單一 SQLite transaction，5000 筆上限，完整稽核）。
- **匯出選取選民**：清單勾選後匯出僅含選取的選民，避免匯出全表後手動篩選。

### Changed
- 10 個 state-changing handler 補齊稽核紀錄（預算 / 廠商 / 選區 / AI 設定 / LINE 帳號連結），現在所有寫入動作都進得了「操作紀錄」。

### Fixed
- Google Calendar 事件刪除失敗的錯誤現在會記錄事件 ID + 帳號 ID（之前直接吞掉）。
- LINE webhook event 例外現在會帶事件類型 + LINE userId，便於回溯。

## [1.0.19] - 2026-04-26

### Added
- **選民詳情頁無障礙性大改**：sidebar 全 nav 鍵盤可達（Enter/Space），登入頁欄位有顯式 label，列表 icon-only 按鈕加上含 row context 的 aria-label（共 16 處 WCAG 2.2 AA 修正）。
- 6 條新 e2e 測試（陳情結案/紀錄/轉派、選民匯入預覽、選民詳情導覽、行程衝突）— 總 e2e 31 → 37 條。

### Changed
- **Bundle 拆分**：Dashboard 把 410KB 的 chart-vendor 改成 lazy；Reports 19 個子組件全部 React.lazy 分檔；Schedule 把 102KB 的 docx 延遲到匯出按鈕點擊才載入。
- ReportsPage chunk 11.31 KB → 5.33 KB gzip。

### Fixed
- **陳情處理紀錄 UI/server 漂移**：UI 下拉選項提供 server 不接受的值（`電話`、`會勘`、`發文`、`其他`）會 400。改抽到 `shared/types.ts` 的 `PETITION_LOG_ACTION_TYPES` 常數，UI 與 server 共用同一份。

## [1.0.18] - 2026-04-26

### Security
- **LINE HMAC 改用 `crypto.timingSafeEqual`**，防止 byte-by-byte timing attack 推導 channel secret。
- **LINE 簽章驗證改用 raw body**，不再被 `JSON.stringify` 重序列化（避免簽章假命中／假漏命中）。
- **JWT 登出真的會失效**：新增 `revoked_tokens` 表，登入時 jti 寫入 token，登出時寫入 revoked_tokens，每小時清過期。授權 middleware 檢查後才放行。
- **登入鎖定 DB 持久化**：`login_attempts` 表取代 in-process Map，重啟伺服器不會重置 brute-force 計數。
- **生產環境必填 `VOTER_SERVICE_SETTINGS_KEY`**：以 hostname/username 為 fallback 的 key 在 production 直接拒絕啟動，避免 VM clone 的密文可被反推。
- **檔案上傳 stream 層強制限制**：附件 20 MB / Excel 匯入 5 MB（voter / petition / groups 三條 import 路徑全套用），不再會在 buffer 階段才 reject 而 OOM。

### Changed
- 6 個 API 端點 `{ success, data }` envelope 一致化。

## [1.0.17] - 2026-04-26

### Changed
- **Server 型別硬化**：92 處 `(request as any).currentUser` 改為 typed `request.currentUser`（FastifyRequest module augmentation）。
- **Zod 全面覆蓋**：10 個 routes、16 個 schema、25 個 safeParse 站點。所有 POST/PUT/PATCH 都有輸入驗證。
- **17 個新 DB 索引**：petitions / voters / users / tasks / proposals / consultations / voter_relations / notification_recipients / archive ranges。
- **2 個 N+1 修復**：`/api/ceremonies/by-schedule/:id`（N items lookups → batched IN）、`/api/reports/event-roi`（N same-day count queries → 單一 LEFT JOIN）。
- **Bundle**：主入口 1058 KB → 55 KB（gzip 332 → 19.7 KB）。Antd 拆獨立 cacheable chunk。
- **Mac DMG 雙 arch 分檔**：`voter-service-system-X.Y.Z-arm64.dmg` / `-x64.dmg`，不再因 slugify 撞名。

## [1.0.16] - 2026-04-26

### Added
- **備份 sidecar 下載**：`/api/admin/backup/download-meta?file=<name>` 讓 .meta.json 可隨 .db 一起搬到外部儲存，還原時可通過 HMAC 驗證。
- **資料品質 CSV 匯出**：`/api/admin/data-quality?format=csv` 直接下載稽核 Excel，搭配清單頁的「下載 CSV」按鈕。
- 4 個新 API 整合測試（search、electionAreas、dailyLogs ×2）。

### Fixed
- **LINE webhook 真實 bug**：原本 `voters.tags` 欄位不存在（標籤實際在 `voter_tags` 子表），導致 `/api/line/webhook`、`/api/line/link-voter`、`/api/line/status` 全壞掉。改 JOIN voter_tags。
- **search.ts 引用不存在的 `voters.support_level`** → 改 LEFT JOIN voter_engagement。
- 7 個 server silent failure catch 改為 audit_logs / response 警告。
- 5 個 client 頁面補上 error UI（AuditLog / Tasks / ExpensePage / GroupList / VoterDetail）。

## [1.0.15] - 2026-04-25

### Added
- **系統內建自動更新**：開 App 5 秒後通知有新版本，「立即更新」一鍵安裝。
  - Windows NSIS：electron-updater 全自動（檢查 → 下載 → quitAndInstall → 重啟）
  - macOS：自製抓 DMG → `shell.openPath` → 拖到 Applications
  - 兩平台同一組 IPC，UI 一致。

## [1.0.14] - 2026-04-25

### Added
- **備份 HMAC 簽章驗證**：還原時必須上傳 `.db` + `.meta.json`，HMAC 不符直接拒絕（除非勾選「強制還原未簽章備份」）。
- **Excel 公式注入防護**（CWE-1236）：voter / petition / proposal 匯出全套用 `safeCell`。
- **匯入 dry-run UI 強化**：preCheck 顯示新增/更新/錯誤 Tag 分類 + 「下載錯誤報告 (CSV)」。
- 50k 選民壓力測試 + 匯出上限 5000 筆（`VOTER_EXPORT_LIMIT`）。
- 自動更新提示（半自動）：登入後 5s 呼叫 `/api/system/version-check`。

---

## 安裝 / 升級

從 GitHub Release 下載對應平台檔案：  
<https://github.com/Sterio068/voter-service-system/releases>

| 平台 | 檔案 |
|---|---|
| Windows（推薦） | `voter-service-system-setup-X.Y.Z.exe` (NSIS 安裝程式) |
| Windows Portable | `voter-service-system-X.Y.Z.exe` |
| Mac Apple Silicon | `voter-service-system-X.Y.Z-arm64.dmg` |
| Mac Intel | `voter-service-system-X.Y.Z-x64.dmg` |

裝過 v1.0.15+ 之後就會自動接收後續更新通知，從 App 內就能升級。
