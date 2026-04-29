# Install Troubleshooting Runbook

## 目標

讓 macOS / Windows 安裝版啟動、授權、資料庫、備份與 native module 問題有固定排查順序。

## macOS 常見問題

### Gatekeeper 阻擋

1. 確認下載來源為官方 GitHub Release 或自架 update proxy 提供的正式安裝檔。
2. 若尚未 notarize，使用者可能需要在「系統設定 → 隱私權與安全性」允許開啟。
3. 不要要求使用者關閉 Gatekeeper 或 SIP。
4. 長期解法是 Apple Developer ID 簽署與 notarization。

### 啟動後白畫面

1. 檢查 `dist/` 與 `dist-electron/` 是否存在於安裝包。
2. 確認 production 由 `http://127.0.0.1:8080` 提供 built assets 時前端資源可載入。
3. 檢查主程序 log 是否有 CSP、路由或 preload 錯誤。

### 軟體更新失敗

若 repo 是 private，桌面版不能直接匿名抓 GitHub Release。

請依序確認：

1. 安裝包是否已內建 `update-proxy.json`，或桌面版是否另有設定 `VOTER_SERVICE_UPDATE_PROXY_URL`
2. 若 proxy 有保護，桌面版是否也有設定 `VOTER_SERVICE_UPDATE_PROXY_TOKEN`
3. update proxy 是否可正常回應 `/health`
4. update proxy 是否可取得 `/api/updates/latest`
5. proxy 端是否有設定 `VOTER_SERVICE_UPDATE_GITHUB_TOKEN`

若本機安裝包應該自動帶 proxy 設定，可另外檢查：

1. 使用者 `app-config.json` 是否已有 `updateProxyUrl`
2. 安裝包 `Resources/update-proxy.json` 是否存在
3. 升級後若設定沒更新，確認本機是否曾手動覆蓋成非 installer-managed 設定

## Windows 常見問題

### 安裝後無法啟動

1. 確認安裝路徑沒有被防毒軟體隔離。
2. 檢查 `%APPDATA%` 或 app data 目錄是否可寫。
3. 若 better-sqlite3 native module 載入失敗，改由 CI `windows-latest` 重新打包，不要從 macOS cross-compile。

### 解除安裝資料保留

1. 解除安裝不應刪除使用者資料庫與備份。
2. 重新安裝後需能讀取原資料庫。
3. 若需要清空資料，必須走明確的人工備份與刪除流程。

## 授權與環境變數

若要啟用機器綁定，可設定：

```bash
VOTER_SERVICE_VENDOR_PASSWORD=高強度授權密碼
VOTER_SERVICE_SETTINGS_KEY=固定且高強度的設定加密密鑰
VOTER_SERVICE_BACKUP_SIGNING_KEY=固定且高強度的備份簽章密鑰
```

若未設定授權密碼，正式版仍可啟動，但不會啟用 machine fingerprint 綁定。若有設定，換機時才會因 fingerprint 不同而重新要求授權。

## 資料庫與備份

1. 啟動失敗時先保存目前 `.db`、`.db-wal`、`.db-shm` 與最新備份。
2. 執行 SQLite `PRAGMA integrity_check` 確認 DB 是否毀損。
3. 若有 `.restore` marker，依 `BACKUP_RESTORE.md` 完成還原或移除錯誤 marker 前先備份。
4. 還原後必須重啟應用程式，並做登入、新增選民、查詢陳情、建立備份 smoke test。

## 發布前安裝 Smoke Test

- macOS：安裝 DMG、首次啟動、授權、登入、新增選民、新增陳情、備份、重啟。
- Windows：NSIS 安裝版 / portable 免安裝版、資料目錄保留、備份、解除安裝與重新安裝。
- 兩平台都要確認 `npm run verify` 已在打包前通過。
