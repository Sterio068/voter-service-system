/**
 * 台灣戶籍地址解析工具
 * 輸入完整地址，自動拆解為：縣市、鄉鎮市區、村里、門牌地址
 *
 * 支援格式：
 *   台北市信義區信義里信義路5段1號        （含縣市+區+里）
 *   新竹縣竹北市信義路100號               （含縣市+縣轄市，無里）
 *   台北市信義區信義路5段1號               （含縣市+區，無里）
 *   10045台北市中正區臺大里中山南路1號      （含郵遞區號前綴）
 */

export interface ParsedAddress {
  city: string | null        // 縣市
  district: string | null    // 鄉鎮市區
  village: string | null     // 村里
  address: string | null     // 門牌（路段以後）
}

// ── 已知縣市（優先精確比對，避免誤解析）────────────────────
const KNOWN_CITIES = [
  '台北市', '臺北市',
  '新北市',
  '桃園市',
  '台中市', '臺中市',
  '台南市', '臺南市',
  '高雄市',
  '基隆市',
  '新竹市',
  '嘉義市',
  '新竹縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '台東縣', '臺東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
]

// ── 地址解析主函式 ─────────────────────────────────────────
export function parseAddressFields(raw: string | null | undefined): ParsedAddress {
  const empty: ParsedAddress = { city: null, district: null, village: null, address: null }
  if (!raw) return empty

  let s = raw.trim()
  if (!s) return empty

  // 去除開頭的郵遞區號（3碼或5碼數字）
  s = s.replace(/^\d{3,6}\s*/, '')

  let city: string | null = null
  let district: string | null = null
  let village: string | null = null

  // ── 1. 縣市 ──
  // 先試精確比對已知縣市名稱
  let matched = false
  for (const c of KNOWN_CITIES) {
    if (s.startsWith(c)) {
      city = c
      s = s.slice(c.length)
      matched = true
      break
    }
  }
  if (!matched) {
    // 通用規則：2–4 字 + 縣|市
    const m = s.match(/^(.{2,4}[縣市])/)
    if (m) {
      city = m[1]
      s = s.slice(city.length)
    }
  }

  // ── 2. 鄉鎮市區 ──
  // 縣轄市（竹北市、羅東鎮…）、區、鄉、鎮
  // 長度限制 2–6 字，避免吃掉里名
  const distMatch = s.match(/^(.{2,6}?[區鄉鎮])/)
  if (distMatch) {
    district = distMatch[1]
    s = s.slice(district.length)
  } else {
    // 縣轄市（如竹北市，但不能是直轄市）
    const distCityMatch = s.match(/^(.{2,4}市)(?=.{2,}[里村路街巷弄])/)
    if (distCityMatch) {
      district = distCityMatch[1]
      s = s.slice(district.length)
    }
  }

  // ── 3. 村里 ──
  // 條件：里/村 後面接的內容不是另一個行政單位字（區/鄉/鎮），
  // 且整段長度 2–8 字（避免將整個路名誤匹配）
  const villageMatch = s.match(/^(.{2,8}?[里村])(?![區鄉鎮市縣])/)
  if (villageMatch) {
    village = villageMatch[1]
    s = s.slice(village.length)
  }

  // ── 4. 鄰（剝除，不儲存）──
  s = s.replace(/^第?\d+鄰/, '')

  // ── 5. 剩餘門牌地址 ──
  const address = s.trim() || null

  return { city, district, village, address }
}

/**
 * 判斷字串是否為「疑似完整地址」（含縣市或鄉鎮區資訊）
 * 用來決定是否要自動拆解
 */
export function looksLikeFullAddress(s: string | null | undefined): boolean {
  if (!s) return false
  // 包含縣/市 + (區|鄉|鎮|里|村) 等行政單位關鍵字
  return /[縣市][^\d]{0,8}[區鄉鎮]/.test(s) || /[區鄉鎮][^\d]{0,10}[里村]/.test(s)
}
