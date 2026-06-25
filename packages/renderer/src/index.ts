import satori, { type Font } from 'satori'
import { Canvas, loadImage } from 'skia-canvas'
import type { ReactNode } from 'react'

export type { Font }

export async function jsxToSvg(
  node: ReactNode,
  width: number,
  height: number,
  fonts: Font[]
): Promise<string> {
  return satori(node as any, { width, height, fonts })
}

export async function svgToCanvas(svg: string, width: number, height: number): Promise<Canvas> {
  const canvas = new Canvas(width, height)
  const ctx = canvas.getContext('2d')
  const img = await loadImage(`data:image/svg+xml,${encodeURIComponent(svg)}`)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

export { Canvas, loadImage }
