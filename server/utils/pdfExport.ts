/**
 * PDF Export Utility
 *
 * Server-side PDF generation using pdfmake's PdfPrinter API.
 *
 * Font: Noto Sans TC (Traditional Chinese variable weight font), bundled at
 * `resources/fonts/NotoSansTC-Regular.ttf`. The same TTF is registered for
 * regular/bold/italics/bolditalics — pdfmake requires all four slots, but the
 * variable font handles weight naturally for our use case.
 *
 * If the font file is missing (e.g. dev sandbox, unusual deploy), we gracefully
 * fall back to pdfmake's bundled Roboto. CJK characters will not render in
 * that case but the endpoint stays functional.
 *
 * Path resolution:
 *  - Dev (tsx, no Electron): `<projectRoot>/resources/fonts/...`
 *  - Production Electron (asar): we look up `process.resourcesPath` first,
 *    then walk up from `__dirname` (dist-server is one level under project).
 */
import path from 'path'
import fs from 'fs'
// pdfmake's server-side printer lives in the compiled CJS bundle. We require
// the compiled `js/Printer`, `js/virtual-fs`, and `js/URLResolver` and pick up
// `.default` exports so the require works under our `tsconfig.server.json`
// (CommonJS) target without needing the browser-only `pdfmake.min.js` bundle.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake/js/Printer').default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const virtualFs = require('pdfmake/js/virtual-fs').default
// eslint-disable-next-line @typescript-eslint/no-var-requires
const URLResolver = require('pdfmake/js/URLResolver').default

// Type aliases — @types/pdfmake doesn't ship Printer types, only browser API.
type FontDescriptor = {
  normal: string
  bold: string
  italics: string
  bolditalics: string
}
type FontDictionary = Record<string, FontDescriptor>
// We accept the same docDefinition shape as pdfmake's TDocumentDefinitions but
// can't import it cleanly here, so use a permissive type alias.
export type PdfDocDefinition = Record<string, any>

const FONT_FILENAME = 'NotoSansTC-Regular.ttf'
const ROBOTO_DIR = path.join(require.resolve('pdfmake/package.json'), '..', 'fonts', 'Roboto')

/**
 * Resolve the project root for both dev (tsx) and packaged (Electron asar) modes.
 *
 * - In dev / Node tests: cwd is the project root.
 * - In Electron production: `process.resourcesPath` points to the unpacked
 *   resources dir alongside app.asar.
 */
function resolveFontPath(): string {
  const candidates: string[] = []

  // Electron packaged build: extra resources end up under resourcesPath
  const electronResources = (process as any).resourcesPath as string | undefined
  if (electronResources) {
    candidates.push(path.join(electronResources, 'fonts', FONT_FILENAME))
    candidates.push(path.join(electronResources, 'app.asar', 'resources', 'fonts', FONT_FILENAME))
    candidates.push(path.join(electronResources, 'resources', 'fonts', FONT_FILENAME))
  }
  // Dev / node test: project root is cwd
  candidates.push(path.join(process.cwd(), 'resources', 'fonts', FONT_FILENAME))
  // Walk up from compiled dist-server/utils/pdfExport.js
  candidates.push(path.join(__dirname, '..', '..', 'resources', 'fonts', FONT_FILENAME))
  candidates.push(path.join(__dirname, '..', '..', '..', 'resources', 'fonts', FONT_FILENAME))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

/**
 * Build the font dictionary that pdfmake's PdfPrinter needs.
 *
 * Returns Noto Sans TC with CJK support when the bundled TTF is found;
 * otherwise falls back to Roboto (no CJK glyphs but still produces a valid PDF).
 */
function buildFontDictionary(): { fonts: FontDictionary; defaultFont: string } {
  const notoPath = resolveFontPath()
  if (notoPath) {
    return {
      fonts: {
        NotoSansTC: {
          normal: notoPath,
          bold: notoPath,
          italics: notoPath,
          bolditalics: notoPath,
        },
      },
      defaultFont: 'NotoSansTC',
    }
  }
  // Fallback: pdfmake's bundled Roboto (Latin-only)
  return {
    fonts: {
      Roboto: {
        normal: path.join(ROBOTO_DIR, 'Roboto-Regular.ttf'),
        bold: path.join(ROBOTO_DIR, 'Roboto-Medium.ttf'),
        italics: path.join(ROBOTO_DIR, 'Roboto-Italic.ttf'),
        bolditalics: path.join(ROBOTO_DIR, 'Roboto-MediumItalic.ttf'),
      },
    },
    defaultFont: 'Roboto',
  }
}

// Cache the printer + default font — font lookup hits disk and is stable.
let cachedPrinter: any = null
let cachedDefaultFont = ''
function getPrinter(): { printer: any; defaultFont: string } {
  if (!cachedPrinter) {
    const { fonts, defaultFont } = buildFontDictionary()
    const resolver = new URLResolver(virtualFs)
    // Block any URL fetches — fonts are local files only.
    resolver.setUrlAccessPolicy(() => false)
    cachedPrinter = new PdfPrinter(fonts, virtualFs, resolver)
    cachedDefaultFont = defaultFont
  }
  return { printer: cachedPrinter, defaultFont: cachedDefaultFont }
}

/**
 * Render a pdfmake doc definition to a PDF Buffer.
 *
 * The caller may omit `defaultStyle.font` — we inject our resolved font
 * (Noto Sans TC or Roboto fallback) so callers don't have to know which
 * font is loaded.
 */
export async function buildPdf(docDef: PdfDocDefinition): Promise<Buffer> {
  const { printer, defaultFont } = getPrinter()
  const definition: PdfDocDefinition = {
    ...docDef,
    defaultStyle: { font: defaultFont, fontSize: 11, ...(docDef.defaultStyle || {}) },
  }
  const pdfDoc = await printer.createPdfKitDocument(definition)
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
    pdfDoc.on('error', (err: Error) => reject(err))
    pdfDoc.end()
  })
}

/**
 * Whether a CJK-capable font is loaded. Useful for warning logs / tests.
 */
export function hasCjkFont(): boolean {
  const { defaultFont } = getPrinter()
  return defaultFont !== 'Roboto'
}
