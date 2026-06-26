import { sone, Font, renderPages as soneRenderPages, DEFAULT_TEXT_PROPS, defaultLineBreakerIterator, applySpanProps } from 'sone'
import skia from 'skia-canvas'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export { htmlToSone } from './html-to-sone.ts'
export { sanitize } from './sanitize.ts'
export type { SanitizeResult } from './sanitize.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = join(__dirname, '../node_modules/@fontsource/noto-sans-khmer/files')

let fontsLoaded = false

async function ensureFonts() {
  if (fontsLoaded) return
  await Font.load('Noto Sans Khmer', [
    `${fontsDir}/noto-sans-khmer-all-400-normal.woff`,
    `${fontsDir}/noto-sans-khmer-all-700-normal.woff`,
  ])
  await Font.load('Inter', [
    join(__dirname, '../node_modules/@fontsource/inter/files/inter-all-400-normal.woff'),
  ])
  fontsLoaded = true
}

export async function renderToBuffer(html: string, format: 'png' | 'pdf' = 'png'): Promise<Buffer> {
  await ensureFonts()
  const { htmlToSone } = await import('./html-to-sone.ts')
  const { sanitize } = await import('./sanitize.ts')
  const { html: clean } = sanitize(html)
  const layout = htmlToSone(clean).width(794).bg('white')
  if (format === 'pdf') {
    return sone(layout, { pageHeight: 1123 }).pdf()
  }
  return sone(layout).png()
}

// Custom 2× DPR renderer: layout stays at 794px logical, canvas is 2× pixels → crisp zoom
const DPR = 2
const measureCanvas = new skia.Canvas(1, 1)
const hiDpiRenderer = {
  debug: () => ({ layout: false, text: false }),
  hasFont: (name: string) => skia.FontLibrary.has(name),
  Path2D: skia.Path2D,
  breakIterator: defaultLineBreakerIterator,
  createCanvas(width: number, height: number) {
    const canvas = new skia.Canvas(Math.ceil(width * DPR), Math.ceil(height * DPR))
    const ctx = canvas.getContext('2d') as any
    ctx.scale(DPR, DPR)
    return canvas as any
  },
  measureText(text: string, props: any) {
    const ctx = measureCanvas.getContext('2d') as any
    applySpanProps(ctx, props)
    return ctx.measureText(text)
  },
  async registerFont(name: string, source: string | string[]) {
    skia.FontLibrary.use(name, Array.isArray(source) ? source : [source])
  },
  async unregisterFont() {},
  resetFonts() { skia.FontLibrary.reset() },
  async loadImage(src: string | Uint8Array) {
    return skia.loadImage(typeof src === 'string' ? src : Buffer.from(src)) as any
  },
  getDefaultTextProps: () => DEFAULT_TEXT_PROPS,
  dpr: () => DPR,
}

// Returns one PNG buffer per page at 2× DPR — layout correct at 794px, pixels sharp at 2×
export async function renderToPages(html: string): Promise<Buffer[]> {
  await ensureFonts()
  const { htmlToSone } = await import('./html-to-sone.ts')
  const { sanitize } = await import('./sanitize.ts')
  const { html: clean } = sanitize(html)
  const layout = htmlToSone(clean).width(794).bg('white')
  const pages: any[] = await soneRenderPages(layout, hiDpiRenderer as any, { pageHeight: 1123 })
  return Promise.all(pages.map((canvas: any) => canvas.toBuffer('image/png') as Promise<Buffer>))
}
