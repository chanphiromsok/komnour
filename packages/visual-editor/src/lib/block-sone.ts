import type { SoneBuilderSet } from '@komnour/html-to-syntax'
import { stringBuilders, nodeToCode } from '@komnour/html-to-syntax'
import type {
  SoneBlock, VeDoc, TextProps, TextSpan, RectProps, LineProps, PhotoProps, ListProps,
  TableProps, DashStyle,
} from '../types'

// ── Dashed strips composed from filled Column segments (no Path/SVG) ──────────

function dashGeom(thickness: number, dash: DashStyle) {
  if (dash === 'dotted') return { len: Math.max(1, thickness), gap: Math.max(2, thickness * 1.5) }
  return { len: Math.max(4, thickness * 3), gap: Math.max(3, thickness * 2) }
}

function dashStrip(b: SoneBuilderSet, horizontal: boolean, length: number, thickness: number, color: string, dash: DashStyle): any {
  const { len, gap } = dashGeom(thickness, dash)
  const n = Math.max(1, Math.round((length + gap) / (len + gap)))
  const seg = () => horizontal
    ? b.Column().width(len).height(thickness).bg(color)
    : b.Column().width(thickness).height(len).bg(color)
  const segs = Array.from({ length: n }, seg)
  const container = horizontal ? b.Row(...segs) : b.Column(...segs)
  return container.gap(gap)
}

// ── Rich text ─────────────────────────────────────────────────────────────────

function spanNode(b: SoneBuilderSet, s: TextSpan): any {
  const sp = b.Span(s.text)
  if (s.bold) sp.weight('bold')
  if (s.italic) sp.style('italic')
  if (s.underline) sp.underline(1)
  if (s.strike) sp.lineThrough(1)
  if (s.color) sp.color(s.color)
  if (s.size) sp.size(s.size)
  if (s.font) sp.font(s.font)
  return sp
}

// ── Table occupancy ─────────────────────────────────────────────────────────
// rows[r] is full-width with null where a colspan/rowspan cell covers the slot,
// so an array index equals the column index. Cell width = sum of colWidths it
// spans.
function cellWidth(p: TableProps, colIndex: number, colspan: number): number {
  let w = 0
  for (let c = colIndex; c < colIndex + colspan && c < p.colWidths.length; c++) w += p.colWidths[c]
  return w
}

/**
 * Build the sone node for one block. Pass real sone builders to get a live
 * renderable node, or stringBuilders to get a node whose toString() is code.
 *
 * `positioned: false` renders the block standalone (per-block canvas);
 * `positioned: true` adds .position("absolute").left().top() for the document.
 */
export function buildBlockNode(
  block: SoneBlock,
  b: SoneBuilderSet,
  pageFont: string,
  positioned: boolean,
): any {
  const { type, x, y, w, h, rotation } = block
  const pos = (node: any) => {
    if (positioned) node.position('absolute').left(Math.round(x)).top(Math.round(y))
    if (rotation) node.rotate(rotation)
    return node
  }

  switch (type) {
    case 'text': {
      const p = block.props as TextProps
      const spans = p.spans.length ? p.spans : [{ text: '' }]
      const node = b.Text(...spans.map(s => spanNode(b, s)))
      node.size(p.size).color(p.color)
      if (p.align !== 'left') node.align(p.align)
      if (p.lineHeight > 0) node.lineHeight(p.lineHeight)
      node.font(p.font || pageFont)
      if (w > 0) node.width(w)
      return pos(node)
    }

    case 'rect': {
      const p = block.props as RectProps
      const rw = Math.max(1, w), rh = Math.max(1, h)
      if (p.dash !== 'solid' && p.strokeWidth > 0 && p.stroke && p.stroke !== 'none') {
        // Compose the dashed border from four positioned strips (no Path).
        const sw = p.strokeWidth
        const box = b.Column(
          dashStrip(b, true, rw, sw, p.stroke, p.dash).position('absolute').top(0).left(0),
          dashStrip(b, true, rw, sw, p.stroke, p.dash).position('absolute').bottom(0).left(0),
          dashStrip(b, false, rh, sw, p.stroke, p.dash).position('absolute').top(0).left(0),
          dashStrip(b, false, rh, sw, p.stroke, p.dash).position('absolute').top(0).right(0),
        ).width(rw).height(rh)
        if (p.fill && p.fill !== 'none') box.bg(p.fill)
        if (p.radius > 0) box.rounded(p.radius)
        return pos(box)
      }
      const node = b.Column().width(rw).height(rh)
      if (p.fill && p.fill !== 'none') node.bg(p.fill)
      if (p.strokeWidth > 0 && p.stroke && p.stroke !== 'none') {
        node.borderWidth(p.strokeWidth).borderColor(p.stroke)
      }
      if (p.radius > 0) node.rounded(p.radius)
      return pos(node)
    }

    case 'hline': {
      const p = block.props as LineProps
      const lw = Math.max(1, w)
      const sw = Math.max(1, p.strokeWidth)
      if (p.dash !== 'solid') return pos(dashStrip(b, true, lw, sw, p.stroke, p.dash))
      return pos(b.Column().width(lw).height(sw).bg(p.stroke))
    }

    case 'vline': {
      const p = block.props as LineProps
      const lh = Math.max(1, h)
      const sw = Math.max(1, p.strokeWidth)
      if (p.dash !== 'solid') return pos(dashStrip(b, false, lh, sw, p.stroke, p.dash))
      return pos(b.Column().width(sw).height(lh).bg(p.stroke))
    }

    case 'photo': {
      const p = block.props as PhotoProps
      const pw = Math.max(1, w), ph = Math.max(1, h)
      if (!p.src) return pos(b.Column().width(pw).height(ph).bg('#e8e8e8'))
      const node = b.Photo(p.src).width(pw).height(ph)
      if (p.fit) node.scaleType(p.fit)
      return pos(node)
    }

    case 'list': {
      const p = block.props as ListProps
      const font = p.font || pageFont
      const List = b.List!, ListItem = b.ListItem!
      const items = p.items.map(it =>
        ListItem(b.Text(b.Span(it)).size(p.size).color(p.color).font(font)),
      )
      const node = List(...items).listStyle(p.listStyle).gap(p.gap)
      if (w > 0) node.width(w)
      return pos(node)
    }

    case 'table': {
      const p = block.props as TableProps
      const font = p.font || pageFont
      const Table = b.Table!, TableRow = b.TableRow!, TableCell = b.TableCell!
      const rows = p.rows.map((row, r) => {
        const cells: any[] = []
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (!cell) continue
          const isHeader = p.headerRow && r === 0
          const txt = b.Text(b.Span(cell.text))
            .size(p.size).color(p.color).font(font)
          if (cell.bold || isHeader) txt.weight('bold')
          if (cell.align !== 'left') txt.align(cell.align)
          const tc = TableCell(txt).colspan(cell.colspan).rowspan(cell.rowspan).padding(4, 6)
          const cw = cellWidth(p, c, cell.colspan)
          if (cw > 0) tc.width(cw)
          const bg = cell.bg || (isHeader ? p.headerBg : '')
          if (bg) tc.bg(bg)
          if (p.borderWidth > 0) {
            // Border-collapse: each cell draws right + bottom, plus top on the
            // first row and left on the first column — single lines, no doubling.
            const bw = p.borderWidth
            tc.borderWidth(r === 0 ? bw : 0, bw, bw, c === 0 ? bw : 0).borderColor(p.borderColor)
          }
          cells.push(tc)
        }
        const tr = TableRow(...cells)
        if (p.rowHeights[r] > 0) tr.height(p.rowHeights[r])
        return tr
      })
      // No border on the Table node itself — cells own all edges (avoids the
      // doubled outer border).
      return pos(Table(...rows))
    }
  }
}

// ── Page-number tokens + repeat stamping ──────────────────────────────────────
// {page}/{pages} in text spans are substituted per page. A repeat block is
// stamped at its in-page offset on every page; other blocks render once.

export function substituteTokens(block: SoneBlock, pageNum: number, totalPages: number): SoneBlock {
  if (block.type !== 'text') return block
  const p = block.props as TextProps
  if (!p.spans.some(s => s.text.includes('{page') )) return block
  const spans = p.spans.map(s => ({
    ...s,
    text: s.text.replace(/\{pages\}/g, String(totalPages)).replace(/\{page\}/g, String(pageNum)),
  }))
  return { ...block, props: { ...p, spans } }
}

/**
 * Group blocks per page, with y made relative to each page's top. A repeat
 * block appears on every page; other blocks land on the page their y falls in.
 * Page-number tokens are substituted per page.
 */
export function pageGroups(doc: VeDoc): SoneBlock[][] {
  const pages = Math.max(1, doc.pages)
  const ph = doc.paperHeight
  const groups: SoneBlock[][] = Array.from({ length: pages }, () => [])
  for (const b of doc.blocks) {
    const inPageY = b.y - Math.floor(b.y / ph) * ph
    if (b.repeat) {
      for (let p = 0; p < pages; p++) {
        groups[p].push(substituteTokens({ ...b, y: inPageY }, p + 1, pages))
      }
    } else {
      const p = Math.min(pages - 1, Math.max(0, Math.floor(b.y / ph)))
      groups[p].push(substituteTokens({ ...b, y: inPageY }, p + 1, pages))
    }
  }
  return groups
}

// ── Codegen ───────────────────────────────────────────────────────────────────

/** Generate the full sone layout source code for a document. */
export function docToSoneCode(doc: VeDoc): string {
  const sb = stringBuilders as unknown as SoneBuilderSet
  const groups = pageGroups(doc)
  const usedFns = new Set<string>(['Column'])

  // One relative Column per page; blocks positioned absolutely within it.
  const pageColumns = groups.map(blocks => {
    const exprs = blocks
      .map(blk => buildBlockNode(blk, sb, doc.font, true))
      .filter(Boolean)
      .map(node => nodeToCode(node, 2))
    for (const fn of ['Row', 'Text', 'Span', 'Photo', 'List', 'ListItem', 'Table', 'TableRow', 'TableCell']) {
      if (exprs.some(e => e.includes(`${fn}(`))) usedFns.add(fn)
    }
    const body = exprs.length ? `\n${exprs.map(e => `    ${e}`).join(',\n')}\n  ` : ''
    return `Column(${body}).width(${doc.paperWidth}).height(${doc.paperHeight}).bg(${JSON.stringify(doc.bg)}).position("relative")`
  })

  const pages = groups.length
  let layout: string
  if (pages === 1) {
    layout = pageColumns[0]
  } else {
    usedFns.add('PageBreak')
    const joined = pageColumns.join(',\n  PageBreak(),\n  ')
    layout = `Column(\n  ${joined}\n)`
  }

  const order = ['Column', 'Row', 'Text', 'Span', 'PageBreak', 'Photo', 'List', 'ListItem', 'Table', 'TableRow', 'TableCell']
  const fns = order.filter(f => usedFns.has(f))
  const hint = pages > 1
    ? `\n// Render paginated: renderPages(layout, renderer, { pageHeight: ${doc.paperHeight} })`
    : ''

  return `import { ${fns.join(', ')} } from 'sone'\n${hint}\n${layout}\n`
}
