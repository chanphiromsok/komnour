import type { Block, ParsedDoc, StyleMap } from '../types'

let seq = 0
const uid = () => `b${++seq}`

export function parseDoc(rawHtml: string): ParsedDoc | null {
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
    const root = doc.body.firstElementChild
    if (!root) return null
    const shell = (root.cloneNode(false) as Element).outerHTML
    const openTag = shell.slice(0, shell.indexOf('>') + 1)
    const closeTag = `</${root.tagName.toLowerCase()}>`
    const blocks: Block[] = Array.from(root.children).map(el => ({
      id: uid(),
      html: el.outerHTML,
      tagName: el.tagName.toLowerCase(),
    }))
    return { openTag, closeTag, blocks }
  } catch { return null }
}

export function serializeDoc({ openTag, closeTag }: ParsedDoc, blocks: Block[]): string {
  return [openTag, ...blocks.map(b => '  ' + b.html), closeTag].join('\n')
}

export function getBlockStyles(block: Block): StyleMap {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild as HTMLElement | null
  if (!el) return {}
  const out: StyleMap = {}
  for (let i = 0; i < el.style.length; i++) {
    const p = el.style[i]
    out[p] = el.style.getPropertyValue(p)
  }
  return out
}

export function getRootStyles(openTag: string): StyleMap {
  const doc = new DOMParser().parseFromString(`${openTag}<br></br>`, 'text/html')
  const el = doc.body.firstElementChild as HTMLElement | null
  if (!el) return {}
  const out: StyleMap = {}
  for (let i = 0; i < el.style.length; i++) {
    const p = el.style[i]
    out[p] = el.style.getPropertyValue(p)
  }
  return out
}

export function setBlockStyle(block: Block, prop: string, value: string): Block {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild as HTMLElement | null
  if (!el) return block
  if (value === '') el.style.removeProperty(prop)
  else el.style.setProperty(prop, value)
  return { ...block, html: el.outerHTML }
}

export function getBlockAttr(block: Block, attr: string): string {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  return doc.body.firstElementChild?.getAttribute(attr) ?? ''
}

export function setBlockAttr(block: Block, attr: string, value: string): Block {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild
  if (!el) return block
  if (value === '') el.removeAttribute(attr)
  else el.setAttribute(attr, value)
  return { ...block, html: el.outerHTML }
}

export function setRootStyle(doc: ParsedDoc, prop: string, value: string): ParsedDoc {
  const tmpDoc = new DOMParser().parseFromString(`${doc.openTag}${doc.closeTag}`, 'text/html')
  const el = tmpDoc.body.firstElementChild as HTMLElement | null
  if (!el) return doc
  if (value === '') el.style.removeProperty(prop)
  else el.style.setProperty(prop, value)
  const full = el.outerHTML
  const newOpenTag = full.slice(0, full.lastIndexOf(doc.closeTag))
  return { ...doc, openTag: newOpenTag }
}

// ── SVG shape helpers ─────────────────────────────────────────────────────

export function getSvgShape(block: Block): 'line' | 'rect' | 'circle' | null {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const svg = doc.body.firstElementChild
  if (svg?.tagName.toLowerCase() !== 'svg') return null
  const tag = svg.firstElementChild?.tagName.toLowerCase() ?? ''
  if (tag === 'line' || tag === 'rect' || tag === 'circle') return tag as 'line' | 'rect' | 'circle'
  return null
}

export function getSvgAttr(block: Block, attr: string): string {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  return doc.body.querySelector('svg > *')?.getAttribute(attr) ?? ''
}

export function getSvgRootAttr(block: Block, attr: string): string {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  return doc.body.firstElementChild?.getAttribute(attr) ?? ''
}

export function setSvgAttr(block: Block, attr: string, value: string): Block {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const shape = doc.body.querySelector('svg > *')
  if (!shape) return block
  if (value === '') shape.removeAttribute(attr)
  else shape.setAttribute(attr, value)
  return { ...block, html: (doc.body.firstElementChild as HTMLElement)?.outerHTML ?? block.html }
}

export function setSvgDimension(block: Block, dim: 'width' | 'height', px: number): Block {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const svg = doc.body.firstElementChild
  if (!svg) return block
  svg.setAttribute(dim, String(px))
  const shape = svg.firstElementChild
  if (shape) {
    const tag = shape.tagName.toLowerCase()
    if (tag === 'rect') {
      shape.setAttribute(dim, String(px - 1))
    } else if (tag === 'line') {
      if (dim === 'height') shape.setAttribute('y2', String(px))
      // hline x2 stays "100%", don't touch
    }
  }
  return { ...block, html: (svg as HTMLElement).outerHTML }
}

// ── Layout helpers ────────────────────────────────────────────────────────

export function makeFlexRow(left: Block, right: Block): Block {
  const html = `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;"><div style="flex:1">${left.html}</div><div style="flex:1">${right.html}</div></div>`
  return { id: uid(), html, tagName: 'div' }
}

export function isFlexRow(block: Block): boolean {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild as HTMLElement | null
  if (!el || el.style.display !== 'flex') return false
  const cols = Array.from(el.children)
  return cols.length >= 2 && cols.every(c => (c as HTMLElement).style.flex === '1')
}

export function getFlexColumns(block: Block): Array<{ html: string; tagName: string }> {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild
  if (!el) return []
  return Array.from(el.children).map(wrapper => ({
    html: wrapper.innerHTML,
    tagName: (wrapper.firstElementChild?.tagName ?? 'div').toLowerCase(),
  }))
}

export function setFlexColumns(block: Block, columnHtmls: string[]): Block {
  const doc = new DOMParser().parseFromString(block.html, 'text/html')
  const el = doc.body.firstElementChild
  if (!el) return block
  while (el.lastChild) el.removeChild(el.lastChild)
  for (const html of columnHtmls) {
    const wrapper = doc.createElement('div')
    wrapper.style.flex = '1'
    wrapper.innerHTML = html
    el.appendChild(wrapper)
  }
  return { ...block, html: (el as HTMLElement).outerHTML }
}

// ── Block operations ──────────────────────────────────────────────────────

export function deleteBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter(b => b.id !== id)
}

export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const idx = blocks.findIndex(b => b.id === id)
  if (idx === -1) return blocks
  const copy: Block = { ...blocks[idx], id: uid() }
  return [...blocks.slice(0, idx + 1), copy, ...blocks.slice(idx + 1)]
}

export function reorderBlocks(blocks: Block[], fromIdx: number, toIdx: number): Block[] {
  const next = [...blocks]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return next
}

export function addBlock(blocks: Block[], tagName: string, afterId: string | null): Block[] {
  const templates: Record<string, string> = {
    p:          '<p style="font-size: 13px; line-height: 22px; margin-bottom: 16px; color: #333;">New paragraph</p>',
    h1:         '<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 12px; color: #0d1117;">Heading 1</h1>',
    h2:         '<h2 style="font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #0d1117;">Heading 2</h2>',
    div:        '<div style="margin-bottom: 16px;">New section</div>',
    'page-break':'<page-break></page-break>',
    // Legacy CSS hr — kept so old saved blocks still render; new h-line uses SVG
    hr:         '<svg data-shape="hline" width="100%" height="12" style="display:block;overflow:visible;margin:24px 0;"><line x1="0" y1="6" x2="100%" y2="6" stroke="#e1e4e8" stroke-width="1"/></svg>',
    rect:       '<svg data-shape="rect" width="160" height="80" style="display:block;overflow:visible;margin-bottom:16px;"><rect x="0.5" y="0.5" width="159" height="79" fill="#e8edf3" stroke="#c0c8d4" stroke-width="1" rx="4"/></svg>',
    vline:      '<svg data-shape="vline" width="20" height="80" style="display:block;overflow:visible;margin:0 auto 16px;"><line x1="10" y1="0" x2="10" y2="80" stroke="#e1e4e8" stroke-width="2"/></svg>',
    img:        '<img src="" alt="" style="width: 100%; height: auto; display: block; margin-bottom: 16px;" />',
    ul:         '<ul style="font-size: 13px; line-height: 22px; padding-left: 20px; margin-bottom: 16px;"><li>Item 1</li><li>Item 2</li></ul>',
  }
  const html = templates[tagName] ?? `<${tagName}>New ${tagName}</${tagName}>`
  const parsedTag = new DOMParser().parseFromString(html, 'text/html')
    .body.firstElementChild?.tagName.toLowerCase() ?? tagName
  const newBlock: Block = { id: uid(), html, tagName: parsedTag }
  if (!afterId) return [...blocks, newBlock]
  const idx = blocks.findIndex(b => b.id === afterId)
  return [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)]
}
