# Phase 1-4 執行計畫

本文件承接 `ROADMAP.md`，用來追蹤「從穩定基線一路推進到長期架構」的實作順序。每一批變更都應以 `npm run verify` 或 CI 等價流程收尾。

## Phase 1：穩定、安全、測試與交付 ✅ 完成度 96%

**已完成** (v1.0.14-17)：
- ✅ 測試框架：85 個後端測試 + 31 條 e2e 測試 + typecheck all
- ✅ 安全基線：rate limiting + CSP + secrets encryption + attachment/backup verify
- ✅ 可靠性：restore-on-startup rollback + voter merge completeness + Electron watchdog
- ✅ 正式版驗收：fresh install baseline + pending restore + 12k/1.5k/300 packaged smoke + 本機登入驗證
- ✅ 資料保護：預設遮罩 PII + 完整匯出 audit + 資料保留 TTL + runbooks

**下一步**：
- 備份 ZIP 下載與 metadata 匯入 UX
- Google/LINE/AI route-level secrets round-trip tests
- 資料品質一鍵修復

## Phase 2：效能、UI 與 UX ✅ 完成度 96%

**已完成** (v1.0.14-17)：
- ✅ 資料品質掃描 API + 後台入口
- ✅ UI primitives：`PageScaffold`、`Toolbar`、`EmptyState`、`FormFooter`、`FormSection`、`SelectionActionBar`、`MetricCard`、`ActionQueue`
- ✅ Dashboard 重構為「Today Command Center」
- ✅ 路由 lazy loading + chunk split (antd vendor cacheable)
- ✅ 列表 virtual scroll + 固定 header
- ✅ 權限收斂：shared permission map + read-only/manage 分層
- ✅ 資料保留政策：UI 設定 + TTL 執行
- ✅ Tasks deep-link + 行程衝突檢查

**下一步**：
- 匯入 dry-run UI 統計與錯誤原因
- 報表卡片與詳情頁推廣 `MetricCard`
- 新增陳情流程加重複選民提示

## Phase 3：業務模組深化與桌面交付 ✅ v1.0.15+ 進行中

**已完成**：
- ✅ v1.0.15：in-app 一鍵自動更新 (Win 完整 / Mac 輔助)

**下一步**：
- 陳情 SLA 狀態統一到 Dashboard、列表、詳情、報表
- 活動/問卷/通知模組整合測試與稽核完整性
- Mac/Windows 簽署、notarize、Gatekeeper 文件

## Phase 4：文件、Runbook 與長期架構 ✅ 完成度 90%

**已完成** (v1.0.14+)：
- ✅ `docs/handoff/`：Roadmap / HANDOFF / PHASE_EXECUTION / API / DB
- ✅ `docs/runbooks/`：backup / data-protection / data-quality / release / install / incidents

**下一步**：
- Service/Repository 分層（backup、attachments、voters、petitions）
- Postgres 遷移預備 (schema / ID / transaction)

## 完成度快照（v1.0.17，本地端/區網部署定位）

| 面向 | 完成度 | 備註 |
|------|--------|------|
| 資安 | 88% | secrets encryption、rate limiting、CSP、附件與備份驗證、簽章與白名單已到位；仍需 HTTPS/DB encryption 規劃 |
| 個資保護 | 90% | 預設遮罩、完整匯出理由/audit、資料保留 TTL、runbooks、fresh install forced password change 已完成；仍需跨機加密部署規範 |
| 測試/CI | 98% | typecheck all、85 個 Node tests、31 條 Playwright E2E、正式版隔離驗收、本機 packaged smoke 已驗證；覆蓋率報表待補 |
| 可靠性 | 98% | restore rollback、signed backup、pending restore on startup、fresh baseline、Electron watchdog、autoBackup idempotent、runbooks、E2E smoke 已完成；仍需 auto-update 流程文件 |
| 效能 | 90% | WAL、17 個新索引、2 個 N+1 fix、virtual scroll、lazy loading、antd chunk split、12k/1.5k/300 smoke 已通過；仍需匯入 bulk 化 |
| UI/UX | 97% | Today Command Center、8 個 UI primitives、shared permission map、read-only/manage 分層、aria-labels、Dashboard skeleton 已覆蓋；下一步聚焦報表卡片與 import 統計 |
| 可維護性 | 96% | handoff/API/DB/runbooks、全功能測試矩陣、Playwright config、E2E helpers、shared RBAC、UI component library 已補；仍需 Service/Repository 分層 |
