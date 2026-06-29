import { parse, HTMLElement, TextNode } from 'node-html-parser'

// ── quote helpers ─────────────────────────────────────────────────────────

function q(s: string): string {
  return JSON.stringify(s)
}

function n(v: number): string {
  // Emit integers without a decimal, floats with up to 4 sig-frac digits
  if (Number.isInteger(v)) return String(v)
  const s = v.toFixed(4).replace(/\.?0+$/, '')
  return s
}

// ── CSS parsing (same as html-to-sone.ts) ────────────────────────────────

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
  const num = parseFloat(v)
  return isNaN(num) ? undefined : num
}

function pxOrPct(v?: string): number | `${number}%` | undefined {
  if (!v) return undefined
  const num = parseFloat(v)
  if (!isNaN(num)) return num
  const t = v.trim()
  return /^\d+(\.\d+)?%$/.test(t) ? (t as `${number}%`) : undefined
}

function parseShorthand4(v?: string): [number, number, number, number] | undefined {
  if (!v) return undefined
  const parts = v.trim().split(/\s+/).map(p => p === 'auto' ? 0 : px(p))
  if (parts.some(p => p == null)) return undefined
  const [a, b, c, d] = parts as number[]
  if (parts.length === 1) return [a, a, a, a]
  if (parts.length === 2) return [a, b, a, b]
  if (parts.length === 3) return [a, b, c, b]
  return [a, b, c, d]
}

const BORDER_STYLE_KEYWORDS = new Set([
  'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge',
  'inset', 'outset', 'none', 'hidden',
])

function parseBorderColor(parts: string[]): string | null {
  const color = parts.find(p => px(p) == null && !BORDER_STYLE_KEYWORDS.has(p.toLowerCase()))
  return color ?? null
}

function parseBorderWidth(parts: string[]): number | undefined {
  return parts.map(px).find(v => v != null)
}

// ── SNode: string-building stand-in for sone's builder API ───────────────

type Child = SNode | string | null | undefined

class SNode {
  readonly type: string
  private _fn: string
  readonly _children: (SNode | string)[]
  private _calls: string[] = []

  constructor(type: string, fn: string, children: Child[]) {
    this.type = type
    this._fn = fn
    this._children = children.filter((c): c is SNode | string => c != null)
  }

  private _m(name: string, ...args: string[]): this {
    this._calls.push(`.${name}(${args.join(', ')})`)
    return this
  }

  withChildren(children: (SNode | string)[]): SNode {
    const copy = new SNode(this.type, this._fn, children)
    copy._calls = [...this._calls]
    return copy
  }

  get children(): readonly (SNode | string)[] { return this._children }

  bg(c: string)              { return this._m('bg', q(c)) }
  width(w: number | string)  { return this._m('width', typeof w === 'string' ? q(w) : n(w)) }
  height(h: number)          { return this._m('height', n(h)) }
  minWidth(v: number)        { return this._m('minWidth', n(v)) }
  maxWidth(v: number | string) { return this._m('maxWidth', typeof v === 'string' ? q(v) : n(v)) }
  minHeight(v: number | string) { return this._m('minHeight', typeof v === 'string' ? q(v) : n(v)) }
  maxHeight(v: number | string) { return this._m('maxHeight', typeof v === 'string' ? q(v) : n(v)) }
  padding(...a: number[])    { return this._m('padding', ...a.map(n)) }
  margin(...a: number[])     { return this._m('margin', ...a.map(n)) }
  gap(v: number)             { return this._m('gap', n(v)) }
  flex(v: number)            { return this._m('flex', n(v)) }
  flexGrow(v: number)        { return this._m('flexGrow', n(v)) }
  flexShrink(v: number)      { return this._m('flexShrink', n(v)) }
  grow(v: number)            { return this._m('grow', n(v)) }
  borderWidth(...a: number[]) { return this._m('borderWidth', ...a.map(n)) }
  borderColor(c: string)     { return this._m('borderColor', q(c)) }
  rounded(v: number)         { return this._m('rounded', n(v)) }
  justifyContent(s: string)  { return this._m('justifyContent', q(s)) }
  alignItems(s: string)      { return this._m('alignItems', q(s)) }
  alignSelf(s: string)       { return this._m('alignSelf', q(s)) }
  wrap(s: string)            { return this._m('wrap', q(s)) }
  position(s: string)        { return this._m('position', q(s)) }
  top(v: number)             { return this._m('top', n(v)) }
  left(v: number)            { return this._m('left', n(v)) }
  right(v: number)           { return this._m('right', n(v)) }
  bottom(v: number)          { return this._m('bottom', n(v)) }
  color(c: string)           { return this._m('color', q(c)) }
  size(v: number)            { return this._m('size', n(v)) }
  weight(s: string)          { return this._m('weight', q(s)) }
  align(s: string)           { return this._m('align', q(s)) }
  font(s: string)            { return this._m('font', q(s)) }
  lineHeight(v: number)      { return this._m('lineHeight', n(v)) }
  letterSpacing(v: number)   { return this._m('letterSpacing', n(v)) }
  stroke(c: string)          { return this._m('stroke', q(c)) }
  strokeWidth(v: number)     { return this._m('strokeWidth', n(v)) }
  strokeLineCap(s: string)   { return this._m('strokeLineCap', q(s)) }
  strokeLineJoin(s: string)  { return this._m('strokeLineJoin', q(s)) }
  fill(c: string)            { return this._m('fill', q(c)) }
  colspan(v: number)         { return this._m('colspan', n(v)) }
  rowspan(v: number)         { return this._m('rowspan', n(v)) }

  toString(indent = 0): string {
    const pad = '  '.repeat(indent)
    const childPad = '  '.repeat(indent + 1)
    const calls = this._calls.join('')

    if (this._children.length === 0) return `${this._fn}()${calls}`

    const childStrs = this._children.map(c =>
      typeof c === 'string' ? q(c) : c.toString(indent + 1)
    )

    const single = `${this._fn}(${childStrs.join(', ')})${calls}`
    if (single.length <= 100 && !childStrs.some(s => s.includes('\n'))) return single

    return `${this._fn}(\n${childStrs.map(s => `${childPad}${s}`).join(',\n')}\n${pad})${calls}`
  }
}

// ── sone factory mirrors ──────────────────────────────────────────────────

function Column(...children: Child[]): SNode  { return new SNode('column',    'Column',    children) }
function Row(...children: Child[]): SNode     { return new SNode('row',       'Row',       children) }
function Text(...children: Child[]): SNode    { return new SNode('text',      'Text',      children) }
function Span(text: string): SNode            { return new SNode('span',      'Span',      [text]) }
function PageBreak(): SNode                   { return new SNode('pageBreak', 'PageBreak', []) }
function Path(d: string): SNode              { return new SNode('path',      'Path',      [d]) }
function Table(...children: Child[]): SNode   { return new SNode('table',     'Table',     children) }
function TableRow(...children: Child[]): SNode { return new SNode('tableRow', 'TableRow',  children) }
function TableCell(...children: Child[]): SNode { return new SNode('tableCell','TableCell', children) }

// ── text flattening ───────────────────────────────────────────────────────

function flattenText(nodes: (SNode | string)[]): string {
  return nodes.map(nd => {
    if (typeof nd === 'string') return nd
    if (nd instanceof SNode) {
      if (nd.type === 'span' && nd.children.length === 1 && typeof nd.children[0] === 'string') {
        return nd.children[0]
      }
      return flattenText([...nd.children])
    }
    return ''
  }).join('')
}

// ── applyBox — mirrors html-to-sone.ts exactly ───────────────────────────

function applyBox(node: SNode, s: Record<string, string>) {
  const baseP = parseShorthand4(s.padding)
  const pt = px(s.paddingTop)    ?? baseP?.[0]
  const pr = px(s.paddingRight)  ?? baseP?.[1]
  const pb = px(s.paddingBottom) ?? baseP?.[2]
  const pl = px(s.paddingLeft)   ?? baseP?.[3]
  if (baseP || pt != null || pr != null || pb != null || pl != null) {
    node.padding(pt ?? 0, pr ?? 0, pb ?? 0, pl ?? 0)
  }

  const baseM = parseShorthand4(s.margin)
  const mt = px(s.marginTop)    ?? baseM?.[0]
  const mr = px(s.marginRight)  ?? baseM?.[1]
  const mb = px(s.marginBottom) ?? baseM?.[2]
  const ml = px(s.marginLeft)   ?? baseM?.[3]
  if (baseM || mt != null || mr != null || mb != null || ml != null) {
    node.margin(mt ?? 0, mr ?? 0, mb ?? 0, ml ?? 0)
  }

  const g   = px(s.gap);             if (g   != null) node.gap(g)
  const w   = pxOrPct(s.width);      if (w   != null) node.width(w as any)
  const h   = pxOrPct(s.height);     if (h   != null) node.height(h as any)
  const mw  = pxOrPct(s.minWidth);   if (mw  != null) node.minWidth(mw as any)
  const mxw = pxOrPct(s.maxWidth);   if (mxw != null) node.maxWidth(mxw as any)
  const mnh = pxOrPct(s.minHeight);  if (mnh != null) node.minHeight(mnh as any)
  const mxh = pxOrPct(s.maxHeight);  if (mxh != null) node.maxHeight(mxh as any)
  const fl  = px(s.flex);            if (fl  != null) node.flex(fl)
  const fg  = px(s.flexGrow);        if (fg  != null) node.flexGrow(fg)
  const fs  = px(s.flexShrink);      if (fs  != null) node.flexShrink(fs)

  const bg = s.backgroundColor || s.background
  if (bg && !bg.includes('gradient') && !bg.includes('url(')) node.bg(bg)

  if (s.borderRadius) node.rounded(px(s.borderRadius) ?? 0)
  if (s.justifyContent) node.justifyContent(s.justifyContent)
  if (s.alignItems)     node.alignItems(s.alignItems)
  if (s.alignSelf)      node.alignSelf(s.alignSelf)
  if (s.flexWrap)       node.wrap(s.flexWrap)
  if (s.position)       node.position(s.position)
  const top   = px(s.top);   if (top   != null) node.top(top)
  const left  = px(s.left);  if (left  != null) node.left(left)
  const right = px(s.right); if (right != null) node.right(right)
  const bot   = px(s.bottom);if (bot   != null) node.bottom(bot)

  let bwT: number | undefined, bwR: number | undefined,
      bwB: number | undefined, bwL: number | undefined
  let borderCol: string | undefined

  const sbw = px(s.borderWidth)
  if (sbw != null) { bwT = bwR = bwB = bwL = sbw }
  if (s.borderColor) borderCol = s.borderColor

  if (s.border) {
    const parts = s.border.trim().split(/\s+/)
    const bw = parseBorderWidth(parts)
    if (bw != null) { bwT ??= bw; bwR ??= bw; bwB ??= bw; bwL ??= bw }
    const bc = parseBorderColor(parts); if (bc) borderCol = bc
  }
  if (s.borderTop) {
    const parts = s.borderTop.trim().split(/\s+/)
    const bw = parseBorderWidth(parts); if (bw != null) bwT = bw
    const bc = parseBorderColor(parts); if (bc) borderCol = bc
  }
  if (s.borderBottom) {
    const parts = s.borderBottom.trim().split(/\s+/)
    const bw = parseBorderWidth(parts); if (bw != null) bwB = bw
    const bc = parseBorderColor(parts); if (bc) borderCol = bc
  }
  if (s.borderRight) {
    const parts = s.borderRight.trim().split(/\s+/)
    const bw = parseBorderWidth(parts); if (bw != null) bwR = bw
    const bc = parseBorderColor(parts); if (bc) borderCol = bc
  }
  if (s.borderLeft) {
    const parts = s.borderLeft.trim().split(/\s+/)
    const bw = parseBorderWidth(parts); if (bw != null) bwL = bw
    const bc = parseBorderColor(parts); if (bc) borderCol = bc
  }

  if (bwT != null || bwR != null || bwB != null || bwL != null) {
    node.borderWidth(bwT ?? 0, bwR ?? 0, bwB ?? 0, bwL ?? 0)
  }
  if (borderCol) node.borderColor(borderCol)
  return node
}

function applyTextStyle(node: SNode, s: Record<string, string>) {
  const fs = px(s.fontSize); if (fs != null) node.size(fs)
  if (s.lineHeight) {
    const lhPx = px(s.lineHeight)
    if (lhPx != null && lhPx > 0) {
      const size = fs ?? 16
      node.lineHeight(lhPx / size)
    }
  }
  if (s.color)      node.color(s.color)
  if (s.fontWeight) node.weight(s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 600 ? 'bold' : 'normal')
  if (s.textAlign)  node.align(s.textAlign)
  if (s.fontFamily) node.font(s.fontFamily.replace(/['"]/g, '').split(',')[0].trim())
  return node
}

// ── constants ─────────────────────────────────────────────────────────────

const HEADING_SIZE: Record<string, number> = { h1: 26, h2: 20, h3: 17, h4: 15, h5: 14, h6: 13 }

function dropWS(kids: (SNode | string)[]): (SNode | string)[] {
  return kids.filter(c => typeof c !== 'string' || c.trim() !== '')
}

// ── table column-count context stack ─────────────────────────────────────

const _tableCtxStack: Array<{ totalCols: number; w: number }> = []

function countTableCols(tableEl: HTMLElement): number {
  let max = 0
  const countRow = (rowEl: HTMLElement) => {
    let cnt = 0
    for (const child of rowEl.childNodes) {
      const t = (child as HTMLElement).tagName?.toLowerCase() ?? ''
      if (t === 'td' || t === 'th') {
        cnt += parseInt((child as HTMLElement).getAttribute('colspan') ?? '1', 10) || 1
      }
    }
    if (cnt > max) max = cnt
  }
  const walk = (el: HTMLElement) => {
    for (const child of el.childNodes) {
      const t = (child as HTMLElement).tagName?.toLowerCase() ?? ''
      if (t === 'tr') countRow(child as HTMLElement)
      else if (t === 'thead' || t === 'tbody' || t === 'tfoot') walk(child as HTMLElement)
    }
  }
  walk(tableEl)
  return max || 1
}

// ── node converter ────────────────────────────────────────────────────────

function convertNode(node: HTMLElement | TextNode): SNode | string | null {
  if (node instanceof TextNode) {
    const t = node.text.replace(/\n/g, ' ').replace(/\s+/g, ' ')
    return t || null
  }

  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase() ?? 'div'
  const s = parseStyle(el.getAttribute('style'))
  const kids = el.childNodes
    .map(c => convertNode(c as any))
    .filter((c): c is SNode | string => c !== null)

  // ── checkbox ──────────────────────────────────────────────────
  if (tag === 'input' && el.getAttribute('type') === 'checkbox') {
    const checked = el.hasAttribute('checked')
    return Column(
      checked
        ? Path('M2 5.5 L4.5 8 L10 2')
            .stroke('#1a73e8').strokeWidth(1.8)
            .strokeLineCap('round').strokeLineJoin('round')
            .fill('transparent')
            .width(12).height(10)
        : null
    ).width(16).height(16)
      .justifyContent('center').alignItems('center')
      .borderWidth(1.5).borderColor('#9aa0a6').rounded(2)
  }

  if (tag === 'input') return null

  if (tag === 'br') return '\n'

  if (tag === 'tab') {
    const w = px(el.getAttribute('width') ?? '') ?? 32
    return Span(' ').letterSpacing(Math.max(0, w - 4))
  }

  if (tag === 'img') {
    const imgW = px(el.getAttribute('width') ?? '') ?? 0
    const imgH = px(el.getAttribute('height') ?? '') ?? 0
    const nd = Column().bg('#e8e8e8')
    if (imgW > 0) nd.width(imgW)
    if (imgH > 0) nd.height(imgH)
    applyBox(nd, s)
    return nd
  }

  // ── inline elements ───────────────────────────────────────────
  if (['span', 'strong', 'b', 'em', 'i'].includes(tag)) {
    const str = flattenText(kids)
    const sp = Span(str)
    if (s.color) sp.color(s.color)
    if (s.fontWeight) {
      sp.weight(s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 600 ? 'bold' : 'normal')
    } else if (tag === 'strong' || tag === 'b') {
      sp.weight('bold')
    } else if (tag === 'em' || tag === 'i') {
      sp.weight('normal')
    }
    const fs = px(s.fontSize); if (fs != null) sp.size(fs)
    if (s.fontFamily) sp.font(s.fontFamily.replace(/['"]/g, '').split(',')[0].trim())
    return sp
  }

  // ── table structure ───────────────────────────────────────────
  if (tag === 'table') {
    const totalCols = countTableCols(el)
    const tblWidth = px(s.width) ?? 794
    _tableCtxStack.push({ totalCols, w: tblWidth })

    const rows: SNode[] = []
    const collectRows = (parent: HTMLElement) => {
      for (const child of parent.childNodes) {
        const ct = (child as HTMLElement).tagName?.toLowerCase() ?? ''
        if (ct === 'tr') {
          const row = convertNode(child as any)
          if (row && row instanceof SNode) rows.push(row)
        } else if (['thead', 'tbody', 'tfoot'].includes(ct)) {
          collectRows(child as HTMLElement)
        }
      }
    }
    collectRows(el)
    _tableCtxStack.pop()

    const tbl = Table(...rows)
    applyBox(tbl, s)

    let cellBorderW: number | undefined
    let cellBorderC: string | undefined
    for (const cellEl of el.querySelectorAll('td, th')) {
      const cs = parseStyle((cellEl as HTMLElement).getAttribute('style') ?? '')
      const b = cs.border || cs.borderRight || cs.borderBottom || cs.borderLeft || cs.borderTop
      if (b) {
        const parts = b.trim().split(/\s+/)
        const w = parseBorderWidth(parts)
        if (w != null) { cellBorderW = w; cellBorderC = parseBorderColor(parts) ?? undefined; break }
      }
    }
    const tblHasBorder = (tbl as any)._calls.some(
      (c: string) => c.startsWith('.borderWidth') || c.startsWith('.borderColor')
    )
    if (!tblHasBorder) {
      if (cellBorderW != null && cellBorderW > 0) {
        tbl.borderWidth(cellBorderW)
        if (cellBorderC) tbl.borderColor(cellBorderC)
      } else {
        tbl.borderColor('transparent')
      }
    }
    return tbl
  }

  if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
    return Column(...dropWS(kids))
  }

  if (tag === 'tr') {
    const row = TableRow(...dropWS(kids))
    applyBox(row, s)
    return row
  }

  if (tag === 'th' || tag === 'td') {
    const wrapped = dropWS(kids).map(c => {
      if (typeof c === 'string') return applyTextStyle(Text(c), s)
      if (c instanceof SNode && c.type === 'span') return Text(c)
      return c
    })
    const colSpan = parseInt(el.getAttribute('colspan') ?? '1', 10) || 1
    const rowSpan = parseInt(el.getAttribute('rowspan') ?? '1', 10) || 1
    const cell = TableCell(...wrapped).padding(7, 10)
    if (colSpan > 1) cell.colspan(colSpan)
    if (rowSpan > 1) cell.rowspan(rowSpan)
    if (!s.width && !s.flex && !s.flexGrow) {
      const ctx = _tableCtxStack[_tableCtxStack.length - 1]
      if (ctx) {
        cell.minWidth(colSpan / ctx.totalCols * ctx.w)
      } else {
        cell.grow(colSpan)
      }
    }
    if (tag === 'th') {
      if (s.backgroundColor) cell.bg(s.backgroundColor)
      wrapped.forEach(c => {
        if (c instanceof SNode) try { c.color(s.color ?? '#000').weight('bold') } catch {}
      })
    }
    const cellStyle = { ...s }
    delete cellStyle.border
    delete cellStyle.borderTop; delete cellStyle.borderRight
    delete cellStyle.borderBottom; delete cellStyle.borderLeft
    delete cellStyle.borderWidth; delete cellStyle.borderColor
    applyBox(cell, cellStyle)
    return cell
  }

  // ── list items ────────────────────────────────────────────────
  if (tag === 'li') {
    const parentTag = (el.parentNode as HTMLElement)?.tagName?.toLowerCase()
    const isOrdered = parentTag === 'ol'
    const marker = isOrdered
      ? `${Array.from(el.parentNode!.childNodes).filter(nd => (nd as HTMLElement).tagName?.toLowerCase() === 'li').indexOf(el) + 1}.`
      : '•'

    const BLOCK_TAGS_SET = new Set(['ul', 'ol', 'table', 'div', 'p', 'section', 'blockquote'])
    const inlineKids: (SNode | string)[] = []
    const blockKids: (SNode | string)[] = []

    for (const child of el.childNodes) {
      const childTag = (child as HTMLElement).tagName?.toLowerCase()
      const converted = convertNode(child as any)
      if (!converted) continue
      if (childTag && BLOCK_TAGS_SET.has(childTag)) blockKids.push(converted)
      else inlineKids.push(converted)
    }

    const markerCol = Text(marker).size(px(s.fontSize) ?? 13).color(s.color ?? '#555')
    const contentText = applyTextStyle(Text(...inlineKids.filter(Boolean)), s)
    const firstRow = Row(markerCol, contentText).gap(8).alignItems('flex-start')

    if (blockKids.length === 0) return firstRow.margin(0, 0, 4, 0)
    return Column(firstRow, ...blockKids).margin(0, 0, 4, 0)
  }

  // ── text blocks ───────────────────────────────────────────────
  if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label'].includes(tag)) {
    const t = Text(...kids)
    if (HEADING_SIZE[tag]) t.size(HEADING_SIZE[tag]).weight('bold')
    applyTextStyle(t, s)
    applyBox(t, s)
    return t
  }

  if (tag === 'hr') return Column().height(1).bg('#e0e0e0').margin(12, 0)

  if (tag === 'page-break') return PageBreak()

  if (tag === 'ul' || tag === 'ol') {
    const list = Column(...dropWS(kids)).padding(0, 0, 0, 8)
    applyBox(list, s)
    return list
  }

  // ── generic container ─────────────────────────────────────────
  const wrapped = dropWS(kids).map(c => {
    if (typeof c === 'string') return applyTextStyle(Text(c), s)
    if (c instanceof SNode && c.type === 'span') return Text(c)
    return c
  })
  const isRow = s.flexDirection === 'row'
  if (isRow) {
    const rowKids = wrapped.map(c => {
      if (!(c instanceof SNode) || c.type !== 'text') return c
      const wrapper = Column(c).flex(1)
      return wrapper
    })
    const container = Row(...rowKids)
    applyBox(container, s)
    return container
  }
  const container = Column(...wrapped)
  applyBox(container, s)
  return container
}

// ── page-break hoisting ───────────────────────────────────────────────────

function isPageBreakNode(nd: SNode | string | null | undefined): boolean {
  return nd instanceof SNode && nd.type === 'pageBreak'
}

function hasPageBreak(nd: SNode | string | null | undefined): boolean {
  if (!nd || typeof nd === 'string') return false
  if (isPageBreakNode(nd)) return true
  return nd.children.some(c => hasPageBreak(c))
}

function hoistPageBreaks(nodes: (SNode | string)[]): (SNode | string)[] {
  const result: (SNode | string)[] = []
  for (const node of nodes) {
    if (typeof node === 'string' || !hasPageBreak(node)) { result.push(node); continue }
    if (isPageBreakNode(node)) { result.push(node); continue }
    const children = [...node.children]
    let bucket: (SNode | string)[] = []
    const flush = () => {
      if (bucket.length === 0) return
      const safe = bucket.map(c => {
        if (typeof c === 'string') return Text(c)
        if (c instanceof SNode && c.type === 'span') return Text(c)
        return c
      })
      result.push(node.withChildren(safe))
      bucket = []
    }
    for (const child of children) {
      if (isPageBreakNode(child)) {
        flush()
        result.push(child)
      } else if (hasPageBreak(child)) {
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

// ── public API ────────────────────────────────────────────────────────────

export interface SoneSyntaxOptions {
  /** Page width in px (default 794) */
  width?: number
  /** Whether to include sone import statement at the top (default false) */
  preamble?: boolean
}

/**
 * Convert an HTML string to a sone API code string.
 *
 * The returned string is valid TypeScript/JS that, when executed with sone
 * in scope, produces the same layout as htmlToSone() from @komnour/core.
 *
 * @example
 * const code = htmlToSoneSyntax('<p style="color:red">Hello</p>')
 * // → 'Column(\n  Text("Hello").color("red")\n)'
 */
export function htmlToSoneSyntax(html: string, opts: SoneSyntaxOptions = {}): string {
  const { width = 794, preamble = false } = opts

  const root = parse(html)
  const kids = root.childNodes
    .map(c => convertNode(c as any))
    .filter((c): c is SNode | string => c !== null)
    .filter(c => typeof c !== 'string' || c.trim() !== '')  // strip root-level whitespace

  const normalized = kids.map(k => {
    if (typeof k === 'string') return Text(k)
    if (k instanceof SNode && k.type === 'span') return Text(k)
    return k
  })

  const layout = Column(...hoistPageBreaks(normalized)).width(width).minHeight(1).bg('white')
  const expr = layout.toString(0)

  if (!preamble) return expr

  const fns = [
    'Column', 'Row', 'Text', 'Span', 'PageBreak', 'Path',
    'Table', 'TableRow', 'TableCell',
  ]
  return `import { ${fns.join(', ')} } from 'sone'\n\n${expr}\n`
}
