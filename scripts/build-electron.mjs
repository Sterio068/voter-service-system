import { build } from 'esbuild'
import { builtinModules } from 'module'

const external = [
  'electron',
  'bcrypt',
  'better-sqlite3',
  'electron-updater',
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
]

await build({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist-electron/main.js',
  external,
  format: 'cjs',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

console.log('✅ dist-electron/main.js built')
