import { build } from 'esbuild'

await build({
  entryPoints: ['electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist-electron/preload.js',
  external: ['electron'],
  format: 'cjs',
})

await build({
  entryPoints: ['electron/preload-unlock.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: 'dist-electron/preload-unlock.js',
  external: ['electron'],
  format: 'cjs',
})

console.log('✅ dist-electron/preload.js & preload-unlock.js built')
