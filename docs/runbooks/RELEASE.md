# Release Runbook

## 發布前檢查

```bash
npm ci
npm run verify
npm audit --omit=dev
git diff --check
```

`npm run verify` 必須包含：

- client/server/electron/test typecheck
- Node test runner integration tests
- production build
- production audit

tag release 另外會在 GitHub Actions 補跑：

- Playwright Chromium E2E（navigation / smoke / role-access）
- macOS / Windows 打包
- 兩平台都成功後才建立 draft release

## Private Repo 自動更新

若 GitHub repo 維持 `private`，桌面版不可再直接匿名打 GitHub Release。

請改用 `UPDATE_PROXY.md` 的架構：

1. release 仍發到 private GitHub Releases
2. 自架 update proxy / metadata server
3. 桌面版與本機 Fastify 設定：

```bash
VOTER_SERVICE_UPDATE_PROXY_URL=https://updates.example.com
VOTER_SERVICE_UPDATE_PROXY_TOKEN=可選，共享 token
```

若希望安裝完成後自動帶入，不要再手動設宿主機環境變數，請在打包前先 export 同一組值，再執行：

```bash
npm run dist:mac
# 或
npm run dist:win
```

安裝包會自動內嵌 `update-proxy.json`，並在首次啟動時寫入本機 `app-config.json`。

GitHub Actions 發版也需要同一組 repository secrets，否則 macOS / Windows 打包 job 會直接停止，避免產出無法更新的安裝檔：

```text
VOTER_SERVICE_UPDATE_PROXY_URL
VOTER_SERVICE_UPDATE_PROXY_TOKEN
```

目前 Tailscale MagicDNS 版本的 URL 形如：

```text
http://steriomac-mini.taileae673.ts.net:18787
```

4. proxy 端設定：

```bash
VOTER_SERVICE_UPDATE_GITHUB_TOKEN=可讀 private release 的 token
```

5. 新主機可直接使用專案內附部署範本：

- `deploy/update-proxy/.env.example`
- `deploy/update-proxy/Caddyfile`
- `deploy/update-proxy/ecosystem.config.cjs`
- `deploy/update-proxy/voter-service-update-proxy.service`

## 版本流程

1. 更新版本號與 release notes。
2. 確認 `docs/handoff/` 與 `docs/runbooks/` 已同步重大行為變更。
3. Windows 安裝檔不要從 macOS 本機直接交付。
   若當前環境是 macOS，`bcrypt` / `better-sqlite3` 這類 native modules 可能讓 `npm run dist:win` 失敗或產出不可信包。
   Windows 版應優先走 `.github/workflows/release.yml` 的 `windows-latest` job，或在真實 Windows 機器上執行 `npm run dist:win`。
3. 打 tag：

```bash
git tag v1.0.x
git push origin v1.0.x
```

4. Release workflow 會在 tag `v*` 時先跑 verify + E2E，再打包 macOS / Windows，最後才建立 draft release。

## 安裝檔檢查

- macOS：確認 DMG 可安裝、首次啟動可建立資料庫與 `first_run` 預設設定、Gatekeeper 行為符合預期。
- Windows：確認 NSIS 安裝版 / portable 免安裝版可啟動、資料保留、解除安裝不誤刪資料。
- 兩平台都需測試：登入、新增選民、新增陳情、備份、還原後重啟套用、重啟後資料仍在。
- 發版前至少做一次隔離資料路徑驗收：首次執行精靈、`backup_path` 預設值、pending restore 重啟套用。
- 若本次變更碰到列表或查詢效能，至少做一次大量資料 smoke：選民 10k+、陳情 1k+。
- 若 repo 是 private，發版後需驗一次 update proxy：`/health`、`/api/updates/latest`、`/api/updates/generic/win/latest.yml`。
- 若使用 installer 內建 proxy 設定，還要補驗一次：新安裝 app 首次啟動後，更新檢查不需手動設環境變數即可成功。

## 已知注意事項

- production audit 目前為 0 vulnerabilities。
- full audit 仍可能回報 Vite/esbuild dev-only moderate；Vite major upgrade 應獨立排期並做前端回歸。
- 若要啟用機器綁定，再設定 `VOTER_SERVICE_VENDOR_PASSWORD`；未設定時正式版可正常啟動，但不會做 vendor lock。
