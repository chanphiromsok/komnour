import type { Block, ParsedDoc, StyleMap } from '../types'

let seq = 0
const uid = () => `b${++seq}`

// ── Document parse / serialize ────────────────────────────────────────────────

export function parseDoc(rawHtml: string): ParsedDoc | null {
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
    const root = doc.body.firstElementChild as HTMLElement | null
    if (!root) return null

    const shell = (root.cloneNode(false) as Element).outerHTML
    const openTag = shell.slice(0, shell.indexOf('>') + 1)
    const closeTag = `</${root.tagName.toLowerCase()}>`

    // Detect format: new format uses data-block wrapper divs
    const firstChild = root.firstElementChild
    const isNewFmt = firstChild != null && firstChild.hasAttribute('data-block')

    let blocks: Block[]

    if (isNewFmt) {
      blocks = Array.from(root.children).map(el => {
        const w = el as HTMLElement
        const inner = w.firstElementChild
        return {
          id: uid(),
          html: inner?.outerHTML ?? w.innerHTML,
          tagName: inner?.tagName.toLowerCase() ?? 'div',
          x: parseFloat(w.style.left)  || 0,
          y: parseFloat(w.style.top)   || 0,
          w: parseFloat(w.style.width) || 0,
          h: parseFloat(w.style.height)|| 0,
        }
      })
    } else {
      // Old format: auto-position blocks stacked vertically
      const pt = parseFloat(root.style.paddingTop)  || parseFloat(root.style.padding) || 0
      const pl = parseFloat(root.style.paddingLeft) || parseFloat(root.style.padding) || 0
      const pr = parseFloat(root.style.paddingRight)|| parseFloat(root.style.padding) || 0
      const rw = parseFloat(root.style.width) || 794
      const bw = Math.max(100, rw - pl - pr)

      let cy = pt || 20
      blocks = Array.from(root.children).map(el => {
        const block: Block = {
          id: uid(),
          html: el.outerHTML,
          tagName: el.tagName.toLowerCase(),
          x: pl || 20,
          y: cy,
          w: bw,
          h: 0,
        }
        cy += 80
        return block
      })
    }

    return { openTag, closeTag, blocks }
  } catch { return null }
}

export function serializeDoc({ openTag, closeTag }: ParsedDoc, blocks: Block[]): string {
  const wrapped = blocks.map(b => {
    const s = [
      'position:absolute',
      `left:${b.x}px`,
      `top:${b.y}px`,
      b.w ? `width:${b.w}px`  : '',
      b.h ? `height:${b.h}px` : '',
    ].filter(Boolean).join(';')
    return `  <div data-block style="${s}">${b.html}</div>`
  })
  return [openTag, ...wrapped, closeTag].join('\n')
}

// ── Root (artboard) style helpers ─────────────────────────────────────────────

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

export function setRootDimensions(doc: ParsedDoc, width: number, height: number): ParsedDoc {
  let d = setRootStyle(doc, 'width',    `${width}px`)
  d = setRootStyle(d, 'height',   `${height}px`)
  d = setRootStyle(d, 'position', 'relative')
  return d
}

// ── Block style / attribute helpers ──────────────────────────────────────────

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

// ── SVG shape helpers ─────────────────────────────────────────────────────────

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
    }
  }
  return { ...block, html: (svg as HTMLElement).outerHTML }
}

// ── Block CRUD ────────────────────────────────────────────────────────────────

export function deleteBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter(b => b.id !== id)
}

export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const src = blocks.find(b => b.id === id)
  if (!src) return blocks
  const copy: Block = { ...src, id: uid(), x: src.x + 20, y: src.y + 20 }
  return [...blocks, copy]
}

export function addBlock(
  blocks: Block[],
  tagName: string,
  _afterId: string | null,
  paperWidth = 794,
): Block[] {
  const templates: Record<string, string> = {
    p:           '<p style="font-size: 13px; line-height: 22px; margin-bottom: 16px; color: #333;">New paragraph</p>',
    h1:          '<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 12px; color: #0d1117;">Heading 1</h1>',
    h2:          '<h2 style="font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #0d1117;">Heading 2</h2>',
    div:         '<div style="margin-bottom: 16px;">New section</div>',
    'page-break':'<page-break></page-break>',
    hr:          '<svg data-shape="hline" width="100%" height="12" style="display:block;overflow:visible;margin:24px 0;"><line x1="0" y1="6" x2="100%" y2="6" stroke="#e1e4e8" stroke-width="1"/></svg>',
    rect:        '<svg data-shape="rect" width="160" height="80" style="display:block;overflow:visible;"><rect x="0.5" y="0.5" width="159" height="79" fill="#e8edf3" stroke="#c0c8d4" stroke-width="1" rx="4"/></svg>',
    vline:       '<svg data-shape="vline" width="20" height="80" style="display:block;overflow:visible;"><line x1="10" y1="0" x2="10" y2="80" stroke="#e1e4e8" stroke-width="2"/></svg>',
    img:         '<img src="" alt="" style="width: 200px; height: auto; display: block;" />',
    ul:          '<ul style="font-size: 13px; line-height: 22px; padding-left: 20px; margin-bottom: 16px;"><li>Item 1</li><li>Item 2</li></ul>',
  }
  const html = templates[tagName] ?? `<${tagName}>New ${tagName}</${tagName}>`
  const parsedTag = new DOMParser().parseFromString(html, 'text/html')
    .body.firstElementChild?.tagName.toLowerCase() ?? tagName

  // Position below all existing blocks with some margin
  const maxBottom = blocks.length > 0
    ? Math.max(...blocks.map(b => b.y + (b.h || 60)))
    : 20
  const isSvgOrImg = parsedTag === 'svg' || parsedTag === 'img'
  const defW = isSvgOrImg ? 0 : paperWidth - 40

  const newBlock: Block = { id: uid(), html, tagName: parsedTag, x: 20, y: maxBottom + 16, w: defW, h: 0 }
  return [...blocks, newBlock]
}
