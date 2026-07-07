// ── Sone-native block model ─────────────────────────────────────────────────
// Blocks store sone props directly — no HTML anywhere. The canvas renders each
// block through sone itself, and Copy Sone serializes the same mapping, so the
// artboard is pixel-identical to the generated layout code.

export type BlockType = 'text' | 'rect' | 'hline' | 'vline' | 'photo' | 'list' | 'table'

// A styled run of text → sone Span. Only overrides are stored; unset fields
// inherit the block-level Text defaults.
export interface TextSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  size?: number
  font?: string
}

export interface TextProps {
  spans: TextSpan[]
  size: number
  color: string
  align: 'left' | 'center' | 'right' | 'justify'
  /** line-height multiplier (sone convention), 0 = default */
  lineHeight: number
  /** font family; empty = inherit page font */
  font: string
}

export type DashStyle = 'solid' | 'dashed' | 'dotted'

export interface RectProps {
  fill: string
  stroke: string
  strokeWidth: number
  radius: number
  dash: DashStyle
}

export interface LineProps {
  stroke: string
  strokeWidth: number
  dash: DashStyle
}

export interface PhotoProps {
  src: string
  fit: '' | 'cover' | 'contain' | 'fill'
}

export type ListStyle = 'disc' | 'circle' | 'square' | 'dash' | 'decimal' | 'none'

export interface ListProps {
  items: string[]
  listStyle: ListStyle
  size: number
  color: string
  /** vertical gap between items */
  gap: number
  /** font family; empty = inherit page font */
  font: string
}

export interface TableCell {
  text: string
  colspan: number
  rowspan: number
  bg: string
  align: 'left' | 'center' | 'right'
  bold: boolean
}

export interface TableProps {
  /** row-major grid of cells; cells covered by a span are omitted (null) */
  rows: (TableCell | null)[][]
  colWidths: number[]      // px per column
  rowHeights: number[]     // px per row (min height)
  borderColor: string
  borderWidth: number
  size: number
  color: string
  headerRow: boolean       // style first row as header
  headerBg: string
  font: string
}

export type BlockProps = TextProps | RectProps | LineProps | PhotoProps | ListProps | TableProps

export interface SoneBlock {
  id: string
  type: BlockType
  x: number   // left from artboard origin, px
  y: number   // top from artboard origin, px
  w: number   // explicit width px; 0 = auto (text wraps at artboard width)
  h: number   // explicit height px; 0 = auto (content height)
  rotation?: number   // degrees, clockwise
  /** stamp this block at the same in-page offset on every page (header/footer) */
  repeat?: boolean
  props: BlockProps
}

// Pages are y-ranges of one tall artboard: page N spans
// [N*paperHeight, (N+1)*paperHeight). renderPages(..., { pageHeight }) splits
// the generated layout on those exact boundaries. A block with repeat=true is
// stamped on every page (headers/footers); text tokens {page}/{pages} are
// substituted per page.
export interface VeDoc {
  paperWidth: number
  paperHeight: number
  pages: number
  bg: string
  font: string
  blocks: SoneBlock[]
}
