// ── Sone-native block model ─────────────────────────────────────────────────
// Blocks store sone props directly — no HTML anywhere. The canvas renders each
// block through sone itself, and Copy Sone serializes the same mapping, so the
// artboard is pixel-identical to the generated layout code.

export type BlockType = 'text' | 'rect' | 'hline' | 'vline' | 'photo' | 'list'

export interface TextProps {
  text: string
  size: number
  color: string
  weight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right' | 'justify'
  /** line-height multiplier (sone convention), 0 = default */
  lineHeight: number
  /** font family; empty = inherit page font */
  font: string
}

export interface RectProps {
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
}

export interface LineProps {
  stroke: string
  strokeWidth: number
  dash: 'solid' | 'dashed' | 'dotted'
}

export interface PhotoProps {
  src: string
  fit: '' | 'cover' | 'contain' | 'fill'
}

export interface ListProps {
  items: string[]
  size: number
  color: string
  /** font family; empty = inherit page font */
  font: string
}

export type BlockProps = TextProps | RectProps | LineProps | PhotoProps | ListProps

export interface SoneBlock {
  id: string
  type: BlockType
  x: number   // left from artboard origin, px
  y: number   // top from artboard origin, px
  w: number   // explicit width px; 0 = auto (text wraps at artboard width)
  h: number   // explicit height px; 0 = auto (content height)
  props: BlockProps
}

// Pages are y-ranges of one tall artboard: page N spans
// [N*paperHeight, (N+1)*paperHeight). renderPages(..., { pageHeight }) splits
// the generated layout on those exact boundaries, so there is no PageBreak
// flow marker — dragging content below a page guide moves it to the next page.
export interface VeDoc {
  paperWidth: number
  paperHeight: number
  pages: number
  bg: string
  font: string
  blocks: SoneBlock[]
}
