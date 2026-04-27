import { build } from 'esbuild'
import { builtinModules } from 'module'

const external = [
  'electron',
  'bcrypt',
  'better-sqlite3',
  'electron-updater',
  // pdfmake uses require.resolve('pdfmake/package.json') at runtime to
  // locate its bundled Roboto fonts. Bundling it (a) triggers the esbuild
  // 'require-resolve-not-external' warning and (b) breaks that path at
  // runtime because the bundled file no longer sits next to fonts/. Keep
  // pdfmake (and its only runtime dep, pdfkit) external — node_modules
  // is shipped via electron-builder asarUnpack anyway.
  'pdfmake',
  'pdfmake/js/Printer',
  'pdfkit',
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
