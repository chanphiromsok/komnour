import { PDFDocument } from 'pdf-lib'
import { jsxToSvg, svgToCanvas } from '@komnour/renderer'
import type { Font } from '@komnour/renderer'
import type { ReactNode } from 'react'

export interface Page {
  node: ReactNode
  width?: number
  height?: number
}

// A4 at 96dpi
const A4 = { width: 794, height: 1123 }

export async function buildPdf(
  pages: Page[],
  fonts: Font[],
  defaultSize = A4
): Promise<Buffer> {
  const merged = await PDFDocument.create()

  for (const page of pages) {
    const w = page.width ?? defaultSize.width
    const h = page.height ?? defaultSize.height

    const svg = await jsxToSvg(page.node, w, h, fonts)
    const canvas = await svgToCanvas(svg, w, h)

    // skia-canvas renders vector PDF per page
    const pagePdfBytes = await canvas.toBuffer('application/pdf')
    const srcPdf = await PDFDocument.load(pagePdfBytes)
    const [copied] = await merged.copyPages(srcPdf, [0])
    merged.addPage(copied)
  }

  return Buffer.from(await merged.save())
}
