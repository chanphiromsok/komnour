import type { SoneBuilderSet } from '@komnour/html-to-syntax'
import { stringBuilders, nodeToCode } from '@komnour/html-to-syntax'
import type { SoneBlock, VeDoc, TextProps, RectProps, LineProps, PhotoProps, ListProps } from '../types'

const DASH: Record<string, number[]> = { dashed: [8, 4], dotted: [2, 4] }

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
  const { type, x, y, w, h } = block
  const pos = (node: any) => {
    if (positioned) node.position('absolute').left(Math.round(x)).top(Math.round(y))
    return node
  }

  switch (type) {
    case 'text': {
      const p = block.props as TextProps
      const node = b.Text(p.text)
      node.size(p.size).color(p.color)
      if (p.weight === 'bold') node.weight('bold')
      if (p.align !== 'left') node.align(p.align)
      if (p.lineHeight > 0) node.lineHeight(p.lineHeight)
      node.font(p.font || pageFont)
      if (w > 0) node.width(w)
      return pos(node)
    }

    case 'rect': {
      const p = block.props as RectProps
      const node = b.Column().width(Math.max(1, w)).height(Math.max(1, h))
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
      if (p.dash !== 'solid') {
        const node = b.Path(`M0 ${sw / 2} L${lw} ${sw / 2}`)
          .stroke(p.stroke).strokeWidth(sw)
          .strokeDashArray(...DASH[p.dash])
          .width(lw).height(sw)
        return pos(node)
      }
      return pos(b.Column().width(lw).height(sw).bg(p.stroke))
    }

    case 'vline': {
      const p = block.props as LineProps
      const lh = Math.max(1, h)
      const sw = Math.max(1, p.strokeWidth)
      if (p.dash !== 'solid') {
        const node = b.Path(`M${sw / 2} 0 L${sw / 2} ${lh}`)
          .stroke(p.stroke).strokeWidth(sw)
          .strokeDashArray(...DASH[p.dash])
          .width(sw).height(lh)
        return pos(node)
      }
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
      const rows = p.items.map(item =>
        b.Row(
          b.Text('•').size(p.size).color(p.color).font(font),
          b.Text(item).size(p.size).color(p.color).font(font),
        ).gap(8),
      )
      const node = b.Column(...rows).gap(4)
      if (w > 0) node.width(w)
      return pos(node)
    }
  }
}

/** Generate the full sone layout source code for a document. */
export function docToSoneCode(doc: VeDoc): string {
  const exprs = doc.blocks
    .map(blk => buildBlockNode(blk, stringBuilders as unknown as SoneBuilderSet, doc.font, true))
    .filter(Boolean)
    .map(node => nodeToCode(node, 1))

  const uses = (fn: string) => exprs.some(e => e.includes(`${fn}(`))
  const fns = ['Column', 'Row', 'Text', 'Span', 'Path', 'Photo'].filter(
    f => f === 'Column' || uses(f),
  )

  const pages = Math.max(1, doc.pages || 1)
  const totalH = doc.paperHeight * pages
  const pageHint = pages > 1
    ? [`// ${pages} pages — render with: renderPages(layout, renderer, { pageHeight: ${doc.paperHeight} })`]
    : []

  return [
    `import { ${fns.join(', ')} } from 'sone'`,
    ``,
    ...pageHint,
    `Column(`,
    exprs.map(e => `  ${e}`).join(',\n'),
    `).width(${doc.paperWidth}).height(${totalH}).bg(${JSON.stringify(doc.bg)}).position("relative")`,
    ``,
  ].join('\n')
}
