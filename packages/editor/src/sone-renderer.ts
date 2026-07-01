import {
  DEFAULT_TEXT_PROPS,
  defaultLineBreakerIterator,
  fontBuilder,
  type SoneRenderer,
} from 'sone'

const registeredFonts = new Set<string>()
const measureCanvas = document.createElement('canvas')

const sharedMethods: Omit<SoneRenderer, 'dpr'> = {
  breakIterator: defaultLineBreakerIterator,

  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = width * devicePixelRatio
    canvas.height = height * devicePixelRatio
    canvas.getContext('2d')?.scale(devicePixelRatio, devicePixelRatio)
    return canvas
  },

  measureText(text: string, props: Parameters<SoneRenderer['measureText']>[1]) {
    const ctx = measureCanvas.getContext('2d')!
    ctx.font = fontBuilder(props)
    ctx.letterSpacing = `${props.letterSpacing ?? 0}px`
    ctx.wordSpacing = `${props.wordSpacing ?? 0}px`
    return ctx.measureText(text)
  },

  hasFont: (name: string) => registeredFonts.has(name),

  async registerFont(name: string, source: string | string[]) {
    const srcs = Array.isArray(source) ? source : [source]
    await Promise.all(srcs.map(async src => {
      // @fontsource: "inter-all-400-normal.woff" → weight 400
      const fontsourceMatch = src.match(/-(\d{3})-(?:normal|italic)/)
      // TTF naming conventions: calibrib → bold 700, calibril → light 300, calibriz → bold italic
      const ttfSuffixWeight: Record<string, string> = { b: '700', l: '300', li: '300' }
      const ttfMatch = src.match(/([a-z]+?)([bi]*)\.ttf(?:\?|$)/i)
      const ttfWeight = ttfMatch ? ttfSuffixWeight[ttfMatch[2].toLowerCase()] : undefined
      const ttfStyle = ttfMatch && ttfMatch[2].toLowerCase().includes('i') ? 'italic' : undefined

      const descriptors: FontFaceDescriptors = fontsourceMatch
        ? { weight: fontsourceMatch[1] }
        : { ...(ttfWeight ? { weight: ttfWeight } : {}), ...(ttfStyle ? { style: ttfStyle } : {}) }

      const face = new FontFace(name, `url(${src})`, descriptors)
      await face.load()
      document.fonts.add(face)
    }))
    registeredFonts.add(name)
  },

  async unregisterFont(name: string) {
    for (const face of document.fonts) {
      if (face.family === name || face.family === `"${name}"`) {
        document.fonts.delete(face)
      }
    }
    registeredFonts.delete(name)
  },

  resetFonts() {
    for (const name of registeredFonts) {
      for (const face of document.fonts) {
        if (face.family === name || face.family === `"${name}"`) {
          document.fonts.delete(face)
        }
      }
    }
    registeredFonts.clear()
  },

  async loadImage(src: string | Uint8Array): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      if (typeof src === 'string') {
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      } else {
        const blob = new Blob([src.buffer as ArrayBuffer])
        const url = URL.createObjectURL(blob)
        img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
        img.src = url
      }
    })
  },

  getDefaultTextProps: () => DEFAULT_TEXT_PROPS,
  Path2D,
  debug: () => ({ layout: false, text: false }),
}

export function createRenderer(dpr: number): SoneRenderer {
  return { ...sharedMethods, dpr: () => dpr }
}

export const browserRenderer = createRenderer(window.devicePixelRatio)
