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

## 已知注意事項

- production audit 目前為 0 vulnerabilities。
- full audit 仍可能回報 Vite/esbuild dev-only moderate；Vite major upgrade 應獨立排期並做前端回歸。
- 若要啟用機器綁定，再設定 `VOTER_SERVICE_VENDOR_PASSWORD`；未設定時正式版可正常啟動，但不會做 vendor lock。
