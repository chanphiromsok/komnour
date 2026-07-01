export interface Block {
  id: string
  html: string
  tagName: string
  x: number   // left from artboard origin, px
  y: number   // top from artboard origin, px
  w: number   // explicit width px; 0 = auto (shrink to content)
  h: number   // explicit height px; 0 = auto
}

export interface ParsedDoc {
  openTag: string
  closeTag: string
  blocks: Block[]
}

// CSS property name (kebab-case) → value string
export type StyleMap = Record<string, string>
