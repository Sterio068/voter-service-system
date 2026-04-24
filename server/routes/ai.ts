import { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { requirePermission } from '../middleware/auth'
import { aiChat, testAIConnection, getAIConfig, isAIEnabled, sanitizeError } from '../utils/aiClient'
import { setSetting } from '../utils/settings'

const PETITION_CATEGORIES = ['市政建設', '社會福利', '教育文化', '環境衛生', '交通運輸', '都市計畫', '法律諮詢', '就業服務', '其他']
const VALID_PROVIDERS = ['none', 'gemini', 'openai', 'ollama']

// P1: SSRF — 驗證 baseUrl 在寫入前（保留 localhost 供 Ollama）
function validateBaseUrl(raw: string): { ok: boolean; error?: string } {
  let u: URL
  try { u = new URL(raw) } catch { return { ok: false, error: 'URL 格式無效' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: '只允許 http 或 https 協定' }
  const host = u.hostname.toLowerCase()
  const blocked = [/^169\.254\./, /^100\.100\.100\.200$/, /^0\.0\.0\.0$/, /^::$/]
  if (blocked.some(r => r.test(host))) return { ok: false, error: '不允許指向此位址' }
  return { ok: true }
}

// P2: API Key 安全遮罩（防止短 key 全露）
function maskApiKey(key: string): string {
  if (!key) return ''
  return key.length >= 8 ? '***' + key.slice(-4) : '***'
}

// P2: 輸入字串型別+長度驗證
function assertStr(val: any, maxLen: number, name: string): string | null {
  if (val === undefined || val === null) return null
  if (typeof val !== 'string') throw Object.assign(new Error(`${name} 必須為字串`), { code: 400 })
  const s = val.trim()
  if (s.length > maxLen) throw Object.assign(new Error(`${name} 超過最大長度 ${maxLen}`), { code: 400 })
  return s
}

export default async function aiRoutes(fastify: FastifyInstance) {

  // GET /api/ai/config
  fastify.get('/api/ai/config', { preHandler: [requirePermission('settings', 'view')] }, async (req, reply) => {
    const cfg = getAIConfig()
    return reply.send({
      success: true,
      data: {
        provider: cfg.provider,
        model: cfg.model,
        apiKey: maskApiKey(cfg.apiKey),
        apiKeySet: cfg.apiKey.length > 0,
        baseUrl: cfg.baseUrl,
        maxTokens: cfg.maxTokens,
        enabled: isAIEnabled(),
      }
    })
  })

  // PUT /api/ai/config
  fastify.put('/api/ai/config', { preHandler: [requirePermission('settings', 'edit')] }, async (req, reply) => {
    const body = req.body as any
    if (body.provider !== undefined && !VALID_PROVIDERS.includes(body.provider)) {
      return reply.code(400).send({ success: false, error: '無效的供應商' })
    }
    if (body.maxTokens !== undefined) {
      const n = parseInt(String(body.maxTokens), 10)
      // P2: 降低上限至 4096
      if (isNaN(n) || n < 64 || n > 4096) return reply.code(400).send({ success: false, error: 'maxTokens 需介於 64–4096' })
    }
    // P2: model 欄位長度限制
    if (body.model !== undefined && String(body.model).length > 100) {
      return reply.code(400).send({ success: false, error: 'model 名稱過長' })
    }
    // P2: apiKey 長度限制
    if (body.apiKey !== undefined && String(body.apiKey).length > 256) {
      return reply.code(400).send({ success: false, error: 'API 金鑰過長' })
    }
    // P1: SSRF — 驗證 baseUrl
    if (body.baseUrl !== undefined) {
      const check = validateBaseUrl(String(body.baseUrl))
      if (!check.ok) return reply.code(400).send({ success: false, error: `Ollama 端點無效：${check.error}` })
    }
    if (body.provider !== undefined) setSetting('ai_provider', body.provider)
    if (body.model !== undefined) setSetting('ai_model', String(body.model).slice(0, 100))
    if (body.apiKey !== undefined && !String(body.apiKey).startsWith('***')) setSetting('ai_api_key', String(body.apiKey).slice(0, 256))
    if (body.baseUrl !== undefined) setSetting('ai_base_url', String(body.baseUrl))
    if (body.maxTokens !== undefined) setSetting('ai_max_tokens', String(parseInt(body.maxTokens, 10)))
    return reply.send({ success: true, message: 'AI 設定已儲存' })
  })

  // POST /api/ai/test
  fastify.post('/api/ai/test', { preHandler: [requirePermission('settings', 'edit')] }, async (req, reply) => {
    const result = await testAIConnection()
    // P2: 不回傳原始錯誤，sanitizeError 已在 testAIConnection 內套用
    return reply.send({ success: result.ok, data: { ok: result.ok, model: result.model, message: result.message } })
  })

  // POST /api/ai/summarize — P1: 改用 requirePermission('ai','use')
  fastify.post('/api/ai/summarize', { preHandler: [requirePermission('ai', 'use')] }, async (req, reply) => {
    const body = req.body as any
    // P2: 型別+長度驗證
    let text: string
    try {
      const t = assertStr(body.text, 5000, 'text')
      if (!t) return reply.code(400).send({ success: false, error: '內容不可為空' })
      text = t
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }) }

    if (!isAIEnabled()) return reply.code(503).send({ success: false, error: 'AI 功能尚未啟用，請至系統設定配置' })

    const type = ['petition', 'proposal', 'general'].includes(body.type) ? body.type : 'general'
    const sys = type === 'petition'
      ? '你是選民服務助理。請用繁體中文，以 2-3 句話精簡摘要陳情內容重點，包含訴求和關鍵資訊。直接輸出摘要，不需要前言。'
      : type === 'proposal'
      ? '你是議會助理。請用繁體中文，以 2-3 句話精簡摘要提案內容的主要訴求與目的。直接輸出摘要，不需要前言。'
      : '請用繁體中文，以 2-3 句話精簡摘要以下內容重點。直接輸出摘要，不需要前言。'

    try {
      const summary = await aiChat(sys, text.slice(0, 3000))
      // P2: 限制回應長度
      return reply.send({ success: true, data: { summary: summary.slice(0, 1000) } })
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: sanitizeError(e) })
    }
  })

  // POST /api/ai/classify — P1: requirePermission('ai','use')
  fastify.post('/api/ai/classify', { preHandler: [requirePermission('ai', 'use')] }, async (req, reply) => {
    const body = req.body as any
    // P2: 型別+長度驗證
    let title = '', content = ''
    try {
      title = assertStr(body.title, 300, 'title') || ''
      content = assertStr(body.content, 2000, 'content') || ''
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }) }
    if (!title && !content) return reply.code(400).send({ success: false, error: '請提供主旨或內容' })
    if (!isAIEnabled()) return reply.code(503).send({ success: false, error: 'AI 功能尚未啟用，請至系統設定配置' })

    const cats = (db.prepare("SELECT name FROM categories WHERE type='petition_category' AND is_active=1 ORDER BY sort_order").all() as any[]).map(r => r.name)
    const catList = cats.length ? cats : PETITION_CATEGORIES

    const sys = `你是選民服務助理，負責將陳情案件分類。請從以下類別中選出最合適的一個：\n${catList.join('、')}\n只輸出類別名稱，不需要解釋，若無明確符合類別請輸出「其他」。`
    const userMsg = `主旨：${title.slice(0, 200)}\n內容：${content.slice(0, 1000)}`

    try {
      let category = await aiChat(sys, userMsg)
      category = category.replace(/[「」【】\n]/g, '').trim().slice(0, 20)
      if (!catList.includes(category)) category = '其他'
      return reply.send({ success: true, data: { category, categories: catList } })
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: sanitizeError(e) })
    }
  })

  // POST /api/ai/suggest-note — P1: requirePermission('ai','use')
  fastify.post('/api/ai/suggest-note', { preHandler: [requirePermission('ai', 'use')] }, async (req, reply) => {
    const body = req.body as any
    // P2: 型別+長度驗證；至少需要 title 或 content
    let title = '', content = '', status = '', category = ''
    try {
      title = assertStr(body.title, 300, 'title') || ''
      content = assertStr(body.content, 2000, 'content') || ''
      status = assertStr(body.status, 50, 'status') || ''
      category = assertStr(body.category, 100, 'category') || ''
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }) }
    if (!title && !content) return reply.code(400).send({ success: false, error: '請提供主旨或內容' })
    if (!isAIEnabled()) return reply.code(503).send({ success: false, error: 'AI 功能尚未啟用，請至系統設定配置' })

    const type = body.type === 'proposal' ? 'proposal' : 'petition'
    const ctx = type === 'proposal'
      ? `提案主旨：${title}\n提案類型：${category}\n目前狀態：${status}`
      : `陳情主旨：${title}\n類別：${category}\n目前狀態：${status}\n內容摘要：${content.slice(0, 500)}`

    const sys = type === 'proposal'
      ? '你是議會助理。根據提案資訊，建議一則簡短的追蹤備註（2-4 句話），說明後續應注意事項或跟進方向。用繁體中文，直接輸出備註內容。'
      : '你是選民服務助理。根據陳情資訊，建議一則簡短的追蹤備註（2-4 句話），說明建議的後續處理方向或聯絡要點。用繁體中文，直接輸出備註內容。'

    try {
      const note = await aiChat(sys, ctx)
      return reply.send({ success: true, data: { note: note.slice(0, 1000) } })
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: sanitizeError(e) })
    }
  })

  // POST /api/ai/parse-proposal — P1: requirePermission('ai','use')
  fastify.post('/api/ai/parse-proposal', { preHandler: [requirePermission('ai', 'use')] }, async (req, reply) => {
    const body = req.body as any
    let text: string
    try {
      const t = assertStr(body.text, 8000, 'text')
      if (!t) return reply.code(400).send({ success: false, error: '請貼入提案文字' })
      text = t
    } catch (e: any) { return reply.code(400).send({ success: false, error: e.message }) }

    if (!isAIEnabled()) return reply.code(503).send({ success: false, error: 'AI 功能尚未啟用，請至系統設定配置' })

    const sys = `你是資料整理助理。請從以下議會提案文字中，提取結構化資訊並以 JSON 格式回傳。
輸出格式（所有欄位均為字串，若無資料填 null）：
{
  "proposal_number": "提案編號",
  "proposal_date": "YYYY-MM-DD 格式日期，若無則 null",
  "title": "提案主旨",
  "session": "屆次，例如第12屆",
  "meeting": "會議名稱",
  "category": "類別關鍵字",
  "proposal_type": "議員提案 or 市府提案 or 臨時動議 or 請願提案",
  "proposer": "提案人",
  "co_signers": "連署人，多人用逗號分隔",
  "content": "完整提案說明/說明事項"
}
只輸出 JSON，不要有任何其他文字。`

    try {
      const raw = await aiChat(sys, text.slice(0, 4000))
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI 無法解析提案格式')
      // P3: JSON 大小限制，防止記憶體攻擊
      if (jsonMatch[0].length > 8000) throw new Error('AI 回應過大，請縮短輸入文字')
      const parsed = JSON.parse(jsonMatch[0])
      // P2: 後端驗證並清理 AI 回應欄位
      const FIELD_MAX: Record<string, number> = {
        proposal_number: 50, proposal_date: 10, title: 256, session: 50,
        meeting: 100, category: 100, proposal_type: 20, proposer: 100,
        co_signers: 256, content: 4000,
      }
      const clean: Record<string, string | null> = {}
      for (const [k, maxLen] of Object.entries(FIELD_MAX)) {
        const v = parsed[k]
        if (v === null || v === undefined) { clean[k] = null; continue }
        if (typeof v !== 'string') { clean[k] = null; continue }
        clean[k] = v.slice(0, maxLen)
      }
      // 驗證日期格式
      if (clean.proposal_date && !/^\d{4}-\d{2}-\d{2}$/.test(clean.proposal_date)) clean.proposal_date = null
      // 驗證 proposal_type 在白名單內
      const validTypes = ['議員提案', '市府提案', '臨時動議', '請願提案']
      if (clean.proposal_type && !validTypes.includes(clean.proposal_type)) clean.proposal_type = '議員提案'
      return reply.send({ success: true, data: clean })
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: sanitizeError(e) })
    }
  })
}
