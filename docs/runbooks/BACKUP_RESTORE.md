# Backup / Restore Runbook

## 目標

確保 SQLite 備份可驗證、可追蹤、可還原，且還原前不破壞目前資料庫。

## 每日檢查

1. 進入「系統設定 → 備份管理」。
2. 確認最近一份備份顯示「已簽章」。
3. 點選備份驗證，確認 integrity、schema、signature 均通過。
4. 若啟用 `VOTER_SERVICE_BACKUP_ALLOWED_ROOTS`，確認備份目錄位於允許根目錄內。

## 手動備份

1. 點選「立即備份」。
2. 確認產生 `.db` 與同名 `.db.meta.json`。
3. 將備份複製到加密磁碟或受控 NAS。
4. 不要只保存 `.db`；sidecar metadata 是防竄改證據。

## 還原流程

1. 先停止所有使用者操作。
2. 上傳 `.db` 備份檔。
3. 系統會先執行 SQLite `PRAGMA integrity_check` 與必要 schema 驗證。
4. 通過後會建立 `voter-service.db.restore`，並同時建立 pre-restore 備份。
5. 重新啟動應用程式後，系統會在啟動早期自動將 `voter-service.db.restore` 套用到主資料庫，並清除舊的 WAL/SHM sidecar。
6. 若本次啟動真的套用了待還原資料庫，正式版會顯示「還原完成」提示視窗。
7. 若 pending restore 在啟動時套用失敗，系統會自動回復原主 DB，並把失敗檔案保留為 `voter-service.db.restore.failed-*`；正式版會顯示「還原未套用」警告。
8. 還原後立即登入並檢查選民列表、陳情列表、操作紀錄。
9. 驗收完成前保留系統自動建立的 pre-restore 備份，不要立刻刪除。

## 失敗處理

- `無法驗證備份檔案完整性`：檔案不是 SQLite DB 或已毀損，不可還原。
- `備份檔案不是本系統可還原格式`：DB schema 不符，需人工檢查來源。
- `signature_mismatch`：備份可能被竄改，停止使用該檔案並保留證據。
- 重新啟動後資料未變更：先檢查是否出現 `voter-service.db.restore.failed-*`；若有，代表系統已自動回復原主 DB，需保留主 DB、failed restore 檔與 pre-restore 備份，並檢查啟動 log。

## 必要環境變數

```bash
VOTER_SERVICE_BACKUP_SIGNING_KEY=固定且高強度的備份簽章密鑰
VOTER_SERVICE_BACKUP_ALLOWED_ROOTS=/secure/backups;/Volumes/EncryptedBackup
```
