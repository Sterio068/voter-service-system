import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const testsRoot = path.join(projectRoot, 'tests')

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

const testFiles = collectTestFiles(testsRoot).sort()

if (testFiles.length === 0) {
  console.error(`Could not find any test files under '${testsRoot}'`)
  process.exit(1)
}

const forwardedArgs = process.argv.slice(2)
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...forwardedArgs, ...testFiles],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
)

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
