# Incident Response Runbook

## 事故分級

- P0：資料庫毀損、疑似個資外洩、無法登入、無法啟動。
- P1：備份失敗、還原失敗、匯出異常、權限錯誤。
- P2：單一頁面錯誤、匯入部分失敗、效能退化。

## 初始處置

1. 停止受影響操作。
2. 記錄時間、使用者、操作路徑、錯誤訊息。
3. 匯出或保存 audit logs。
4. 若涉及備份，保存 `.db` 與 `.meta.json`，不要覆寫。
5. 若涉及個資外洩，立即依 `DATA_PROTECTION.md` 外洩疑慮處理。

## 技術檢查

```bash
npm run verify
sqlite3 voter-service.db "PRAGMA integrity_check;"
sqlite3 voter-service.db ".tables"
```

檢查：

- `voter-service.db.restore` 是否存在。
- 最新備份是否 signed。
- `audit_logs` 是否有 `api_error`、`fatal_error`、`large_export_warning`。
- 磁碟是否滿、備份目錄是否可寫。

## 復原優先順序

1. 保護原始證據與目前 DB。
2. 建立 pre-fix 備份。
3. 在複本環境重現問題。
4. 修正後跑 `npm run verify`。
5. 部署後做 smoke test。

## 事後檢討

- 補最小重現測試。
- 更新 handoff / runbook。
- 若是權限或個資問題，檢查同類 API 是否有相同缺口。
