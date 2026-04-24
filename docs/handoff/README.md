# 選民服務系統 — 交接文件

這個資料夾包含讓新的 AI 或開發者接手本專案所需的所有文件。

## 📚 文件索引

| 檔案 | 用途 | 適合誰 |
|------|------|--------|
| **[HANDOFF.md](./HANDOFF.md)** | 主交接文件：系統本質、技術棧、架構、開發流程、發佈流程 | 第一份要讀的文件 |
| **[API_REFERENCE.md](./API_REFERENCE.md)** | 全部 203 個 API 端點完整列表 | 做前後端整合時 |
| **[DB_SCHEMA.md](./DB_SCHEMA.md)** | 41 張表的欄位、關係、索引、規則 | 改資料模型時 |
| **[DEVELOPMENT_PITFALLS.md](./DEVELOPMENT_PITFALLS.md)** | 踩過的 25 個坑 + 正確做法 | **改程式前務必讀** |

## 🚀 快速上手流程

1. 先讀 [HANDOFF.md](./HANDOFF.md) § 1-4（系統本質、技術棧、結構、開發環境）
2. 跑起來 dev 環境：`npm ci && npm run dev`
3. 讀 [HANDOFF.md](./HANDOFF.md) § 17（檔案閱讀順序）讀關鍵程式碼
4. 改 bug 前先 scan [DEVELOPMENT_PITFALLS.md](./DEVELOPMENT_PITFALLS.md)
5. 查 API 時翻 [API_REFERENCE.md](./API_REFERENCE.md)
6. 改 schema 時參考 [DB_SCHEMA.md](./DB_SCHEMA.md)

## 🔗 其他資源

- GitHub repo: https://github.com/Sterio068/voter-service-system
- 使用者手冊: `docs/user-manual.html`
- 安裝指南: `docs/installation-guide.html`
- Release: https://github.com/Sterio068/voter-service-system/releases

## 最後狀態快照（2026-04-23）

- **版本**：v1.0.8
- **最後提交**：`dabe83f` — 多代理除錯修正
- **重大未處理事項**：
  - 沒有自動化測試
  - AI API key / Google Client Secret 明文儲存
  - `VENDOR_PASSWORD` 寫死在 `electron/main.ts`
  - `xlsx` 有 CVE 需升到 `@e965/xlsx`
  - `server/routes/` 有幾個殘留 `.js` 可清除
