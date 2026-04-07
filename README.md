# 選民服務系統

本地單機版選民服務管理系統，專為民意代表辦公室設計。支援 Windows 與 macOS 一鍵安裝，不需網際網路連線，所有資料存放本機。

## 功能模組

| 模組 | 說明 |
|------|------|
| 選民資料 | 選民基本資料管理、分組、標籤、聯絡記錄 |
| 陳情案件 | 案件追蹤、狀態流程、處理紀錄、附件上傳 |
| 提案追蹤 | 議員提案進度管理、AI 智慧匯入解析 |
| 公文管理 | 收發文管理、Word 公文格式匯出 |
| 行程安排 | 月曆檢視、待辦事項、Google 日曆同步 |
| 禮儀記錄 | 婚喪喜慶送禮明細、廠商管理、收支統計 |
| 活動管理 | 活動籌備、參與者名單、問卷調查串聯 |
| 統計報表 | 陳情趨勢、人員績效、區域熱力圖 |
| AI 助理 | 自動摘要、分類建議、備註建議（支援 Gemini / OpenAI / Ollama） |
| 系統管理 | 帳號管理、角色權限、稽核日誌、資料備份還原 |

## 安裝

### Windows

前往 [Releases](https://github.com/Sterio068/voter-service-system/releases) 下載最新版：

- `選民服務系統 Setup x.x.x.exe`：標準安裝程式（建議）
- `選民服務系統 x.x.x.exe`：免安裝 Portable 版

> 首次執行可能出現 Windows SmartScreen 警告，點擊「其他資訊」→「仍要執行」即可。

### macOS

前往 [Releases](https://github.com/Sterio068/voter-service-system/releases) 下載：

- `選民服務系統-x.x.x-arm64.dmg`：Apple Silicon（M 系列）
- `選民服務系統-x.x.x.dmg`：Intel

掛載 DMG 後將應用程式拖入 Applications 資料夾。

## 首次登入

| 帳號 | 密碼 |
|------|------|
| `admin` | `admin123` |

**請於登入後立即至「個人設定」變更密碼。**

## 區域網路多人共用

系統主機啟動後，同一 WiFi 的其他電腦、手機、平板可直接用瀏覽器連線：

```
http://<主機IP>:3000
```

主機 IP 顯示於「系統設定 → 網路資訊」。

## AI 助理設定

前往「系統設定 → AI 助理設定」，選擇供應商並填入 API 金鑰：

| 供應商 | 取得金鑰 | 備註 |
|--------|---------|------|
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) | 有免費額度，推薦 |
| OpenAI | [platform.openai.com](https://platform.openai.com) | 付費 |
| Ollama | 本機安裝 | 完全離線，需安裝 [Ollama](https://ollama.com) |

## 技術架構

```
Electron 41  ─── 桌面殼層（跨平台）
Fastify      ─── 本地 HTTP API 伺服器
SQLite       ─── 本地資料庫（better-sqlite3）
React 18     ─── 前端介面
Ant Design 5 ─── UI 元件庫
```

## 開發

```bash
# 安裝依賴
npm install

# 開發模式（同時啟動前後端 + Electron）
npm run dev

# 打包安裝檔
npm run dist:mac    # macOS DMG
npm run dist:win    # Windows NSIS + Portable
```

Node.js 20 以上。

## 版本紀錄

### v1.0.1
- 新增提案追蹤模組（CRUD、狀態流程、統計、Excel 匯出）
- 新增 AI 助理（Gemini / OpenAI / Ollama，含 SSRF 防護與 prompt injection 防護）
- 陳情、公文、提案加入 AI 摘要、分類建議、備註建議
- 安全強化：SQL injection 白名單、ISO 時間戳、分頁邊界檢查
- 使用說明頁補充活動、問卷、通知、報表、聯絡記錄等模組說明
- Windows 安裝檔新增 Portable 免安裝版

### v1.0.0
- 初始發布：選民管理、陳情追蹤、公文管理、行程月曆
- 禮儀記錄、廠商管理、收支統計
- 活動管理、問卷調查、待辦事項、通知中心
- Google 日曆雙向同步
- 區域網路多人共用、行動版介面
- Windows / macOS 一鍵安裝
