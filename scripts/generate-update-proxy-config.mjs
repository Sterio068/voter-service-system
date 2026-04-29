import fs from 'fs'
import path from 'path'

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const outputDir = path.join(process.cwd(), 'generated-resources')
const outputPath = path.join(outputDir, 'update-proxy.json')

const url = firstNonEmpty(
  process.env.VOTER_SERVICE_UPDATE_PROXY_URL,
  process.env.UPDATE_PROXY_URL,
)
const token = firstNonEmpty(
  process.env.VOTER_SERVICE_UPDATE_PROXY_TOKEN,
  process.env.UPDATE_PROXY_TOKEN,
)

const payload = url
  ? {
      url,
      ...(token ? { token } : {}),
      generatedAt: new Date().toISOString(),
      managedByInstaller: true,
    }
  : {
      generatedAt: new Date().toISOString(),
      managedByInstaller: false,
    }

fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

if (url) {
  console.log(`✅ generated-resources/update-proxy.json 已產生：${url}`)
} else {
  console.log('ℹ️ 未提供 update proxy URL，已產生空白 update-proxy.json')
}
