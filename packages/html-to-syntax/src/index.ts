import { parse, HTMLElement, TextNode } from 'node-html-parser'

// ── CSS parsing ────────────────────────────────────────────────────────────

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

// Returns a number for px values, "N%" for percent, or undefined
function pxOrPct(v?: string): number | `${number}%` | undefined {
  if (!v) return undefined
  const t = v.trim()
  if (/^\d+(\.\d+)?%$/.test(t)) return t as `${number}%`
  const num = parseFloat(t)
  return isNaN(num) ? undefined : num
}

// Returns a number, "auto", or undefined — for margin properties that support auto
function pxOrAuto(v?: string): number | 'auto' | undefined {
  if (!v) return undefined
  if (v.trim() === 'auto') return 'auto'
  return px(v)
}

type ShorthandValue = number | 'auto'

function parseShorthand4(v?: string): [ShorthandValue, ShorthandValue, ShorthandValue, ShorthandValue] | undefined {
  if (!v) return undefined
  const parts = v.trim().split(/\s+/).map(p => p === 'auto' ? 'auto' as const : px(p))
  if (parts.some(p => p == null)) return undefined
  const [a, b, c, d] = parts as ShorthandValue[]
  if (parts.length === 1) return [a, a, a, a]
  if (parts.length === 2) return [a, b, a, b]
  if (parts.length === 3) return [a, b, c, b]
  return [a, b, c, d]
}

// Tokenize a CSS shorthand value respecting parentheses so rgb(0, 0, 0) stays as one token
function splitRespectingParens(v: string): string[] {
  const tokens: string[] = []
  let current = ''
  let depth = 0
  for (const ch of v.trim()) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

const BORDER_STYLE_KEYWORDS = new Set([
  'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge',
  'inset', 'outset', 'none', 'hidden',
])

function parseBorderColor(parts: string[]): string | null {
  const color = parts.find(p => px(p) == null && !BORDER_STYLE_KEYWORDS.has(p.toLowerCase()))
  return color ?? null
}

// ── SNode: string-building stand-in for sone's builder API ───────────────

function q(s: string): string { return JSON.stringify(s) }
function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(4).replace(/\.?0+$/, '')
}

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

  // Expose props.text for Span so flattenText works the same as on real sone objects
  get props(): Record<string, any> {
    if (this.type === 'span' && this._children.length === 1 && typeof this._children[0] === 'string') {
      return { text: this._children[0] }
    }
    return {}
  }

  // layout sizing — all accept number (px) or "N%" string
  bg(c: string)                   { return this._m('bg', q(c)) }
  width(w: number | string)       { return this._m('width', typeof w === 'string' ? q(w) : fmt(w)) }
  height(h: number | string)      { return this._m('height', typeof h === 'string' ? q(h) : fmt(h)) }
  minWidth(v: number | string)    { return this._m('minWidth', typeof v === 'string' ? q(v) : fmt(v)) }
  maxWidth(v: number | string)    { return this._m('maxWidth', typeof v === 'string' ? q(v) : fmt(v)) }
  minHeight(v: number | string)   { return this._m('minHeight', typeof v === 'string' ? q(v) : fmt(v)) }
  maxHeight(v: number | string)   { return this._m('maxHeight', typeof v === 'string' ? q(v) : fmt(v)) }
  // layout
  padding(...a: (number | 'auto')[]) { return this._m('padding', ...a.map(v => v === 'auto' ? q('auto') : fmt(v as number))) }
  margin(...a: (number | 'auto')[])  { return this._m('margin',  ...a.map(v => v === 'auto' ? q('auto') : fmt(v as number))) }
  gap(v: number)                  { return this._m('gap', fmt(v)) }
  rowGap(v: number)               { return this._m('rowGap', fmt(v)) }
  columnGap(v: number)            { return this._m('columnGap', fmt(v)) }
  flex(v: number)                 { return this._m('flex', fmt(v)) }
  grow(v: number)                 { return this._m('grow', fmt(v)) }
  shrink(v: number)               { return this._m('shrink', fmt(v)) }
  basis(v: number | string)       { return this._m('basis', typeof v === 'string' ? q(v) : fmt(v)) }
  aspectRatio(v: number)          { return this._m('aspectRatio', fmt(v)) }
  borderWidth(...a: number[])     { return this._m('borderWidth', ...a.map(fmt)) }
  borderColor(c: string)          { return this._m('borderColor', q(c)) }
  rounded(v: number)              { return this._m('rounded', fmt(v)) }
  justifyContent(s: string)       { return this._m('justifyContent', q(s)) }
  alignContent(s: string)         { return this._m('alignContent', q(s)) }
  alignItems(s: string)           { return this._m('alignItems', q(s)) }
  alignSelf(s: string)            { return this._m('alignSelf', q(s)) }
  wrap(s: string)                 { return this._m('wrap', q(s)) }
  display(s: string)              { return this._m('display', q(s)) }
  overflow(s: string)             { return this._m('overflow', q(s)) }
  opacity(v: number)              { return this._m('opacity', fmt(v)) }
  position(s: string)             { return this._m('position', q(s)) }
  top(v: number)                  { return this._m('top', fmt(v)) }
  left(v: number)                 { return this._m('left', fmt(v)) }
  right(v: number)                { return this._m('right', fmt(v)) }
  bottom(v: number)               { return this._m('bottom', fmt(v)) }
  // text
  color(c: string)                { return this._m('color', q(c)) }
  size(v: number)                 { return this._m('size', fmt(v)) }
  weight(s: string)               { return this._m('weight', q(s)) }
  align(s: string)                { return this._m('align', q(s)) }
  font(s: string)                 { return this._m('font', q(s)) }
  lineHeight(v: number)           { return this._m('lineHeight', fmt(v)) }
  letterSpacing(v: number)        { return this._m('letterSpacing', fmt(v)) }
  underline(v = 1)                { return this._m('underline', fmt(v)) }
  lineThrough(v = 1)              { return this._m('lineThrough', fmt(v)) }
  textOverflow(s: string)         { return this._m('textOverflow', q(s)) }
  maxLines(v: number)             { return this._m('maxLines', fmt(v)) }
  shadow(s: string)               { return this._m('shadow', q(s)) }
  direction(s: string)            { return this._m('direction', q(s)) }
  scaleType(v: string, alignment?: string) {
    return alignment ? this._m('scaleType', q(v), q(alignment)) : this._m('scaleType', q(v))
  }
  preserveAspectRatio()           { return this._m('preserveAspectRatio') }
  flipHorizontal()                { return this._m('flipHorizontal') }
  flipVertical()                  { return this._m('flipVertical') }
  // path
  stroke(c: string)               { return this._m('stroke', q(c)) }
  strokeWidth(v: number)          { return this._m('strokeWidth', fmt(v)) }
  strokeDashArray(...v: number[]) { return this._m('strokeDashArray', ...v.map(fmt)) }
  strokeLineCap(s: string)        { return this._m('strokeLineCap', q(s)) }
  strokeLineJoin(s: string)       { return this._m('strokeLineJoin', q(s)) }
  fill(c: string)                 { return this._m('fill', q(c)) }

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

// ── SNode factory set ─────────────────────────────────────────────────────

const snodeBuilders = {
  Column: (...children: Child[]): SNode  => new SNode('column',    'Column',    children),
  Row:    (...children: Child[]): SNode  => new SNode('row',       'Row',       children),
  Text:   (...children: Child[]): SNode  => new SNode('text',      'Text',      children),
  Span:   (text: string):         SNode  => new SNode('span',      'Span',      [text]),
  PageBreak: ():                  SNode  => new SNode('pageBreak', 'PageBreak', []),
  Path:   (d: string):            SNode  => new SNode('path',      'Path',      [d]),
  Photo:  (src: string):          SNode  => new SNode('photo',     'Photo',     [src]),
}

// String-building builder set — same shape as real sone builders; each node's
// toString() emits the equivalent sone source code.
export const stringBuilders = snodeBuilders

/** Render a builder-set node produced by stringBuilders to sone source code. */
export function nodeToCode(node: unknown, indent = 0): string {
  if (node instanceof SNode) return node.toString(indent)
  if (typeof node === 'string') return JSON.stringify(node)
  return String(node)
}

// ── Shared builder interface ───────────────────────────────────────────────

export interface SoneBuilderSet {
  Column:    (...children: any[]) => any
  Row:       (...children: any[]) => any
  Text:      (...children: any[]) => any
  Span:      (text: string) => any
  PageBreak: () => any
  Path:      (d: string) => any
  Photo:     (src: string) => any
}

// ── Shared converter factory ───────────────────────────────────────────────
//
// Takes a set of sone builder functions and returns a convertNode function.
// Pass real sone builders (from 'sone') to produce live layout objects.
// Pass snodeBuilders to produce SNode trees that render to syntax strings.

export function makeConverter(b: SoneBuilderSet) {
  const { Column, Row, Text, Span, PageBreak, Path, Photo } = b

  const HEADING_SIZE: Record<string, number> = { h1: 26, h2: 20, h3: 17, h4: 15, h5: 14, h6: 13 }

  function flattenText(nodes: any[]): string {
    return nodes.map((nd: any) => {
      if (typeof nd === 'string') return nd
      if (nd && typeof nd === 'object') {
        // Works for real sone (props.text) and SNode (props getter)
        const spanText = nd.props?.text
        if (typeof spanText === 'string') return spanText
        const children = nd.children
        if (Array.isArray(children)) return flattenText(children)
      }
      return ''
    }).join('')
  }

  function applyBox(node: any, s: Record<string, string>) {
    const baseP = parseShorthand4(s.padding)
    const pt = px(s.paddingTop)    ?? baseP?.[0]
    const pr = px(s.paddingRight)  ?? baseP?.[1]
    const pb = px(s.paddingBottom) ?? baseP?.[2]
    const pl = px(s.paddingLeft)   ?? baseP?.[3]
    if (baseP || pt != null || pr != null || pb != null || pl != null) {
      node.padding(pt ?? 0, pr ?? 0, pb ?? 0, pl ?? 0)
    }

    const baseM = parseShorthand4(s.margin)
    const mt = pxOrAuto(s.marginTop)    ?? baseM?.[0]
    const mr = pxOrAuto(s.marginRight)  ?? baseM?.[1]
    const mb = pxOrAuto(s.marginBottom) ?? baseM?.[2]
    const ml = pxOrAuto(s.marginLeft)   ?? baseM?.[3]
    if (baseM || mt != null || mr != null || mb != null || ml != null) {
      node.margin(mt ?? 0, mr ?? 0, mb ?? 0, ml ?? 0)
    }

    const g   = px(s.gap);              if (g   != null) { try { node.gap(g) } catch {} }
    const w   = pxOrPct(s.width);       if (w   != null) node.width(w)
    const h   = pxOrPct(s.height);      if (h   != null) node.height(h)
    const mw  = pxOrPct(s.minWidth);    if (mw  != null) node.minWidth(mw)
    const mxw = pxOrPct(s.maxWidth);    if (mxw != null) { try { node.maxWidth(mxw) } catch {} }
    const mnh = pxOrPct(s.minHeight);   if (mnh != null) { try { node.minHeight(mnh) } catch {} }
    const mxh = pxOrPct(s.maxHeight);   if (mxh != null) { try { node.maxHeight(mxh) } catch {} }
    const fl  = px(s.flex);             if (fl  != null) node.flex(fl)
    const fg  = px(s.flexGrow);         if (fg  != null) node.grow(fg)
    const fsh = px(s.flexShrink);       if (fsh != null) node.shrink(fsh)
    const fb  = pxOrPct(s.flexBasis);   if (fb  != null) node.basis(fb)
    const rg  = px(s.rowGap);           if (rg  != null) { try { node.rowGap(rg) } catch {} }
    const cg  = px(s.columnGap);        if (cg  != null) { try { node.columnGap(cg) } catch {} }
    if (s.display)       { try { node.display(s.display) } catch {} }
    if (s.overflow)      { try { node.overflow(s.overflow) } catch {} }
    const op = parseFloat(s.opacity);   if (!isNaN(op)) { try { node.opacity(op) } catch {} }
    if (s.alignContent)  { try { node.alignContent(s.alignContent) } catch {} }

    const bg = s.backgroundColor || s.background
    if (bg && !bg.includes('gradient') && !bg.includes('url(')) node.bg(bg)

    if (s.borderRadius) node.rounded(px(s.borderRadius) ?? 0)
    if (s.justifyContent) { try { node.justifyContent(s.justifyContent) } catch {} }
    if (s.alignItems)     { try { node.alignItems(s.alignItems) } catch {} }
    if (s.alignSelf)      { try { node.alignSelf(s.alignSelf) } catch {} }
    if (s.flexWrap)       { try { node.wrap(s.flexWrap) } catch {} }
    if (s.position)       node.position(s.position)
    const top   = px(s.top);    if (top   != null) node.top(top)
    const left  = px(s.left);   if (left  != null) node.left(left)
    const right = px(s.right);  if (right != null) node.right(right)
    const bot   = px(s.bottom); if (bot   != null) node.bottom(bot)

    let bwT: number | undefined, bwR: number | undefined,
        bwB: number | undefined, bwL: number | undefined
    let borderCol: string | undefined

    const sbw = px(s.borderWidth)
    if (sbw != null) { bwT = bwR = bwB = bwL = sbw }
    if (s.borderColor) borderCol = s.borderColor

    if (s.border) {
      const parts = splitRespectingParens(s.border)
      const bw = px(parts[0])
      if (bw != null) { bwT ??= bw; bwR ??= bw; bwB ??= bw; bwL ??= bw }
      const bc = parseBorderColor(parts); if (bc) borderCol = bc
    }
    if (s.borderTop) {
      const parts = splitRespectingParens(s.borderTop)
      const bw = px(parts[0]); if (bw != null) bwT = bw
      const bc = parseBorderColor(parts); if (bc) borderCol = bc
    }
    if (s.borderBottom) {
      const parts = splitRespectingParens(s.borderBottom)
      const bw = px(parts[0]); if (bw != null) bwB = bw
      const bc = parseBorderColor(parts); if (bc) borderCol = bc
    }
    if (s.borderRight) {
      const parts = splitRespectingParens(s.borderRight)
      const bw = px(parts[0]); if (bw != null) bwR = bw
      const bc = parseBorderColor(parts); if (bc) borderCol = bc
    }
    if (s.borderLeft) {
      const parts = splitRespectingParens(s.borderLeft)
      const bw = px(parts[0]); if (bw != null) bwL = bw
      const bc = parseBorderColor(parts); if (bc) borderCol = bc
    }

    if (bwT != null || bwR != null || bwB != null || bwL != null) {
      node.borderWidth(bwT ?? 0, bwR ?? 0, bwB ?? 0, bwL ?? 0)
    }
    if (borderCol) node.borderColor(borderCol)

    if (s.boxShadow) { try { node.shadow(s.boxShadow) } catch {} }

    if (s.aspectRatio) {
      const slash = s.aspectRatio.indexOf('/')
      const ar = slash >= 0
        ? parseFloat(s.aspectRatio.slice(0, slash)) / parseFloat(s.aspectRatio.slice(slash + 1))
        : parseFloat(s.aspectRatio)
      if (!isNaN(ar) && ar > 0) { try { node.aspectRatio(ar) } catch {} }
    }

    return node
  }

  function applyTextStyle(node: any, s: Record<string, string>, contextFontSize?: number) {
    const fs = px(s.fontSize); if (fs != null) node.size(fs)
    if (s.lineHeight) {
      const lhPx = px(s.lineHeight)
      if (lhPx != null && lhPx > 0) {
        const size = fs ?? contextFontSize ?? 16
        node.lineHeight(lhPx / size)
      }
    }
    const ls = px(s.letterSpacing); if (ls != null) node.letterSpacing(ls)
    if (s.color)      node.color(s.color)
    if (s.fontWeight) node.weight(s.fontWeight === 'bold' || parseInt(s.fontWeight) >= 600 ? 'bold' : 'normal')
    if (s.textAlign) {
      const align = s.textAlign === 'start' ? 'left' : s.textAlign === 'end' ? 'right' : s.textAlign
      if (['left', 'right', 'center', 'justify'].includes(align)) node.align(align)
    }
    if (s.fontFamily) node.font(s.fontFamily.replace(/['"]/g, '').split(',')[0].trim())
    if (s.textDecoration) {
      if (s.textDecoration.includes('underline'))    { try { node.underline(1) }     catch {} }
      if (s.textDecoration.includes('line-through')) { try { node.lineThrough(1) }   catch {} }
    }
    if (s.textOverflow === 'ellipsis') { try { node.textOverflow('ellipsis') } catch {} }
    const ml = px(s.WebkitLineClamp); if (ml != null && ml > 0) { try { node.maxLines(ml) } catch {} }
    return node
  }

  function dropWS(kids: any[]): any[] {
    return kids.filter((c: any) => typeof c !== 'string' || c.trim() !== '')
  }

  function convertNode(node: HTMLElement | TextNode): any {
    if (node instanceof TextNode) {
      const t = node.text.replace(/\n/g, ' ').replace(/\s+/g, ' ')
      return t || null
    }

    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase() ?? 'div'
    const s = parseStyle(el.getAttribute('style'))
    const kids = el.childNodes
      .map(c => convertNode(c as any))
      .filter((c): c is any => c !== null)

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
      const src = el.getAttribute('src') ?? ''
      const attrW = px(el.getAttribute('width') ?? '')
      const attrH = px(el.getAttribute('height') ?? '')

      if (!src) {
        const nd = Column().bg('#e8e8e8')
        if (!s.width  && attrW != null && attrW > 0) nd.width(attrW)
        if (!s.height && attrH != null && attrH > 0) nd.height(attrH)
        applyBox(nd, s)
        return nd
      }

      const nd = Photo(src)
      if (!s.width  && attrW != null && attrW > 0) nd.width(attrW)
      if (!s.height && attrH != null && attrH > 0) nd.height(attrH)

      const fit = s.objectFit
      if (fit === 'cover' || fit === 'fill' || fit === 'contain') {
        const pos = (s.objectPosition ?? '').toLowerCase()
        const alignment = pos.includes('top') || pos.includes('left') || pos.includes('start')
          ? 'start'
          : pos.includes('bottom') || pos.includes('right') || pos.includes('end')
          ? 'end'
          : pos ? 'center' : undefined
        nd.scaleType(fit, alignment)
      }

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
      const c = Column(...dropWS(kids))
      applyBox(c, s)
      return c
    }

    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      return Column(...dropWS(kids))
    }

    if (tag === 'tr') {
      const c = Row(...dropWS(kids))
      applyBox(c, s)
      return c
    }

    if (tag === 'th' || tag === 'td') {
      const wrapped = dropWS(kids).map((c: any) =>
        typeof c === 'string' ? applyTextStyle(Text(c), s) : c
      )
      const colSpan = parseInt(el.getAttribute('colspan') ?? '1', 10) || 1
      const cell = Column(...wrapped).flex(colSpan).padding(7, 10)
      if (tag === 'th') {
        if (s.backgroundColor) cell.bg(s.backgroundColor)
        wrapped.forEach((c: any) => { try { c.color(s.color ?? '#000').weight('bold') } catch {} })
      }
      const cellStyle = { ...s }
      if (cellStyle.border) {
        const tr = el.parentNode as HTMLElement
        const trParent = tr?.parentNode as HTMLElement
        const trParentTag = trParent?.tagName?.toLowerCase() ?? ''
        const tableEl = ['tbody', 'thead', 'tfoot'].includes(trParentTag)
          ? (trParent.parentNode as HTMLElement) : trParent
        const trCells = tr?.childNodes.filter(
          (n: any) => ['td', 'th'].includes((n as HTMLElement).tagName?.toLowerCase() ?? '')
        ) ?? []
        const isFirstCol = trCells[0] === el
        const allRows = tableEl?.querySelectorAll('tr') ?? []
        const isFirstRow = allRows.length > 0 && allRows[0] === tr
        cellStyle.borderRight  = cellStyle.borderRight  ?? cellStyle.border
        cellStyle.borderBottom = cellStyle.borderBottom ?? cellStyle.border
        if (isFirstCol) cellStyle.borderLeft = cellStyle.borderLeft ?? cellStyle.border
        if (isFirstRow) cellStyle.borderTop  = cellStyle.borderTop  ?? cellStyle.border
        delete cellStyle.border
      }
      applyBox(cell, cellStyle)
      return cell
    }

    // ── list items ────────────────────────────────────────────────
    if (tag === 'li') {
      const parentTag = (el.parentNode as HTMLElement)?.tagName?.toLowerCase()
      const isOrdered = parentTag === 'ol'
      const marker = isOrdered
        ? `${Array.from(el.parentNode!.childNodes).filter((nd: any) => (nd as HTMLElement).tagName?.toLowerCase() === 'li').indexOf(el) + 1}.`
        : '•'

      const BLOCK_TAGS_SET = new Set(['ul', 'ol', 'table', 'div', 'p', 'section', 'blockquote'])
      const inlineKids: any[] = []
      const blockKids: any[] = []

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
      applyTextStyle(t, s, HEADING_SIZE[tag])
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
    const wrapped = dropWS(kids).map((c: any) => {
      if (typeof c === 'string') return applyTextStyle(Text(c), s)
      // Bare Span nodes can't live directly in a Column/Row — wrap in Text
      if (c?.type === 'span') return Text(c)
      return c
    })
    const fd = s.flexDirection ?? ''
    const isRow = fd === 'row' || fd === 'row-reverse'
    if (isRow) {
      const rowKids = wrapped.map((c: any) => {
        if (c?.type !== 'text') return c
        return Column(c).flex(1)
      })
      const container = Row(...rowKids)
      if (fd === 'row-reverse') { try { container.direction('row-reverse') } catch {} }
      applyBox(container, s)
      return container
    }
    const container = Column(...wrapped)
    if (fd === 'column-reverse') { try { container.direction('column-reverse') } catch {} }
    applyBox(container, s)
    return container
  }

  return convertNode
}

// ── SNode page-break hoisting (SNode-specific) ────────────────────────────

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
        if (typeof c === 'string') return snodeBuilders.Text(c)
        if (c instanceof SNode && c.type === 'span') return snodeBuilders.Text(c)
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

// ── Public API ────────────────────────────────────────────────────────────

export interface SoneSyntaxOptions {
  /** Page width in px (default 794) */
  width?: number
  /** Page height in px. When set, emits .height() instead of .minHeight(1) on the root Column */
  height?: number
  /** Background color for the root Column (default 'white') */
  background?: string
  /** CSS position value for the root Column, e.g. 'relative' for absolute-positioned layouts */
  containerPosition?: string
  /** Whether to include sone import statement at the top (default false) */
  preamble?: boolean
}

const _syntaxConverter = makeConverter(snodeBuilders)

/**
 * Convert a single HTML element string to its bare sone expression (no outer Column wrapper).
 * Used by block-level direct mapping so callers can add position/size themselves.
 * Returns null if the HTML produces no renderable node.
 */
export function htmlElemToSoneExpr(html: string): string | null {
  const root = parse(html)
  const el = root.childNodes.find(n => !(n instanceof TextNode) || n.text.trim()) as any
  if (!el) return null
  const node = _syntaxConverter(el)
  if (node == null) return null
  if (typeof node === 'string') return node.trim() ? JSON.stringify(node) : null
  const nd = node instanceof SNode && node.type === 'span' ? snodeBuilders.Text(node) : node
  return nd.toString(0)
}

export function htmlToSoneSyntax(html: string, opts: SoneSyntaxOptions = {}): string {
  const { width = 794, preamble = false } = opts

  const root = parse(html)
  const kids = root.childNodes
    .map(c => _syntaxConverter(c as any))
    .filter((c): c is SNode | string => c !== null)
    .filter(c => typeof c !== 'string' || c.trim() !== '')

  const normalized = kids.map(k => {
    if (typeof k === 'string') return snodeBuilders.Text(k)
    if (k instanceof SNode && k.type === 'span') return snodeBuilders.Text(k)
    return k
  })

  const layout = snodeBuilders.Column(...hoistPageBreaks(normalized)).width(width)
  if (opts.height != null) layout.height(opts.height)
  else layout.minHeight(1)
  layout.bg(opts.background ?? 'white')
  if (opts.containerPosition) layout.position(opts.containerPosition)
  const expr = layout.toString(0)

  if (!preamble) return expr

  const fns = ['Column', 'Row', 'Text', 'Span', 'PageBreak', 'Path']
  return `import { ${fns.join(', ')} } from 'sone'\n\n${expr}\n`
}
