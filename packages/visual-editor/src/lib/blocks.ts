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
    p: '<p style="font-size: 13px; line-height: 22px; margin-bottom: 16px; color: #333;">New paragraph</p>',
    h1: '<h1 style="font-size: 28px; font-weight: bold; margin-bottom: 12px; color: #0d1117;">Heading 1</h1>',
    h2: '<h2 style="font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #0d1117;">Heading 2</h2>',
    div: '<div style="margin-bottom: 16px;">New section</div>',
    'page-break': '<page-break></page-break>',
    hr: '<hr style="border: none; border-top: 1px solid #e1e4e8; margin: 24px 0;" />',
    img: '<img src="" alt="" style="width: 100%; height: auto; display: block; margin-bottom: 16px;" />',
    ul: '<ul style="font-size: 13px; line-height: 22px; padding-left: 20px; margin-bottom: 16px;"><li>Item 1</li><li>Item 2</li></ul>',
  }
  const html = templates[tagName] ?? `<${tagName}>New ${tagName}</${tagName}>`
  const newBlock: Block = { id: uid(), html, tagName }
  if (!afterId) return [...blocks, newBlock]
  const idx = blocks.findIndex(b => b.id === afterId)
  return [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)]
}

