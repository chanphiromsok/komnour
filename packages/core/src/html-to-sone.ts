import { parse, HTMLElement, TextNode } from 'node-html-parser'
import { Column, Row, Text, Span, PageBreak, Path } from 'sone'

type AnyNode = ReturnType<typeof Column> | ReturnType<typeof Text> | ReturnType<typeof Span>

function parseStyle(style = ''): Record<string, string> {
  return Object.fromEntries(
    style.split(';')
      .map(s => s.trim()).filter(Boolean)
      .map(s => {
        const i = s.indexOf(':')
        return [
          s.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
          s.slice(i + 1).trim(),
        ]
      })
  )
}

function px(v?: string): number | undefined {
  if (!v) return undefined
  const n = parseFloat(v)
  return isNaN(n) ? undefined : n
}

function applyBox(node: any, s: Record<string, string>) {
  const p  = px(s.padding);       if (p  != null) node.padding(p)
  const pt = px(s.paddingTop);    if (pt != null) node.padding(pt, 0, 0, 0)
  const pb = px(s.paddingBottom); if (pb != null) node.padding(0, 0, pb, 0)
  const pl = px(s.paddingLeft);   if (pl != null) node.padding(0, 0, 0, pl)
  const pr = px(s.paddingRight);  if (pr != null) node.padding(0, pr, 0, 0)
  const m  = px(s.margin);        if (m  != null) node.margin(m)
  const mt = px(s.marginTop);     if (mt != null) node.margin(mt, 0, 0, 0)
  const mb = px(s.marginBottom);  if (mb != null) node.margin(0, 0, mb, 0)
  const g  = px(s.gap);           if (g  != null) node.gap(g)
  const w  = px(s.width);         if (w  != null) node.width(w)
  const h  = px(s.height);        if (h  != null) node.height(h)
  const mw = px(s.minWidth);      if (mw != null) node.minWidth(mw)
  const fl = px(s.flex);          if (fl != null) node.flex(fl)
  const bg = s.backgroundColor || s.background
  if (bg) node.bg(bg)
  if (s.borderRadius) node.rounded(px(s.borderRadius) ?? 0)
  if (s.justifyContent) node.justifyContent(s.justifyContent)
  if (s.alignItems)     node.alignItems(s.alignItems)
  if (s.flexWrap)       node.wrap(s.flexWrap)
  if (s.position)       node.position(s.position)
  const top = px(s.top);    if (top  != null) node.top(top)
  const left = px(s.left);  if (left != null) node.left(left)
  const right = px(s.right); if (right != null) node.right(right)
  const bot = px(s.bottom); if (bot  != null) node.bottom(bot)
  if (s.border) {
    const parts = s.border.trim().split(/\s+/)
    const bw = px(parts[0]); if (bw != null) node.borderWidth(bw)
    const bc = parts[2] || parts[1]; if (bc) node.borderColor(bc)
  }
  if (s.borderBottom) {
    const parts = s.borderBottom.trim().split(/\s+/)
    const bw = px(parts[0]); if (bw != null) node.borderWidth(0, 0, bw, 0)
    const bc = parts[2] || parts[1]; if (bc) node.borderColor(bc)
  }
  if (s.borderTop) {
    const parts = s.borderTop.trim().split(/\s+/)
    const bw = px(parts[0]); if (bw != null) node.borderWidth(bw, 0, 0, 0)
    const bc = parts[2] || parts[1]; if (bc) node.borderColor(bc)
  }
  return node
}

// Don't set font here — Font.load registers the font in skia-canvas FontLibrary,
// and Skia automatically falls back to it for any glyph not found in the default font.
// Only apply font when the HTML explicitly sets font-family.
function applyTextStyle(node: any, s: Record<string, string>) {
  const fs = px(s.fontSize); if (fs != null) node.size(fs)
  if (s.lineHeight) {
    const lhPx = px(s.lineHeight)
    if (lhPx != null) {
      // sone lineHeight is a MULTIPLIER (not pixels). Convert px → ratio vs font size.
      const size = fs ?? 16
      node.lineHeight(lhPx / size)
    }
    // unitless / percentage values (e.g. "1.5", "150%") are already multipliers — skip them
    // to rely on sone's natural line spacing, avoiding the huge-height bug.
  }
  if (s.color)      node.color(s.color)
  if (s.fontWeight) node.weight(s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 600 ? 'bold' : 'normal')
  if (s.textAlign)  node.align(s.textAlign)
  if (s.fontFamily) node.font(s.fontFamily.replace(/['"]/g, '').split(',')[0].trim())
  return node
}

const HEADING_SIZE: Record<string, number> = { h1: 26, h2: 20, h3: 17, h4: 15, h5: 14, h6: 13 }

function convertNode(node: HTMLElement | TextNode): AnyNode | null {
  if (node instanceof TextNode) {
    const t = node.text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    return t ? (t as any) : null
  }

  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase() ?? 'div'
  const s = parseStyle(el.getAttribute('style'))
  const kids = el.childNodes
    .map(c => convertNode(c as any))
    .filter((c): c is AnyNode => c !== null)

  // ── checkbox ──────────────────────────────────────────────────
  if (tag === 'input' && el.getAttribute('type') === 'checkbox') {
    const checked = el.hasAttribute('checked')
    return Column(
      checked
        ? Path('M2 5.5 L4.5 8 L10 2')
            .stroke('#1a73e8').strokeWidth(1.8)
            .strokeLineCap('round').strokeLineJoin('round')
            .fill('transparent')
            .width(12).height(10) as any
        : null
    ).width(16).height(16)
      .justifyContent('center').alignItems('center')
      .borderWidth(1.5).borderColor('#9aa0a6').rounded(2) as any
  }

  // ── other input types — skip ───────────────────────────────────
  if (tag === 'input') return null

  // ── inline elements ───────────────────────────────────────────
  if (['span', 'strong', 'b', 'em', 'i'].includes(tag)) {
    const str = kids.filter(c => typeof c === 'string').join('')
    const sp = Span(str)
    if (s.color) sp.color(s.color)
    if (s.fontWeight || tag === 'strong' || tag === 'b') sp.weight('bold')
    if (tag === 'em' || tag === 'i') sp.weight('normal')
    const fs = px(s.fontSize); if (fs) sp.size(fs)
    if (s.fontFamily) sp.font(s.fontFamily.replace(/['"]/g, '').split(',')[0].trim())
    return sp as any
  }

  // ── table structure ───────────────────────────────────────────
  if (tag === 'table') {
    const c = Column(...kids as any)
    applyBox(c, s)
    return c as any
  }

  if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
    return Column(...kids as any) as any
  }

  if (tag === 'tr') {
    const c = Row(...kids as any)
    applyBox(c, s)
    return c as any
  }

  if (tag === 'th' || tag === 'td') {
    const wrapped = kids.map(c =>
      typeof c === 'string' ? applyTextStyle(Text(c), s) : c
    )
    const cell = Column(...wrapped as any).flex(1).padding(7, 10)
    if (tag === 'th') {
      cell.bg(s.backgroundColor || '#1a1a2e')
      wrapped.forEach((c: any) => { try { c.color(s.color || 'white').weight('bold') } catch {} })
    }
    applyBox(cell, s)
    return cell as any
  }

  // ── list items ────────────────────────────────────────────────
  if (tag === 'li') {
    const parentTag = (el.parentNode as HTMLElement)?.tagName?.toLowerCase()
    const isOrdered = parentTag === 'ol'
    const marker = isOrdered
      ? `${Array.from(el.parentNode!.childNodes).filter(n => (n as HTMLElement).tagName?.toLowerCase() === 'li').indexOf(el) + 1}.`
      : '•'

    const BLOCK_TAGS_SET = new Set(['ul', 'ol', 'table', 'div', 'p', 'section', 'blockquote'])
    const inlineKids: AnyNode[] = []
    const blockKids: AnyNode[] = []

    for (const child of el.childNodes) {
      const childTag = (child as HTMLElement).tagName?.toLowerCase()
      if (childTag && BLOCK_TAGS_SET.has(childTag)) {
        const converted = convertNode(child as any)
        if (converted) blockKids.push(converted)
      } else {
        const converted = convertNode(child as any)
        if (converted) inlineKids.push(converted)
      }
    }

    const markerCol = Text(marker).size(px(s.fontSize) ?? 13).color(s.color ?? '#555')
    const contentText = applyTextStyle(Text(...inlineKids.filter(Boolean) as any), s)
    const firstRow = Row(markerCol as any, contentText as any).gap(8).alignItems('flex-start')

    if (blockKids.length === 0) {
      return firstRow.margin(0, 0, 4, 0) as any
    }
    return Column(firstRow as any, ...blockKids as any).margin(0, 0, 4, 0) as any
  }

  // ── text blocks ───────────────────────────────────────────────
  if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(tag)) {
    const t = Text(...kids as any)
    if (HEADING_SIZE[tag]) t.size(HEADING_SIZE[tag]).weight('bold')
    applyTextStyle(t, s)
    applyBox(t, s)  // allows flex:1, width, margin on text elements in rows
    return t as any
  }

  // ── hr ────────────────────────────────────────────────────────
  if (tag === 'hr') {
    return Column().height(1).bg('#e0e0e0').margin(12, 0) as any
  }

  // ── page break (<page-break> or <div class="page-break">) ────
  if (tag === 'page-break') {
    return PageBreak() as any
  }

  // ── ul / ol ───────────────────────────────────────────────────
  if (tag === 'ul' || tag === 'ol') {
    const list = Column(...kids as any).padding(0, 0, 0, 8)
    applyBox(list, s)
    return list as any
  }

  // ── container (div, section, header, footer…) ────────────────
  const wrapped = kids.map(c =>
    typeof c === 'string' ? applyTextStyle(Text(c), s) : c
  )
  const isRow = s.flexDirection === 'row'
  if (isRow) {
    // Text nodes don't participate in flex row layout correctly (yoga custom measure).
    // Wrap them in a Column so width constraints flow from the Row to the text measure func.
    // Also: do NOT propagate flex to the text node — flexBasis:0 prevents yoga from
    // calling the measure function, causing text to render without wrapping.
    const rowKids = wrapped.map(c => {
      if ((c as any)?.type !== 'text') return c
      const textProps = (c as any).props ?? {}
      const flexVal = textProps.flex ?? 1
      delete textProps.flex  // remove from text to avoid flexBasis:0 breaking measure
      const wrapper = Column(c as any).flex(flexVal)
      return wrapper
    })
    const container = Row(...rowKids as any)
    applyBox(container, s)
    return container as any
  }
  const container = Column(...wrapped as any)
  applyBox(container, s)
  return container as any
}

function isPageBreakNode(n: any): boolean {
  return n && typeof n === 'object' && n.type === 'column' &&
    n.props?.pageBreak === 'before' && n.children?.length === 0
}

function hasPageBreak(n: any): boolean {
  if (!n || typeof n === 'string') return false
  if (isPageBreakNode(n)) return true
  return Array.isArray(n.children) && n.children.some(hasPageBreak)
}

// Pull nested PageBreak nodes up to the top level so sone can see them
function hoistPageBreaks(nodes: AnyNode[]): AnyNode[] {
  const result: AnyNode[] = []
  for (const node of nodes) {
    if (!hasPageBreak(node)) { result.push(node); continue }
    if (isPageBreakNode(node)) { result.push(node); continue }
    // Split this node's children at page breaks, then wrap each segment
    const children: any[] = (node as any).children ?? []
    let bucket: any[] = []
    const flush = () => {
      if (bucket.length === 0) return
      result.push({ ...(node as any), id: -1, children: bucket })
      bucket = []
    }
    for (const child of children) {
      if (isPageBreakNode(child)) {
        flush()
        result.push(child)
      } else if (hasPageBreak(child)) {
        // Recurse: hoist from this sub-node, then split at page breaks
        const sub = hoistPageBreaks([child])
        for (const item of sub) {
          if (isPageBreakNode(item)) { flush(); result.push(item) }
          else bucket.push(item)
        }
      } else {
        bucket.push(child)
      }
    }
    flush()
  }
  return result
}

export function htmlToSone(htmlString: string) {
  const root = parse(htmlString)
  const kids = root.childNodes
    .map(c => convertNode(c as any))
    .filter((c): c is AnyNode => c !== null)
  return Column(...hoistPageBreaks(kids) as any)
}
