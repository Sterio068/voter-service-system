# Update Proxy Runbook

## 目標

在 **GitHub repo 維持 private** 的前提下，仍然讓桌面版 `AppUpdater`、Windows `electron-updater`、以及後端 `/api/system/version-check` 能正常檢查與下載更新。

這套方案的核心是：

1. GitHub Actions 繼續把安裝檔與 `latest*.yml` 發到 **private GitHub Release**
2. 自架一個 **update proxy / metadata server**
3. proxy 用 **server-side GitHub token** 代抓 private release metadata 與 asset
4. 桌面版與本機 Fastify 改抓 proxy，不再直接匿名打 GitHub

---

## 架構

更新相關流量會變成：

```text
Desktop App / Local Fastify
  -> Update Proxy
    -> GitHub Releases API (private, token-authenticated)
```

### 目前已實作的端點

由 `server/updateProxyServer.ts` 提供：

- `GET /health`
- `GET /api/updates/latest?current=1.0.27&platform=darwin&arch=arm64`
- `GET /api/updates/assets/:assetName`
- `GET /api/updates/generic/win/latest.yml`
- `GET /api/updates/generic/win/:assetName`
- `GET /api/updates/generic/mac/latest-mac.yml`
- `GET /api/updates/generic/mac/:assetName`
- `GET /download` — 瀏覽器下載頁，給使用者直接下載安裝檔
- `GET /download/windows` — Windows 安裝版穩定下載連結
- `GET /download/windows-portable` — Windows 免安裝版穩定下載連結
- `GET /download/mac-arm64` — macOS Apple Silicon DMG 穩定下載連結
- `GET /download/mac-x64` — macOS Intel DMG 穩定下載連結

---

## Proxy 端環境變數

至少設定以下變數：

```bash
VOTER_SERVICE_UPDATE_GITHUB_TOKEN=ghp_xxx_or_github_pat_xxx
```

建議再設定：

```bash
VOTER_SERVICE_UPDATE_GITHUB_OWNER=Sterio068
VOTER_SERVICE_UPDATE_GITHUB_REPO=voter-service-system
VOTER_SERVICE_UPDATE_PROXY_URL=https://updates.example.com
VOTER_SERVICE_UPDATE_PROXY_PORT=8787
VOTER_SERVICE_UPDATE_PROXY_HOST=0.0.0.0
```

若希望 proxy 本身也需要驗證，再加：

```bash
VOTER_SERVICE_UPDATE_PROXY_TOKEN=一組長且隨機的共享token
```

這樣所有進入 proxy 的請求都必須帶：

```http
Authorization: Bearer <VOTER_SERVICE_UPDATE_PROXY_TOKEN>
```

例外：`/download` 與 `/download/*` 是給 Chrome / Safari 直接下載用的公開交付路由，不需要 bearer header。若 proxy 掛在 Tailscale MagicDNS 後方，實際可見範圍仍由 tailnet 控制。

---

## 桌面版 / 本機 Fastify 環境變數

桌面版與本機 Fastify 要改走 proxy，只需要：

```bash
VOTER_SERVICE_UPDATE_PROXY_URL=https://updates.example.com
```

如果 proxy 啟用了 bearer token，再一起設定：

```bash
VOTER_SERVICE_UPDATE_PROXY_TOKEN=與 proxy 端相同的共享token
```

### 行為切換

- **有設定 `VOTER_SERVICE_UPDATE_PROXY_URL`**：優先走 proxy
- **沒有設定**：回退到直接查 GitHub Release
  - 這只適用於 **public repo**
  - private repo 下會失敗

### 安裝包內建 proxy 設定

現在安裝包也支援把 proxy 設定直接帶進去。打包前若有提供：

```bash
VOTER_SERVICE_UPDATE_PROXY_URL=https://updates.example.com
VOTER_SERVICE_UPDATE_PROXY_TOKEN=可選，共享 token
```

若由 GitHub Actions 產出正式 macOS / Windows 安裝包，請把這兩個值設定成 repository secrets。release workflow 會在打包前檢查，缺少任一值就停止發版。

`npm run build` / `npm run dist:mac` / `npm run dist:win` 會自動產生：

```text
generated-resources/update-proxy.json
```

並在安裝包內放成：

```text
Resources/update-proxy.json
```

安裝完成後，桌面版首次啟動會把這份設定自動寫入使用者本機 `app-config.json`，之後更新檢查就不需要再手動設環境變數。

規則如下：

- 首次安裝：若本機還沒有 update proxy 設定，會自動套用安裝包內建值
- 安裝包升級：若既有設定是「installer 管理」寫入的，會跟著新安裝包更新
- 若本機已有人工自訂的 proxy 設定，安裝包不會覆蓋它

---

## 本機啟動 proxy

開發模式：

```bash
npm run dev:update-proxy
```

直接啟動：

```bash
npm run start:update-proxy
```

預設監聽：

```text
http://0.0.0.0:8787
```

---

## 可直接使用的部署範本

專案裡已經附好可直接改值的部署檔案：

- `/deploy/update-proxy/.env.example`
- `/deploy/update-proxy/Caddyfile`
- `/deploy/update-proxy/ecosystem.config.cjs`
- `/deploy/update-proxy/voter-service-update-proxy.service`

建議做法：

1. 把 repo 放到主機，例如 `/opt/voter-service-system`
2. 複製 `.env.example` 到 `/etc/voter-service-system/update-proxy.env`
3. 把 `Caddyfile` 的網域改成你的更新網域，例如 `updates.example.com`
4. 二選一啟動：
   - `systemd`
   - `PM2`

---

## 最短部署路徑（Ubuntu + Caddy + systemd）

```bash
sudo mkdir -p /opt/voter-service-system /etc/voter-service-system
git clone <your-private-repo-url> /opt/voter-service-system
cd /opt/voter-service-system
npm ci
sudo cp deploy/update-proxy/.env.example /etc/voter-service-system/update-proxy.env
sudo cp deploy/update-proxy/voter-service-update-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voter-service-update-proxy
```

接著把 `deploy/update-proxy/Caddyfile` 內容合併進你的 Caddy 設定，再 reload Caddy。

---

## 使用 systemd

```bash
sudo cp deploy/update-proxy/voter-service-update-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voter-service-update-proxy
sudo systemctl status voter-service-update-proxy
```

環境檔預設路徑：

```text
/etc/voter-service-system/update-proxy.env
```

---

## 使用 PM2

```bash
pm2 start deploy/update-proxy/ecosystem.config.cjs --env production
pm2 save
pm2 status
```

---

## 驗證步驟

### 1. 檢查 proxy 基本健康

```bash
curl http://127.0.0.1:8787/health
```

預期：

```json
{"status":"ok"}
```

### 2. 檢查 latest metadata

若 proxy 沒加 token：

```bash
curl "http://127.0.0.1:8787/api/updates/latest?current=1.0.27&platform=darwin&arch=arm64"
```

若 proxy 有加 token：

```bash
curl \
  -H "Authorization: Bearer $VOTER_SERVICE_UPDATE_PROXY_TOKEN" \
  "http://127.0.0.1:8787/api/updates/latest?current=1.0.27&platform=darwin&arch=arm64"
```

預期要看到：

- `latest`
- `has_update`
- `platform_asset.url`
- `feeds.win`
- `feeds.mac`

### 3. 檢查 Windows generic metadata

```bash
curl http://127.0.0.1:8787/api/updates/generic/win/latest.yml
```

預期：

- 200 OK
- 回傳 `latest.yml`
- 內容中 `path:` / `files[].url` 為原始檔名

### 4. 檢查桌面版

若沒有把 proxy 內建進安裝包，才需要在桌面版宿主機另外設定：

```bash
VOTER_SERVICE_UPDATE_PROXY_URL=https://updates.example.com
VOTER_SERVICE_UPDATE_PROXY_TOKEN=...
```

重啟 app 後檢查：

- 系統設定 → 軟體更新
- 點擊「檢查更新」
- macOS 可取得最新版 metadata 與 DMG 下載連結
- Windows 可透過 generic provider 抓 `latest.yml`

### 5. 檢查瀏覽器下載頁

private repo 的 GitHub Release 頁面不適合作為交付連結，因為沒有 GitHub 權限的人會看不到或無法下載。請改貼 update proxy 的下載頁：

```text
https://updates.example.com/download
```

目前支援的穩定下載路徑：

```text
https://updates.example.com/download/windows
https://updates.example.com/download/windows-portable
https://updates.example.com/download/mac-arm64
https://updates.example.com/download/mac-x64
```

用 curl 快速驗證：

```bash
curl -I https://updates.example.com/download
curl -I https://updates.example.com/download/windows
```

預期：

- `/download` 回傳 `200` 與 `text/html`
- `/download/windows` 回傳 `200`，且有 `content-disposition: attachment`
- 不需要 `Authorization` header

### 6. 檢查 reverse proxy 後的公開網址

若前面有掛 Caddy / Nginx / Tunnel，請再驗一次外部網址：

```bash
curl -H "Authorization: Bearer $VOTER_SERVICE_UPDATE_PROXY_TOKEN" \
  "https://updates.example.com/api/updates/latest?current=1.0.26&platform=darwin&arch=arm64"
```

預期回傳中的 `platform_asset.url` / `feeds.win` / `feeds.mac` 都應該是 `https://updates.example.com/...`，不應該是 `127.0.0.1` 或內網 IP。

---

## 部署建議

### 最簡單

- 自己的 VM / VPS
- `npm ci`
- `npm run start:update-proxy`
- 前面掛 Nginx / Caddy / Cloudflare Tunnel

### 若要放雲端平台

只要平台支援常駐 Node HTTP server 即可，例如：

- Fly.io
- Render
- Railway
- 自管 Docker

不建議先用純靜態平台，因為這個 proxy 需要：

- server-side GitHub token
- 動態代抓 private release
- 代理 asset stream

---

## 失敗排查

### `update_release_unavailable`

表示 proxy 沒拿到 latest release。

先檢查：

1. `VOTER_SERVICE_UPDATE_GITHUB_TOKEN` 是否有效
2. token 是否有讀 private repo release 權限
3. release 是否已 publish，不是 draft

### `update_asset_not_found`

表示 latest release 存在，但找不到對應 asset。

先檢查：

1. release 裡是否真的有 `latest.yml` / `latest-mac.yml`
2. mac DMG / Windows EXE 是否有上傳成功
3. release workflow 是否只成功一半

### 桌面版仍顯示 GitHub 相關錯誤

表示桌面版沒有吃到 proxy 設定。

先檢查：

1. `VOTER_SERVICE_UPDATE_PROXY_URL` 是否真的在桌面版程序環境中
2. 若 proxy 需要 token，`VOTER_SERVICE_UPDATE_PROXY_TOKEN` 是否也有設定
3. 重啟 app 後再測一次

---

## 注意事項

- macOS 仍然是「下載 DMG -> 使用者拖曳到 Applications」流程，因為未簽章 app 不能靜默覆蓋
- Windows 透過 generic feed 可以恢復 one-click 更新
- proxy 只是讓 private release 可被安全代抓，不會改變目前未簽章的 macOS 安裝限制
