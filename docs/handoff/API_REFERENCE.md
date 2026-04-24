# API Reference — 完整端點清單

**Base URL**：`http://localhost:8080/api`  
**認證**：`Authorization: Bearer <JWT>`（除了標記 `[PUBLIC]` 的）  
**統一回應**：`{ success: boolean, data?, error?, total? }`

共 **205 個端點**。下表按模組分類。

---

## 🔐 Auth

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| POST | `/api/auth/login` | [PUBLIC] | 登入，回傳 JWT |
| POST | `/api/auth/logout` | authenticated | 登出（清除 session） |
| GET | `/api/auth/me` | authenticated | 取得當前使用者資訊 |
| PUT | `/api/auth/password` | authenticated | 改自己的密碼 |

---

## 👥 Voters

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/voters` | voters.view | 列表（分頁、搜尋、篩選） |
| POST | `/api/voters` | voters.create | 新增 |
| GET | `/api/voters/:id` | voters.view | 詳情 + tags + relations |
| PUT | `/api/voters/:id` | voters.edit | 更新 + tags(transaction) |
| DELETE | `/api/voters/:id` | voters.delete | 軟刪除 |
| DELETE | `/api/voters/:id/anonymize` | voters.delete | GDPR 匿名化（硬清 PII） |
| POST | `/api/voters/:id/merge` | voters.edit | 合併選民 |
| GET | `/api/voters/search` | voters.view | 快速搜尋（姓名/手機/身分證） |
| GET | `/api/voters/duplicates` | voters.view | 找重複（電話/身分證） |
| GET | `/api/voters/birthdays` | voters.view | 近期生日 |
| GET | `/api/voters/import/template` | authenticated | 下載匯入範本 |
| POST | `/api/voters/import` | voters.create | 批次匯入 (dryRun 可選) |
| GET | `/api/voters/export` | voters.export | 匯出 Excel；預設遮罩 PII，完整個資需 `include_sensitive=1&reason=...` 且限 admin |
| GET | `/api/voters/:id/topics` | voters.view | 關注議題列表 |
| PUT | `/api/voters/:id/topics` | voters.edit | 更新關注議題 |
| GET | `/api/voters/:id/engagement` | voters.view | 支持度 / 志工狀態 |
| PUT | `/api/voters/:id/engagement` | voters.edit | 更新支持度 |
| GET | `/api/voters/:id/contacts` | voters.view | 該選民的聯絡紀錄 |
| POST | `/api/voters/:id/contacts` | voters.edit | 新增聯絡紀錄 |
| GET | `/api/voters/:id/relations` | voters.view | 人際關聯 |
| POST | `/api/voters/:id/relations` | voters.edit | 新增關聯 |
| DELETE | `/api/voters/:id/relations/:rid` | voters.edit | 刪除關聯 |
| GET | `/api/voters/:id/activity-history` | voters.view | 活動歷史 |

---

## 📋 Petitions

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/petitions` | petitions.view | 列表（含 start_date/end_date 驗證） |
| POST | `/api/petitions` | petitions.create | 新建（自動建選民 + 生成案號 + 日誌，全 IMMEDIATE transaction） |
| GET | `/api/petitions/:id` | petitions.view | 詳情 + 日誌 |
| PUT | `/api/petitions/:id` | petitions.edit | 更新（transaction，含轉派任務、通知） |
| DELETE | `/api/petitions/:id` | petitions.delete | 軟刪除 |
| POST | `/api/petitions/:id/logs` | petitions.edit | 新增處理日誌 |
| GET | `/api/petitions/stats` | petitions.view | 年度統計 |
| GET | `/api/petitions/overdue-count` | petitions.view | 逾期案件數 |
| GET | `/api/petitions/follow-ups` | petitions.view | 待追蹤案件 |
| GET | `/api/petitions/satisfaction-stats` | petitions.view | 滿意度統計 |
| GET | `/api/petitions/import/template` | authenticated | 範本 |
| POST | `/api/petitions/import` | petitions.create | 批次匯入 |
| GET | `/api/petitions/export` | petitions.export | 匯出 Excel |

### CreatePetitionSchema（重要）

```typescript
{
  content: z.string().min(1).max(5000),           // 必填
  petition_date: z.string().min(1),               // 必填
  voter_id: z.number().nullable().optional(),
  contact_name: z.string().max(100).nullable().optional(),
  contact_phone: z.string().max(30).nullable().optional(),
  channel: z.string().max(50).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  subcategory: z.string().max(50).nullable().optional(),
  area_city / area_district / area_village / area_address,
  urgency: z.enum(['normal','urgent','critical']).nullable().optional(),
  assignee_id: z.number().nullable().optional(),
  due_date / status / source: optional
}
```

---

## 🏢 Groups

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/groups` | groups.view | 列表 |
| POST | `/api/groups` | groups.create | 新增 |
| GET | `/api/groups/:id` | groups.view | 詳情 |
| PUT | `/api/groups/:id` | groups.edit | 更新 |
| DELETE | `/api/groups/:id` | groups.delete | 軟刪除 |
| POST | `/api/groups/:id/members` | groups.edit | 加成員 |
| PUT | `/api/groups/:id/members/:voter_id` | groups.edit | 更新成員角色 |
| DELETE | `/api/groups/:id/members/:voter_id` | groups.edit | 移除成員 |
| GET | `/api/groups/:id/schedules` | groups.view | 該團體相關行程 |
| GET | `/api/groups/:id/expenses` | groups.view | 該團體相關支出 |
| GET | `/api/groups/import/template` | authenticated | 範本 |
| POST | `/api/groups/import` | authenticated | 批次匯入 |

---

## 📅 Schedules

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/schedules` | schedules.view | 列表（start/end 採 overlap 過濾，支援跨日行程） |
| POST | `/api/schedules` | schedules.create | 新增（含 overlap 衝突偵測、自動同步 GCal） |
| GET | `/api/schedules/:id` | schedules.view | 詳情 |
| PUT | `/api/schedules/:id` | schedules.edit | 更新（排除自身後做 overlap 衝突偵測） |
| DELETE | `/api/schedules/:id` | schedules.delete | 軟刪除 |

---

## 👨‍⚖️ Consultations（法律諮詢）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/consultations` | schedules.view | 預約列表 |
| POST | `/api/consultations` | schedules.create | 新增預約（IMMEDIATE transaction 防超額） |
| PUT | `/api/consultations/:id` | schedules.edit | 更新 |
| GET | `/api/consultations/today` | schedules.view | 今日諮詢 |
| GET | `/api/consultations/slots` | schedules.view | 查詢某日可用時段 |
| GET | `/api/consultations/slots/manage` | admin.view | 管理時段 |
| POST | `/api/consultations/slots` | admin.edit | 新增時段 |
| DELETE | `/api/consultations/slots/:id` | admin.edit | 刪除時段 |

---

## ✅ Tasks

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/tasks` | tasks.view | 列表 |
| POST | `/api/tasks` | tasks.create | 新增 |
| PUT | `/api/tasks/:id` | tasks.edit | 更新 |
| DELETE | `/api/tasks/:id` | tasks.delete | 刪除 |
| GET | `/api/tasks/today` | authenticated | 今日待辦 |
| POST | `/api/tasks/batch-assign` | tasks.edit | 批次指派 |
| POST | `/api/tasks/batch-complete` | tasks.edit | 批次完成 |
| DELETE | `/api/tasks/batch` | tasks.edit | 批次刪除 |

---

## 📄 Documents（公文）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/documents` | documents.view | 列表（支援全文搜尋） |
| POST | `/api/documents` | documents.create | 新增（自動生成文號） |
| GET | `/api/documents/:id` | documents.view | 詳情 |
| PUT | `/api/documents/:id` | documents.edit | 更新 |
| DELETE | `/api/documents/:id` | documents.delete | 軟刪除 |

---

## 🎉 Events（活動）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/events` | events.view | 列表 |
| POST | `/api/events` | events.create | 新增 |
| GET | `/api/events/:id` | events.view | 詳情 |
| PUT | `/api/events/:id` | events.edit | 更新 |
| DELETE | `/api/events/:id` | events.delete | 軟刪除 |
| GET | `/api/events/:id/participants` | events.view | 參與者 |
| POST | `/api/events/:id/participants` | events.edit | 新增參與者 |
| PUT | `/api/events/:id/participants/:voter_id` | events.edit | 更新參與狀態 |
| DELETE | `/api/events/:id/participants/:voter_id` | events.delete | 移除參與者 |
| GET | `/api/events/:id/survey-responses` | events.view | 連結的問卷回應 |

---

## 📊 Surveys（問卷）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/surveys` | surveys.view | 列表 |
| POST | `/api/surveys` | surveys.create | 新建 |
| GET | `/api/surveys/:id` | surveys.view | 詳情 |
| PUT | `/api/surveys/:id` | surveys.edit | 更新 |
| DELETE | `/api/surveys/:id` | surveys.delete | 刪除（含 questions、responses） |
| POST | `/api/surveys/:id/questions` | surveys.edit | 新增題目 |
| DELETE | `/api/surveys/:id/questions/:qid` | surveys.edit | 刪題目 |
| GET | `/api/surveys/:id/responses` | surveys.view | 回應列表 |
| POST | `/api/surveys/:id/responses` | authenticated | 提交回應 |
| GET | `/api/surveys/:id/stats` | surveys.view | 統計結果 |
| POST | `/api/surveys/responses/:responseId/to-petition` | petitions.create | 問卷回應轉陳情 |

---

## 🔔 Notifications（通知）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/notifications` | notifications.view | 列表 |
| POST | `/api/notifications` | notifications.create | 建立草稿 |
| PUT | `/api/notifications/:id` | notifications.edit | 編輯草稿 |
| DELETE | `/api/notifications/:id` | notifications.edit | 刪除草稿 |
| POST | `/api/notifications/:id/send` | notifications.edit | 送出 |

---

## 🎁 Ceremonies（禮儀）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/ceremonies` | authenticated | 列表 |
| POST | `/api/ceremonies` | authenticated | 新增（含 items） |
| GET | `/api/ceremonies/:id` | authenticated | 詳情 |
| PUT | `/api/ceremonies/:id` | authenticated | 更新 |
| DELETE | `/api/ceremonies/:id` | authenticated | 刪除 |
| GET | `/api/ceremonies/by-schedule/:scheduleId` | authenticated | 某行程底下的禮儀 |
| GET | `/api/gift-categories` | authenticated | 禮品類別列表 |
| POST | `/api/gift-categories` | authenticated | 新增類別 |
| PUT | `/api/gift-categories/:id` | authenticated | 更新類別 |
| DELETE | `/api/gift-categories/:id` | authenticated | 軟刪除類別 |

---

## 🏭 Vendors（廠商）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/vendors` | vendors.view | 列表 |
| POST | `/api/vendors` | vendors.create | 新增 |
| GET | `/api/vendors/:id` | vendors.view | 詳情 + 採購明細 |
| PUT | `/api/vendors/:id` | vendors.edit | 更新 |
| DELETE | `/api/vendors/:id` | vendors.delete | 軟刪除 |
| GET | `/api/vendors/:id/stats` | vendors.view | 年度統計 |

---

## 💰 Expenses（支出）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/expenses/summary` | authenticated | 年月統計 |
| GET | `/api/expenses/years` | authenticated | 有資料的年份列表 |
| GET | `/api/expenses/budgets` | authenticated | 預算列表 |
| POST | `/api/expenses/budgets` | authenticated | 設定預算 |
| DELETE | `/api/expenses/budgets/:id` | authenticated | 刪除預算 |

---

## 📑 Proposals（提案追蹤）

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/proposals` | proposals.view | 列表 |
| POST | `/api/proposals` | proposals.create | 新增 |
| GET | `/api/proposals/:id` | proposals.view | 詳情 |
| PUT | `/api/proposals/:id` | proposals.edit | 更新 |
| DELETE | `/api/proposals/:id` | proposals.delete | 軟刪除 |
| GET | `/api/proposals/stats` | proposals.view | 統計 |
| GET | `/api/proposals/export` | proposals.export | 匯出 Excel |

---

## 📞 Contact Records

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/contact-records` | voters.view | 全部聯絡紀錄（非特定選民） |
| POST | `/api/contact-records` | voters.edit | 新增（可 voter_id 為空） |
| DELETE | `/api/contact-records/:id` | voters.edit | 刪除 |
| GET | `/api/contact-records/follow-ups` | voters.view | 待追蹤 |

---

## 📔 Daily Logs

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/daily-logs` | admin.view | 最近 30 天 |
| GET | `/api/daily-logs/:date` | admin.view | 取得某日（自動產生初稿） |
| PUT | `/api/daily-logs/:date` | admin.edit | Upsert |
| DELETE | `/api/daily-logs/:date` | admin.edit | 刪除 |

---

## 📊 Reports

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/reports/monthly-trend` | petitions.view | 月度趨勢 |
| GET | `/api/reports/weekly` | petitions.view | 週報表 |
| GET | `/api/reports/voter-activity` | voters.view | 選民活躍度 |
| GET | `/api/reports/voter-lifecycle` | voters.view | 選民生命週期 |
| GET | `/api/reports/area-penetration` | voters.view | 地區滲透率 |
| GET | `/api/reports/area-gap` | voters.view | 地區落差 |
| GET | `/api/reports/area-heatmap` | petitions.view | 地區熱區圖 |
| GET | `/api/reports/assignee-load` | petitions.view | 承辦人負荷 |
| GET | `/api/reports/assignee-workload` | petitions.view | 承辦人工作量 |
| GET | `/api/reports/closure-efficiency` | petitions.view | 結案效率 |
| GET | `/api/reports/high-risk-petitions` | petitions.view | 高風險案件 |
| GET | `/api/reports/issue-trend` | petitions.view | 議題趨勢 |
| GET | `/api/reports/type-area-cross` | petitions.view | 類型×地區交叉 |
| GET | `/api/reports/key-influencers` | voters.view | 關鍵意見領袖 |
| GET | `/api/reports/event-roi` | voters.view | 活動 ROI |
| GET | `/api/reports/no-contact-voters` | voters.view | 久未聯絡選民 |
| GET | `/api/reports/notification-reach` | voters.view | 通知觸及 |
| GET | `/api/reports/satisfaction-ranking` | petitions.view | 滿意度排行 |
| GET | `/api/reports/survey-cross` | petitions.view | 問卷交叉 |
| GET | `/api/reports/team-efficiency` | petitions.view | 團隊效率 |

---

## 🔍 Search

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/search` | authenticated | 全域搜尋（voters/petitions/groups/schedules） |

---

## 📎 Attachments

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/attachments` | authenticated | 列表（by target） |
| POST | `/api/attachments` | authenticated | 上傳（multipart，限 20MB、PDF/圖片；後端 MIME allowlist + 基本檔頭驗證） |
| GET | `/api/attachments/:id/file` | authenticated | 下載 |
| DELETE | `/api/attachments/:id` | authenticated | 刪除 |

---

## 🤖 AI

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/ai/config` | settings.view | 取得 AI 設定（API key 遮罩） |
| PUT | `/api/ai/config` | settings.edit | 更新 AI 設定 |
| POST | `/api/ai/test` | authenticated | 測試 API key |
| POST | `/api/ai/classify` | authenticated | 自動分類陳情 |
| POST | `/api/ai/summarize` | authenticated | 摘要 |
| POST | `/api/ai/suggest-note` | authenticated | 建議備註 |
| POST | `/api/ai/parse-proposal` | authenticated | 解析提案資料 |

---

## 🔗 Integrations

### Google Calendar
| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/integrations/gcal/status` | settings.edit | 狀態 |
| POST | `/api/integrations/gcal/credentials` | settings.edit | 儲存 OAuth client_id/secret |
| GET | `/api/integrations/gcal/auth-url` | settings.edit | 產生 OAuth URL |
| GET | `/api/integrations/gcal/callback` | [PUBLIC] | OAuth 回調 |
| PUT | `/api/integrations/gcal/accounts/:id` | settings.edit | 更新帳號 |
| DELETE | `/api/integrations/gcal/accounts/:id` | settings.edit | 移除帳號 |
| POST | `/api/integrations/gcal/sync/:scheduleId` | schedules.edit | 手動同步單筆行程 |

### LINE
| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/line/webhook` | [PUBLIC] | LINE webhook 驗證 |
| POST | `/api/line/webhook` | [PUBLIC] | LINE 訊息入口 |
| GET | `/api/line/status` | admin.view | 已綁定狀態 |
| POST | `/api/line/link-voter` | admin.edit | 綁定 LINE user 到選民 |

---

## ⚙️ Admin

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/admin/users` | users.view | 帳號列表 |
| POST | `/api/admin/users` | users.create | 新增帳號 |
| PUT | `/api/admin/users/:id` | users.edit | 更新帳號 |
| DELETE | `/api/admin/users/:id` | users.delete | 刪除帳號 |
| PUT | `/api/admin/users/:id/password` | users.edit | 重設密碼（需確認管理員自己密碼） |
| PUT | `/api/admin/users/:userId/disable` | users.edit | 停用帳號 |
| POST | `/api/admin/users/:userId/transfer` | users.edit | 離職交接 |
| GET | `/api/admin/audit-logs` | audit_logs.view | 稽核紀錄 |
| GET | `/api/admin/categories` | authenticated | 類別列表（含 voter_tag、petition_category 等） |
| POST | `/api/admin/categories` | categories.create | 新增類別 |
| PUT | `/api/admin/categories/:id` | categories.edit | 更新 |
| DELETE | `/api/admin/categories/:id` | categories.delete | 刪除 |
| GET | `/api/admin/settings` | settings.view | 系統設定 |
| PUT | `/api/admin/settings` | settings.edit | 更新設定 |
| GET | `/api/admin/system-health` | admin.view | 系統健康（DB size、記憶體等） |
| GET | `/api/admin/data-quality` | admin.view | 資料品質掃描（重複/孤兒/附件遺失） |
| GET | `/api/admin/data-retention/preview` | admin.view | 資料保留預覽（待封存/刪除/去識別筆數） |
| POST | `/api/admin/data-retention/run` | admin.edit | 執行資料保留清理；需 `confirm=RUN_RETENTION` |
| GET | `/api/admin/alerts` | authenticated | 系統警告 |
| POST | `/api/admin/backup` | system.edit | 立即備份；產生 `.meta.json` 簽章 sidecar |
| GET | `/api/admin/backup/list` | system.view | 備份列表（含 signed、sha256、schema_version） |
| GET | `/api/admin/backup/download` | system.edit | 下載備份（response headers 含 SHA-256 與 HMAC 簽章） |
| DELETE | `/api/admin/backup/:name` | system.edit | 刪除備份 |
| GET | `/api/admin/backup/status` | system.view | 備份狀態 |
| GET | `/api/admin/backup/path` | system.view | 備份位置與白名單狀態 |
| POST | `/api/admin/backup/path` | system.edit | 修改備份位置；若設定 `VOTER_SERVICE_BACKUP_ALLOWED_ROOTS` 則需落在白名單內 |
| POST | `/api/admin/restore` | system.edit | 還原備份（integrity + 必要 schema 驗證） |
| GET | `/api/backup/verify/:filename` | admin.view | 驗證備份完整性、必要 schema 與簽章狀態 |

---

## 🗳 Election Areas

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/election-areas` | admin.view | 列表 |
| POST | `/api/election-areas` | admin.edit | 新增 |
| PUT | `/api/election-areas/:id` | admin.edit | 更新 |
| DELETE | `/api/election-areas/:id` | admin.delete | 刪除 |

---

## 👤 Users

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/users/list` | authenticated | 簡單使用者清單（for 下拉選承辦人） |

---

## 🚨 Client Errors

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| POST | `/api/client-errors` | [PUBLIC] | 前端錯誤回報（window.onerror） |
| GET | `/api/client-errors` | admin.view | 查看前端錯誤清單 |

---

## 🔄 System

| Method | Path | 權限 | 說明 |
|--------|------|------|------|
| GET | `/api/system/updates` | authenticated | 檢查新版本 |

---

## ⚠️ 認證錯誤排查

1. `401` 全部路由 → 檢查 authStore 是否保存 token、axios interceptor 是否加 Header
2. `403` 特定路由 → 角色沒 `requirePermission` 需要的 action
3. `400` with null in error → **Zod schema 不接受 null**，改 `.nullable().optional()`

---

**End of API_REFERENCE.md**
