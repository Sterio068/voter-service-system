# 選民服務系統 — 商用與分發說明

## 授權

本專案以 **GNU Affero General Public License v3.0 (AGPL-3.0)** 公開。

完整授權條款見 [LICENSE](LICENSE) 與 <https://www.gnu.org/licenses/agpl-3.0.txt>。

## 我們對「商用」的立場

AGPL-3.0 並未禁止商業使用。我們之所以選擇 AGPL 而非 MIT/Apache，是為了：

1. **使用者可自由下載、安裝、自架部署**（區網、Tailscale、雲端皆可）。
2. **任何修改後再分發或對外提供服務**（包含對外 SaaS／網路服務）的個人或組織，**必須將完整修改後的原始碼以同樣 AGPL-3.0 授權公開**。
3. 換句話說：你可以拿這套系統去服務你的選民／團隊，但**不能把它包裝成封閉式商品再賣給別人**。

如果你有 AGPL 不允許的商用需求（例如希望在保持原始碼私有的條件下做衍生商業產品），請聯繫原作者洽談**雙重授權（dual license）**。

## 不收集任何遙測

本系統為**本機單機 / 區網 / Tailscale** 部署，所有資料儲存於使用者自己的 SQLite 檔案，**沒有任何往原作者伺服器傳送資料的程式碼**。自動更新只會向 GitHub Release API 取版本資訊。

## 商標

「選民服務系統」名稱與圖示為原作者保留權利；fork 後請更名再分發，避免混淆。

## 第三方元件

詳見 `package.json` 的 `dependencies` / `devDependencies`，主要包含：

- Electron、React、Antd、Fastify、better-sqlite3、Playwright（皆為 MIT / BSD / Apache 系列）
- pdfmake（MIT，含 Roboto 字型 Apache-2.0；Noto Sans TC 為 SIL Open Font License）
- electron-updater（MIT）

各元件授權條款均隨 npm 套件保留於 `node_modules/`，二次散布請保留原始 license。
