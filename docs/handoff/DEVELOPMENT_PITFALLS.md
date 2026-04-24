# 開發陷阱與最佳實踐

本檔記錄開發過程中踩過的坑，**下一位開發者請先讀完再改程式**。

---

## 1. Zod schema 必須接受 null

### 症狀
使用者新增資料「沒反應」、列表沒更新、選民也沒建立，但前端只顯示「立案失敗」或「儲存失敗」。

### 根因
Antd Form 的 Select、DatePicker、InputNumber 在清空時送 `null`。但：

```typescript
voter_id: z.number().optional()  // ❌ 只接受 number | undefined，拒絕 null
```

`null` 傳來時 Zod 回 400，整個 request 失敗。

### 修正
```typescript
voter_id: z.number().nullable().optional()           // ✅
gender: z.enum([...]).nullable().optional()          // ✅
mobile: z.string().regex(...).or(z.literal('')).nullable().optional()  // ✅
```

### 同步前端

```typescript
// ❌ 直接展開可能送 null
await api.post('/petitions', { ...values, status: 'pending' })

// ✅ 過濾 null / undefined / ''
const cleaned: Record<string, any> = {}
for (const [k, v] of Object.entries(values)) {
  if (v !== null && v !== undefined && v !== '') cleaned[k] = v
}
await api.post('/petitions', { ...cleaned, status: 'pending' })
```

### 錯誤訊息一定要具體

```typescript
// ❌ 使用者看不出哪裡錯
catch { message.error('立案失敗') }

// ✅
catch (err: any) { message.error(err.response?.data?.error || '立案失敗') }
```

---

## 2. Ant Design Select 空 options 無法打字

### 症狀
「陳情類別只顯示空格，打不進字」。

### 根因
`<Select showSearch>` 只能搜尋**既有 options**。當 `categories = []`，使用者打字沒有任何候選 → 看起來像 disabled。

### 修正
改用 `AutoComplete`（可自由輸入 + 有候選提示）：

```tsx
<AutoComplete
  allowClear
  placeholder={categories.length === 0 ? '尚未設定類別，可直接輸入' : '選擇或輸入關鍵字'}
  options={categories.map(c => ({ value: c }))}
  filterOption={(input, option) => 
    String(option?.value || '').toLowerCase().includes(input.toLowerCase())
  }
/>
```

AutoComplete 的 value 是 string（不會是 array），跟後端 schema 相容。

---

## 3. 條件式 Form.Item 會讓資料消失

### 症狀
切換公文類型（收文/發文）後，已填的欄位值消失。

### 根因
```tsx
{docType === 'incoming' && <Form.Item name="org_doc_number"><Input /></Form.Item>}
```
條件為 false 時 React unmount Form.Item，Antd Form 內部 state 該欄位被清除。即使切回 true 也是新實例。

### 修正
用 `hidden` prop 代替：

```tsx
<Form.Item name="org_doc_number" hidden={docType !== 'incoming'}>
  <Input />
</Form.Item>
```

Form.Item 會保留在 DOM 但不顯示，state 不會遺失。

---

## 4. initialValues 地雷

### 症狀
Modal 每次打開後 Form 狀態異常（或沒問題，但 devtools 一直 warning）。

### 根因
每次 render 都建立新的 object：
```tsx
<Form initialValues={{ channel: '電話' }}>  // ❌ 每次都是新物件
```

### 修正
提到模組層級常數：
```tsx
const FORM_INITIAL = { channel: '電話' }
<Form initialValues={FORM_INITIAL}>  // ✅
```

或用 `useMemo`：
```tsx
const initial = useMemo(() => ({ channel: '電話' }), [])
```

---

## 5. 時區混用災難

### 症狀
陳情結案時間 `closed_at` 比其他欄位 `created_at` 晚 8 小時，比較時序錯亂。

### 根因
```typescript
// ❌ 寫入 UTC 時間到 localtime 欄位
updateData.closed_at = new Date().toISOString().replace('T', ' ').slice(0, 19)
```

SQLite 其他欄位用 `datetime('now','localtime')` 是 local 時間，但 `toISOString()` 是 UTC。

### 修正
**統一全部用 localtime**：
```typescript
updateData.closed_at = (db.prepare("SELECT datetime('now','localtime') AS t").get() as any).t

// 或在 SQL 內直接寫
db.prepare("UPDATE ... SET closed_at=datetime('now','localtime'), ... WHERE id=?")
```

前端日期處理用 dayjs，送後端一律 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss` string。

---

## 6. JSON.parse 無 try-catch

### 症狀
整個路由回 500，使用者看到「系統錯誤」。

### 根因
```typescript
const tags = JSON.parse(voter.tags || '[]')  // ❌ 舊資料可能不是合法 JSON
```

### 修正
```typescript
let tags: string[] = []
try { tags = JSON.parse(voter.tags || '[]') } catch { tags = [] }
```

SQLite 沒有 JSON column type（除非啟用 JSON1 extension），存的是 TEXT，一定要防壞資料。

---

## 7. Transaction 的正確姿勢

### 錯誤 1：async function 不能用在 db.transaction()

```typescript
// ❌ better-sqlite3 是同步 API，async 會提前 resolve transaction
db.transaction(async () => {
  await something()   // ← commit 已經完成了！
})
```

### 錯誤 2：手動 BEGIN/COMMIT 會被內層 catch 吞掉

```typescript
// ❌ 內層 try-catch 吞噬後，外層 COMMIT 仍會執行
db.exec('BEGIN')
try {
  db.prepare('...').run(...)
  try {
    db.prepare('...').run(...)  // 失敗
  } catch {}   // ← 吞掉，外層繼續
  db.exec('COMMIT')  // ← 部分成功被提交！
} catch { db.exec('ROLLBACK') }
```

### 正確寫法

```typescript
// ✅ 用 db.transaction() wrapper
const txn = db.transaction(() => {
  db.prepare('...').run(...)
  db.prepare('...').run(...)   // 任何 throw 都會自動 rollback
  return result
})
const result = txn.immediate()  // IMMEDIATE 鎖定（寫入用）
// 或 txn() — DEFERRED（讀為主）
```

### 巢狀 transaction

better-sqlite3 會自動用 SAVEPOINT 支援巢狀。重構時：

```typescript
// 內層函式不自帶 transaction
function generateCaseNumberInTxn(): string { ... }

// 獨立呼叫時自帶
function generateCaseNumber(): string {
  return db.transaction(() => generateCaseNumberInTxn()).immediate()
}

// 外層 transaction 內呼叫
db.transaction(() => {
  const num = generateCaseNumberInTxn()  // 共用外層 transaction
  ...
}).immediate()
```

---

## 8. Electron native modules 版本不合

### 症狀
啟動時 `Error: ... NODE_MODULE_VERSION 141 ... requires NODE_MODULE_VERSION 145`

### 根因
better-sqlite3 / bcrypt 是 C++ 模組，要 compile 對應 Electron 的 Node ABI 版本。本機 Node 版本 != Electron 內建 Node 版本。

### 修正
```bash
# 使用 electron-rebuild
./node_modules/.bin/electron-rebuild

# 或 npm rebuild
npm rebuild better-sqlite3 --runtime=electron --target=41.1.1 --disturl=https://electronjs.org/headers --abi=145

# electron-builder 會自動處理
npm run dist:mac
```

---

## 9. macOS 授權簽署問題

### 症狀
使用者下載 DMG 後開啟被 Gatekeeper 擋下「已損毀，無法打開」。

### 根因
沒有 Apple Developer 憑證，無法簽署 + notarize。

### 修正（package.json）
```json
"mac": {
  "identity": null,              // 明確不簽
  "gatekeeperAssess": false,     // build 時不檢查
  "hardenedRuntime": false       // 不啟用 hardened runtime
}
```

### 使用者繞過（臨時）
```bash
xattr -cr /Applications/選民服務系統.app
```

### 長期解：付 Apple Developer 帳號（US$99/年）

---

## 10. Windows 安裝檔無法 cross-compile

### 症狀
在 macOS 跑 `electron-builder --win` 失敗：native modules 找不到 Windows binary。

### 根因
better-sqlite3、bcrypt 需要 Windows PE32+ binary，macOS 上沒有。

### 修正
1. **CI**（推薦）：GitHub Actions `windows-latest` runner build
2. **本機**：用 Windows 電腦跑 `npm run dist:win`

---

## 11. GitHub Actions artifact 配額爆炸

### 症狀
CI Upload Artifact 步驟失敗：`Artifact storage quota has been hit`

### 根因
每個 CI run 會產生 ~500MB artifacts，個人 free tier 500MB 很快爆。

### 修正
**跳過 artifact，build 完直接上傳 Release**：
```yaml
- name: Upload macOS to Release
  uses: softprops/action-gh-release@v2
  with:
    files: release/*.dmg
```

---

## 12. 前端 bundle 過大

### 症狀
首次開啟應用卡 3-5 秒。

### 根因
單一 bundle 2.9MB（fullcalendar、docx、@e965/xlsx 全打進 main）。

### 修正
`vite.config.ts` 切 manualChunks：
```typescript
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'antd-vendor': ['antd', '@ant-design/icons'],
  'chart-vendor': ['recharts'],
  'calendar-vendor': ['@fullcalendar/react', ...],
  'file-vendor': ['@e965/xlsx', 'docx'],
  'util-vendor': ['dayjs', 'axios', 'zustand'],
}
```
main bundle 從 2.9MB → 372KB，vendor 可快取。

---

## 13. React setState after unmount 警告

### 症狀
Console 警告 `Can't perform a React state update on an unmounted component`。

### 根因
```typescript
useEffect(() => {
  api.get('/xxx').then(r => setState(r.data))   // ← unmount 後仍 setState
}, [])
```

### 修正（兩種方式）

**A. AbortController**（現代）：
```typescript
useEffect(() => {
  const ctrl = new AbortController()
  api.get('/xxx', { signal: ctrl.signal }).then(r => setState(r.data))
  return () => ctrl.abort()
}, [])
```

**B. mountedRef**（無 signal 時）：
```typescript
const mountedRef = useRef(true)
useEffect(() => {
  mountedRef.current = true
  return () => { mountedRef.current = false }
}, [])

const safeSet = (setter, value) => {
  if (mountedRef.current) setter(value)
}
```

---

## 14. 前端 catch 吞噬錯誤

### 症狀
使用者操作沒反應，但看不到任何訊息。

### 根因
```typescript
try { await api.post(...) } catch {}   // ❌ 黑洞
```

### 修正
**至少顯示訊息**：
```typescript
try { await api.post(...) } 
catch (err: any) { message.error(err.response?.data?.error || '操作失敗') }
```

**或透過 axios interceptor 全域處理**（`client/utils/api.ts`）：
```typescript
api.interceptors.response.use(
  r => r,
  err => {
    // 網路錯誤統一提示
    if (!err.response && err.code === 'ERR_NETWORK') {
      message.error('無法連線到伺服器')
    }
    return Promise.reject(err)
  }
)
```

---

## 15. SQLite `PRAGMA integrity_check` 結果

### 症狀
備份壞了但系統說「OK」。

### 根因
```typescript
const result = tempDb.prepare('PRAGMA integrity_check').get() as any
if (result?.integrity_check !== 'ok') { ... }   // ❌ 只看第一行
```

若 DB 壞損，`integrity_check` 會回多行錯誤訊息。只看第一行可能剛好是 'ok'。

### 修正
```typescript
const rows = tempDb.prepare('PRAGMA integrity_check').all() as any[]
const isOk = rows.length === 1 && rows[0].integrity_check === 'ok'
```

---

## 16. 權限模組忘記加進 rolePermissions

### 症狀
新增的 CRUD 模組怎麼測都 403。

### 根因
`server/middleware/auth.ts` 的 4 個角色都需要明確列出 module。沒列就是空陣列 → 全部 action 被擋。

### 修正
每新加一個模組，**四個角色全部更新**：
```typescript
rolePermissions = {
  admin: {
    ...,
    new_module: ['view', 'create', 'edit', 'delete']
  },
  supervisor: { ..., new_module: ['view', 'create', 'edit'] },
  assistant: { ..., new_module: ['view', 'create', 'edit'] },
  volunteer: { ..., new_module: ['view'] }
}
```

---

## 17. parseInt 漏 radix

```typescript
parseInt('08')      // ❌ 某些舊引擎會當成八進位 → 0
parseInt('08', 10)  // ✅ 一律 10 進位
```

ESLint `radix` 規則會抓，但專案沒啟用，手動檢查。

---

## 18. 前端手動 URL 導航沒觸發 useEffect

### 症狀
改 URL query string（例如 `?action=new`）後 Drawer 沒開。

### 根因
```typescript
useEffect(() => {
  if (new URLSearchParams(location.search).get('action') === 'new') {
    setDrawerOpen(true)
  }
}, [])  // ❌ 空依賴，location 變化不觸發
```

### 修正
```typescript
useEffect(() => {
  if (new URLSearchParams(location.search).get('action') === 'new') {
    setDrawerOpen(true)
  }
}, [location.search])  // ✅
```

---

## 19. Promise.all vs Promise.allSettled

批量操作時用錯可能導致「第一個失敗就全部不跑」：

```typescript
// ❌ 一個失敗整批 throw，失去進度資訊
await Promise.all(ids.map(id => api.put(`/x/${id}`)))

// ✅ 全部跑完再統計
const results = await Promise.allSettled(ids.map(id => api.put(`/x/${id}`)))
const ok = results.filter(r => r.status === 'fulfilled').length
const failed = results.length - ok
```

---

## 20. 軟刪除 vs 硬刪除

**主檔表** 一律軟刪除（`is_active=0`），方便還原。

**關聯表** 用硬刪除（關聯結束就沒意義）：
- `voter_tags`、`group_members`、`event_participants`、`ceremony_items`

**查詢時**務必加 `WHERE is_active=1`：
```typescript
db.prepare('SELECT * FROM voters WHERE id=? AND is_active=1').get(id)
```
忘記加會看到已刪除的資料。

---

## 21. 共通類別管理

很多 dropdown 的選項放在 `categories` 表共用：

```typescript
// 取陳情類別
api.get('/admin/categories?type=petition_category')

// 取團體類別
api.get('/admin/categories?type=group_category')

// 取行程類型
api.get('/admin/categories?type=schedule_type')
```

新模組要動態類別時**不要**再建新表，用 categories + type 即可。

---

## 22. 前端路徑（絕對 vs 相對）

Electron production 模式下頁面是 `file://`，不能用絕對路徑 `/assets/`。  
**務必確保 `vite.config.ts` 用相對路徑**：
```typescript
export default defineConfig({
  base: './',  // 或 vite 預設的 relative
})
```

package.json 的 `"homepage": "./"` 也是必要的。

---

## 23. 閒置登出時計要加事件

`MainLayout.tsx` 用閒置計時器自動登出。必須監聽**多種事件**重置：

```typescript
const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
events.forEach(e => window.addEventListener(e, handler, { passive: true }))
```

只監聽 mousedown 會讓使用者打字過程被誤判閒置。

---

## 24. 跨視窗資料同步

多個視窗開同一 DB，需要同步。現有機制：`useDataSync` hook（透過 polling 或 EventSource）。

新增 mutation 後，在頁面加：
```typescript
useDataSync((events) => {
  const relevant = events.some(e => e.target_type === 'voter')
  if (relevant) fetchVoters()
}, [])
```

---

## 25. CI 觸發規則

`.github/workflows/ci.yml` 會在 PR 與 `main` push 時跑 typecheck、測試、build 與 production audit。

`.github/workflows/release.yml` 只在 `push` 到 tag `v*` 時才會 build 安裝檔：

```yaml
on:
  push:
    tags:
      - 'v*'
```

**別忘了推 tag**：
```bash
git tag v1.0.9
git push origin v1.0.9
```

---

## 26. Secret 加密 key 與還原

`settings` 內的 `jwt_secret`、AI key、Google/LINE secret 與 Google token 會以 `enc:v1:` 形式加密。

正式部署請固定設定：

```bash
VOTER_SERVICE_SETTINGS_KEY=一組長且隨機的部署密鑰
```

若未設定，系統會用機器資訊產生 fallback key。這能降低單機 DB 外流風險，但跨機還原備份時可能無法解密既有 secret。

JWT secret 解密失敗時 server 會拒絕啟動，避免靜默重生 secret 造成 session 全失效且掩蓋資料毀損。

---

## 27. Rate limiting 版本相容性

本專案目前是 Fastify 5，因此使用 `@fastify/rate-limit@10`。若未來降回 Fastify 4，需同步降到 `@fastify/rate-limit@9`，否則可能出現 plugin 相容性問題。

---

## 28. CSP 與 Ant Design CSS-in-JS

全域 CSP 在 `server/utils/securityHeaders.ts`。目前 `script-src` 不允許 inline script，但 `style-src` 仍保留 `'unsafe-inline'`，原因是 Ant Design 5 會在 runtime 注入樣式。

如果未來要移除 inline style，需要先設計 nonce/hash 或改造樣式注入策略。不要直接刪掉 `style-src 'unsafe-inline'`，否則 production UI 可能失去樣式。

---

## 29. 附件上傳不要信任副檔名

附件副檔名由 `server/utils/fileSecurity.ts` 依 MIME 決定，不使用使用者原始檔名副檔名。上傳也會做 PDF/圖片基本 magic-byte 檢查。

新增其他附件類型時，需同步更新：

```typescript
ATTACHMENT_MIME_EXTENSIONS
isAllowedAttachmentContent()
```

不要只改前端 `accept`，因為瀏覽器與 multipart MIME 都可以被偽造。

---

## 30. 備份簽章與白名單

本機備份會在 `.db` 旁建立 `.meta.json`，內容包含 SHA-256、schema version、Node version 與 HMAC-SHA256 簽章。

簽章 key 來源優先序：

```bash
VOTER_SERVICE_BACKUP_SIGNING_KEY
BACKUP_SIGNING_KEY
VOTER_SERVICE_SETTINGS_KEY
SETTINGS_ENCRYPTION_KEY
```

若未設定明確 signing key，會沿用 secrets encryption fallback key。這對單機防竄改足夠，但跨機驗證建議固定設定 `VOTER_SERVICE_BACKUP_SIGNING_KEY`。

備份路徑白名單為 opt-in：

```bash
VOTER_SERVICE_BACKUP_ALLOWED_ROOTS="/secure/backups;/Volumes/EncryptedBackup"
```

啟用後，`POST /api/admin/backup/path` 只接受落在白名單根目錄內的路徑。不要在程式裡硬編碼使用者家目錄當白名單，部署環境應明確指定。

---

## 31. 選民匯出預設遮罩 PII

`GET /api/voters/export` 預設會遮罩身份證號、手機、市話、LINE ID、Email、生日與詳細地址。前端選民列表的匯出按鈕固定送 `mask=1`，按鈕文案為「匯出 Excel（遮罩）」。

完整個資匯出需同時符合：

```text
include_sensitive=1
reason 至少 5 個字
currentUser.role === 'admin'
```

完整匯出與遮罩匯出都會寫 audit log，detail 會包含 `masked`、`reason` 與 filter 摘要。不要新增繞過 `/api/voters/export` 的 Excel 下載路徑，否則會破壞稽核與遮罩策略。

相關檔案：

```text
server/utils/piiMasking.ts
server/routes/importExport.ts
tests/server/piiMasking.test.ts
tests/server/apiIntegration.test.ts
```

---

## 32. 陳情新增不可寫入 NULL status

`POST /api/petitions` 會在同一個 IMMEDIATE transaction 內建立選民、產生案號、建立陳情與第一筆處理紀錄。未提供 `status` / `urgency` 時，路由必須明確寫入：

```text
status = pending
urgency = normal
```

不要依賴 DB default，因為 INSERT 若帶入 `NULL` 會覆蓋 default，導致狀態機無法從 `pending` 轉到 `processing`。這個情境已由 `tests/server/apiIntegration.test.ts` 的 petition lifecycle 測試覆蓋。

---

## 33. 行程查詢與衝突檢查要用 overlap 邏輯

行程可能跨日，因此列表查詢不能只用：

```sql
start_time >= ? AND start_time <= ?
```

正確的區間重疊判斷是：

```sql
start_time < rangeEnd
AND COALESCE(end_time, start_time) > rangeStart
```

更新行程也要排除自己，並用 `COALESCE(status, 'scheduled') != 'cancelled'`，避免舊資料 `status` 為 `NULL` 時漏掉衝突。

這個情境已由 `tests/server/apiIntegration.test.ts` 的 schedule conflict / cross-day 測試覆蓋。新增日曆、諮詢或 Google Calendar sync 邏輯時，不要退回只比對 `start_time` 的查詢。

---

## 34. 資料保留不要硬刪選民主檔

選民、陳情、聯絡紀錄、附件與 audit log 有大量關聯。如果資料保留 TTL 直接 `DELETE FROM voters`，很容易造成孤兒資料、報表破洞或稽核鏈斷裂。

目前資料保留策略是：

```text
audit_logs          → 封存到 archive_audit_logs
client_errors       → 超過 TTL 直接刪除
soft-deleted voters → 去識別化，不硬刪主檔
```

執行 API 必須先啟用 `data_retention_enabled=1`，並在 `POST /api/admin/data-retention/run` 傳入：

```text
confirm=RUN_RETENTION
```

新增清理項目前，先補 `GET /api/admin/data-retention/preview` 預覽數量與 integration test，避免不可逆清理沒有 dry-run。

---

## 35. Playwright E2E 不要把登入 rate limit 打爆

登入頁本身需要保留真實 UI smoke，但多個 E2E case 如果每條都重新走 `/api/auth/login` + UI login，很容易把 route-level login rate limit 當成測試瓶頸。

建議做法：

```typescript
const session = await getAdminSession(request)
await page.addInitScript(({ token, user }) => {
  localStorage.setItem('auth-storage', JSON.stringify({
    state: { token, user, isAuthenticated: true },
    version: 0,
  }))
}, session)
```

保留一條測試覆蓋真實登入流程，其餘測試注入 Zustand persist 狀態即可。這樣既不弱化安全限制，也能讓 E2E 更穩。

另外 Ant Design 按鈕文字在 accessible name 中可能被拆成空白，例如「送出」變成 `送 出`。Playwright selector 請用：

```typescript
page.getByRole('button', { name: /送\s*出/ })
```

不要硬比對沒有空白的字串，否則 UI 沒壞但測試會 flaky。

---

## 36. Dashboard / 快捷鍵 deep-link 必須由目標頁解析 URL

Dashboard、快捷鍵與全域搜尋會把使用者帶到特定工作狀態，例如：

```text
/tasks?focus=today
```

目標頁不能只靠本地 state 切換 UI，否則使用者從 Dashboard、快捷鍵、重新整理或分享連結進入時會落回一般列表。

正確做法：

```typescript
const [searchParams, setSearchParams] = useSearchParams()
const [todayFocus, setTodayFocus] = useState(searchParams.get('focus') === 'today')

useEffect(() => {
  setTodayFocus(searchParams.get('focus') === 'today')
}, [searchParams])
```

當使用者在頁面內切換焦點，也要同步更新 URL：

```typescript
const nextParams = new URLSearchParams(searchParams)
nextParams.set('focus', 'today')
setSearchParams(nextParams, { replace: true })
```

新增 Dashboard 卡片或快捷鍵 deep-link 時，請補 Playwright 測試確認 URL 與目標頁狀態一致。

---

**End of DEVELOPMENT_PITFALLS.md**
