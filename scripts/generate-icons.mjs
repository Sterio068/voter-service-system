import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// ── PNG helpers ───────────────────────────────────────────────
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[n] = c >>> 0
}
const crc32 = (buf) => {
  let crc = 0xffffffff
  for (const b of buf) crc = (crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, c])
}
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function buildPNG(W, H, rgba) {
  // RGBA PNG (color type 6)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit depth, RGBA
  const raw = Buffer.alloc((1 + W * 4) * H)
  for (let y = 0; y < H; y++) {
    const rowOff = y * (1 + W * 4)
    raw[rowOff] = 0 // filter none
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 4
      const dst = rowOff + 1 + x * 4
      raw[dst]     = rgba[src]
      raw[dst + 1] = rgba[src + 1]
      raw[dst + 2] = rgba[src + 2]
      raw[dst + 3] = rgba[src + 3]
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ── Math helpers ──────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Smooth step anti-alias: returns 0..1 coverage of a pixel edge */
function aaStep(edge, val) {
  const d = val - edge
  return clamp(d + 0.5, 0, 1)
}

/** Distance from point to rectangle edge (negative = inside) */
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r
}

/** Signed distance from a line segment */
function lineSDF(px, py, ax, ay, bx, by, thickness) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = clamp(t, 0, 1)
  const nx = px - (ax + t * dx)
  const ny = py - (ay + t * dy)
  return Math.sqrt(nx * nx + ny * ny) - thickness
}

// ── Draw the icon at given size ───────────────────────────────
// cornerRadius: 0 = square (Windows), S * 0.225 = iOS rounded (Mac)
function generateIconRGBA(S, cornerRadius) {
  const rgba = new Uint8Array(S * S * 4)

  // Color palette
  const BG_TOP    = [0x16, 0x77, 0xFF]   // #1677FF
  const BG_BOT    = [0x00, 0x30, 0xA8]   // #0030A8
  const ACCENT    = [0x36, 0xAF, 0xFF]   // light accent
  const WHITE     = [0xFF, 0xFF, 0xFF]
  const PALE      = [0xB8, 0xD8, 0xFF]   // pale blue line

  const cx = S / 2, cy = S / 2
  const radius = (cornerRadius !== undefined) ? cornerRadius : S * 0.225

  // Document shape params (centered, slightly above center)
  const DW = S * 0.38, DH = S * 0.46
  const DCX = cx, DCY = cy + S * 0.02
  const fold = S * 0.075            // fold size
  const lineR = S * 0.017           // line thickness
  const ckR   = S * 0.022           // checkmark thickness

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4

      // ── Background rounded rect ─────────────────────────
      const bgSDF = roundedRectSDF(x, y, cx, cy, S / 2, S / 2, radius)
      const bgAlpha = clamp(1 - (bgSDF + 0.5), 0, 1)
      if (bgAlpha <= 0) { rgba[i + 3] = 0; continue }

      // Gradient (diagonal top-left → bottom-right)
      const t = clamp((x / S * 0.4 + y / S * 0.6), 0, 1)
      let R = lerp(BG_TOP[0], BG_BOT[0], t)
      let G = lerp(BG_TOP[1], BG_BOT[1], t)
      let B = lerp(BG_TOP[2], BG_BOT[2], t)

      // Subtle radial vignette
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (S * 0.5)
      const vig = 1 - dist * 0.18
      R *= vig; G *= vig; B *= vig

      // ── Document body ───────────────────────────────────
      // Main rect (exclude top-right fold corner)
      const docSDF = roundedRectSDF(x, y, DCX, DCY, DW / 2, DH / 2, S * 0.018)
      const inDoc = docSDF < 0

      // Fold corner: top-right triangle to cut
      const foldTR_x = DCX + DW / 2
      const foldTR_y = DCY - DH / 2
      // Cut triangle: x > foldTR_x - fold AND y < foldTR_y + fold AND x - foldTR_x + fold > foldTR_y - y + fold (diagonal)
      const inFoldCut = (x > foldTR_x - fold - 1) && (y < foldTR_y + fold + 1) &&
                        ((x - (foldTR_x - fold)) + (foldTR_y + fold - y) > fold)

      if (inDoc && !inFoldCut) {
        // White document with slight alpha blend
        const docA = clamp(-docSDF * 2, 0, 1)
        R = lerp(R, WHITE[0], docA * 0.95)
        G = lerp(G, WHITE[1], docA * 0.95)
        B = lerp(B, WHITE[2], docA * 0.95)
      }

      // Fold flap (pale blue triangle)
      const inFoldFlap = (x > foldTR_x - fold) && (y < foldTR_y + fold) &&
                         ((x - (foldTR_x - fold)) + (foldTR_y - y) < fold)
      if (inFoldFlap) {
        R = lerp(R, ACCENT[0], 0.7)
        G = lerp(G, ACCENT[1], 0.7)
        B = lerp(B, ACCENT[2], 0.7)
      }

      // ── Text lines on document ──────────────────────────
      if (inDoc && !inFoldCut) {
        const lineX1 = DCX - DW * 0.32
        const lineX2 = DCX + DW * 0.30
        const lineY1 = DCY + DH * 0.05
        const lineY2 = DCY + DH * 0.18
        const lineY3 = DCY + DH * 0.30

        const l1 = lineSDF(x, y, lineX1, lineY1, lineX2, lineY1, lineR)
        const l2 = lineSDF(x, y, lineX1, lineY2, lineX2, lineY2, lineR)
        const l3 = lineSDF(x, y, lineX1, lineY3, lineX2 * 0.7 + lineX1 * 0.3, lineY3, lineR)

        const lineA = Math.max(
          clamp(1 - (l1 + 0.5), 0, 1),
          clamp(1 - (l2 + 0.5), 0, 1),
          clamp(1 - (l3 + 0.5), 0, 1)
        )
        if (lineA > 0) {
          R = lerp(R, PALE[0], lineA * 0.7)
          G = lerp(G, PALE[1], lineA * 0.7)
          B = lerp(B, PALE[2], lineA * 0.7)
        }
      }

      // ── Checkmark (✓) in upper part of document ─────────
      if (inDoc && !inFoldCut) {
        const ckCX = DCX - DW * 0.05
        const ckCY = DCY - DH * 0.18

        // Checkmark: two segments forming ✓
        const seg1 = lineSDF(x, y, ckCX - DW * 0.14, ckCY, ckCX - DW * 0.04, ckCY + DH * 0.09, ckR)
        const seg2 = lineSDF(x, y, ckCX - DW * 0.04, ckCY + DH * 0.09, ckCX + DW * 0.14, ckCY - DH * 0.12, ckR)

        // Circle background for checkmark
        const circleR = DW * 0.20
        const circDist = Math.sqrt((x - ckCX) ** 2 + (y - ckCY) ** 2)
        const inCircle = circDist < circleR

        if (inCircle) {
          const circA = clamp((circleR - circDist) * 3, 0, 1)
          R = lerp(R, BG_TOP[0], circA * 0.85)
          G = lerp(G, BG_TOP[1], circA * 0.85)
          B = lerp(B, BG_TOP[2], circA * 0.85)
        }

        const ckA = Math.max(
          clamp(1 - (seg1 + 0.5), 0, 1),
          clamp(1 - (seg2 + 0.5), 0, 1)
        )
        if (ckA > 0 && inCircle) {
          R = lerp(R, WHITE[0], ckA)
          G = lerp(G, WHITE[1], ckA)
          B = lerp(B, WHITE[2], ckA)
        }
      }

      rgba[i]     = clamp(Math.round(R), 0, 255)
      rgba[i + 1] = clamp(Math.round(G), 0, 255)
      rgba[i + 2] = clamp(Math.round(B), 0, 255)
      rgba[i + 3] = Math.round(bgAlpha * 255)
    }
  }
  return rgba
}

// ── Scale down using box-filter average ──────────────────────
function scaleDown(srcRgba, srcS, dstS) {
  const ratio = srcS / dstS
  const out = new Uint8Array(dstS * dstS * 4)
  for (let dy = 0; dy < dstS; dy++) {
    for (let dx = 0; dx < dstS; dx++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0
      const sy0 = Math.floor(dy * ratio), sy1 = Math.ceil((dy + 1) * ratio)
      const sx0 = Math.floor(dx * ratio), sx1 = Math.ceil((dx + 1) * ratio)
      for (let sy = sy0; sy < sy1 && sy < srcS; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcS; sx++) {
          const si = (sy * srcS + sx) * 4
          r += srcRgba[si]; g += srcRgba[si + 1]; b += srcRgba[si + 2]; a += srcRgba[si + 3]
          count++
        }
      }
      const di = (dy * dstS + dx) * 4
      out[di]     = Math.round(r / count)
      out[di + 1] = Math.round(g / count)
      out[di + 2] = Math.round(b / count)
      out[di + 3] = Math.round(a / count)
    }
  }
  return out
}

// ── ICO (with white background composite for Windows) ────────
function toRGBA_whiteComposite(rgba, S) {
  const out = new Uint8Array(S * S * 4)
  for (let i = 0; i < S * S; i++) {
    const si = i * 4
    const alpha = rgba[si + 3] / 255
    out[si]     = Math.round(rgba[si]     * alpha + 255 * (1 - alpha))
    out[si + 1] = Math.round(rgba[si + 1] * alpha + 255 * (1 - alpha))
    out[si + 2] = Math.round(rgba[si + 2] * alpha + 255 * (1 - alpha))
    out[si + 3] = 255
  }
  return out
}

function generateICO(pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBuf.length, 8); entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, pngBuf])
}

function generateICNS(png256, png512, png1024) {
  const parts = []
  const addPart = (type, buf) => {
    const t = Buffer.from(type, 'ascii')
    const sz = Buffer.alloc(4); sz.writeUInt32BE(8 + buf.length)
    parts.push(Buffer.concat([t, sz, buf]))
  }
  addPart('ic08', png256)   // 256x256
  addPart('ic09', png512)   // 512x512
  addPart('ic10', png1024)  // 1024x1024
  const body = Buffer.concat(parts)
  const magic = Buffer.from('icns', 'ascii')
  const totalSz = Buffer.alloc(4); totalSz.writeUInt32BE(8 + body.length)
  return Buffer.concat([magic, totalSz, body])
}

// ── Generate ──────────────────────────────────────────────────
if (!existsSync('resources')) mkdirSync('resources')

// Mac：iOS 圓角
console.log('  生成 1024px 圖示（Mac 圓角）...')
const rgba1024 = generateIconRGBA(1024, 1024 * 0.225)
const png1024  = buildPNG(1024, 1024, rgba1024)

console.log('  縮放 512px（Mac）...')
const rgba512  = scaleDown(rgba1024, 1024, 512)
const png512   = buildPNG(512, 512, rgba512)

console.log('  縮放 256px（Mac）...')
const rgba256  = scaleDown(rgba1024, 1024, 256)
const png256   = buildPNG(256, 256, rgba256)

// Windows：方角（radius = 0）
console.log('  生成 256px 圖示（Windows 方角）...')
const rgba256Win = generateIconRGBA(256, 0)
const rgba256WinWB = toRGBA_whiteComposite(rgba256Win, 256)
const png256ico  = buildPNG(256, 256, rgba256WinWB)

writeFileSync(join('resources', 'icon.png'),  png1024)
writeFileSync(join('resources', 'icon.ico'),  generateICO(png256ico))
writeFileSync(join('resources', 'icon.icns'), generateICNS(png256, png512, png1024))

console.log('✅ Icon files generated in resources/')
