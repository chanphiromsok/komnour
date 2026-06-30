export interface Block {
  id: string
  html: string
  tagName: string
}

export interface ParsedDoc {
  openTag: string
  closeTag: string
  blocks: Block[]
}

// CSS property name (kebab-case) → value string
export type StyleMap = Record<string, string>
