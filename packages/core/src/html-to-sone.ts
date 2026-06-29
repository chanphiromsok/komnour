import { parse } from 'node-html-parser'
import { Column, Row, Text, Span, PageBreak, Path, Photo } from 'sone'
import { makeConverter } from '@komnour/html-to-syntax'

type AnyNode = ReturnType<typeof Column> | ReturnType<typeof Text> | ReturnType<typeof Span>

// Single converter instance — shared logic lives in @komnour/html-to-syntax
const convertNode = makeConverter({ Column, Row, Text, Span, PageBreak, Path, Photo })

function isPageBreakNode(n: any): boolean {
  return n && typeof n === 'object' && n.type === 'column' &&
    n.props?.pageBreak === 'before' && n.children?.length === 0
}

function hasPageBreak(n: any): boolean {
  if (!n || typeof n === 'string') return false
  if (isPageBreakNode(n)) return true
  return Array.isArray(n.children) && n.children.some(hasPageBreak)
}

function hoistPageBreaks(nodes: AnyNode[]): AnyNode[] {
  const result: AnyNode[] = []
  for (const node of nodes) {
    if (!hasPageBreak(node)) { result.push(node); continue }
    if (isPageBreakNode(node)) { result.push(node); continue }
    const children: any[] = (node as any).children ?? []
    let bucket: any[] = []
    const flush = () => {
      if (bucket.length === 0) return
      const safe = bucket.map((c: any) => {
        if (typeof c === 'string') return Text(c as any) as any
        if (c?.type === 'span') return Text(c) as any
        return c
      })
      result.push({ ...(node as any), id: -1, children: safe })
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

export function htmlToSone(htmlString: string) {
  const root = parse(htmlString)
  const kids = root.childNodes
    .map(c => convertNode(c as any))
    .filter((c): c is AnyNode => c !== null)

  const normalized = kids.map(k => {
    if (typeof k === 'string') return Text(k as any) as any
    if (k && (k as any).type === 'span') return Text(k as any) as any
    return k
  })

  return Column(...hoistPageBreaks(normalized) as any)
}
