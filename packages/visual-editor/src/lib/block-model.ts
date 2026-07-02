import type { SoneBlock, VeDoc, BlockType, TextProps, LineProps } from '../types'
// The model has no page-break block: pages are y-ranges of one tall artboard
// (see VeDoc). Old-format <page-break> elements migrate to extra pages.

let seq = 0
export const uid = () => `b${Date.now().toString(36)}${++seq}`

export const LS_DOC_KEY = 'komnour:ve:doc'
const LS_OLD_HTML_KEY = 'komnour:ve:html'

// ── New block templates ───────────────────────────────────────────────────────

const textDefaults = (): TextProps => ({
  text: 'New text', size: 13, color: '#333333', weight: 'normal',
  align: 'left', lineHeight: 1.6, font: '',
})

export function newBlock(type: BlockType, x: number, y: number, paperWidth: number): SoneBlock {
  const base = { id: uid(), type, x, y }
  switch (type) {
    case 'text':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: textDefaults() }
    case 'rect':
      return { ...base, w: 160, h: 80, props: { fill: '#e8edf3', stroke: '#c0c8d4', strokeWidth: 1, radius: 4 } }
    case 'hline':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: { stroke: '#e1e4e8', strokeWidth: 1, dash: 'solid' } }
    case 'vline':
      return { ...base, w: 0, h: 80, props: { stroke: '#e1e4e8', strokeWidth: 2, dash: 'solid' } }
    case 'photo':
      return { ...base, w: 200, h: 140, props: { src: '', fit: '' } }
    case 'list':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: { items: ['Item 1', 'Item 2'], size: 13, color: '#333333', font: '' } }
  }
}

/** Heading is a text block preset, not a separate type. */
export function newHeading(x: number, y: number, paperWidth: number): SoneBlock {
  const blk = newBlock('text', x, y, paperWidth)
  blk.props = { ...textDefaults(), text: 'Heading', size: 24, weight: 'bold', color: '#0d1117' }
  return blk
}

// ── Default document ──────────────────────────────────────────────────────────

export function defaultDoc(): VeDoc {
  const t = (over: Partial<TextProps>): TextProps => ({ ...textDefaults(), ...over })
  return {
    paperWidth: 794,
    paperHeight: 1123,
    pages: 1,
    bg: 'white',
    font: 'Noto Sans Khmer',
    blocks: [
      { id: uid(), type: 'text', x: 20, y: 24, w: 754, h: 0,
        props: t({ text: 'កិច្ចសន្យាខ្ចីប្រាក់', size: 22, weight: 'bold', align: 'center', color: '#1a1a2e' }) },
      { id: uid(), type: 'text', x: 20, y: 76, w: 754, h: 0,
        props: t({ text: 'LOAN AGREEMENT CONTRACT', size: 13, align: 'center', color: '#555555' }) },
      { id: uid(), type: 'hline', x: 20, y: 110, w: 754, h: 0,
        props: { stroke: '#e1e4e8', strokeWidth: 1, dash: 'solid' } },
      { id: uid(), type: 'text', x: 20, y: 136, w: 754, h: 0,
        props: t({ text: 'ចំនួនប្រាក់កម្ចី: $12,000.00', size: 13, lineHeight: 1.7 }) },
      { id: uid(), type: 'text', x: 20, y: 176, w: 754, h: 0,
        props: t({ text: 'អត្រាការប្រាក់: 1.5% / ខែ', size: 13, lineHeight: 1.7, color: '#c0392b' }) },
    ],
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveDoc(doc: VeDoc) {
  localStorage.setItem(LS_DOC_KEY, JSON.stringify(doc))
}

export function loadDoc(): VeDoc {
  try {
    const raw = localStorage.getItem(LS_DOC_KEY)
    if (raw) {
      const doc = JSON.parse(raw) as VeDoc
      if (Array.isArray(doc.blocks) && doc.paperWidth > 0) {
        doc.pages = Math.max(1, doc.pages || 1)
        return doc
      }
    }
  } catch { /* fall through */ }

  const oldHtml = localStorage.getItem(LS_OLD_HTML_KEY)
  if (oldHtml) {
    const migrated = migrateHtmlDoc(oldHtml)
    if (migrated) return migrated
  }
  return defaultDoc()
}

// ── Migration from the old HTML data-block format ─────────────────────────────

function firstStyled(el: Element, prop: string): string {
  const own = (el as HTMLElement).style?.getPropertyValue(prop)
  if (own) return own
  for (const child of Array.from(el.querySelectorAll('[style]'))) {
    const v = (child as HTMLElement).style.getPropertyValue(prop)
    if (v) return v
  }
  return ''
}

export function migrateHtmlDoc(rawHtml: string): VeDoc | null {
  try {
    const parsed = new DOMParser().parseFromString(rawHtml, 'text/html')
    const root = parsed.body.firstElementChild as HTMLElement | null
    if (!root) return null

    const paperWidth = parseFloat(root.style.width) || 794
    const paperHeight = parseFloat(root.style.height) || 1123
    const bg = root.style.backgroundColor || root.style.background || 'white'
    const font = root.style.fontFamily?.replace(/['"]/g, '').split(',')[0].trim() || 'Noto Sans Khmer'

    const blocks: SoneBlock[] = []
    let pages = 1
    for (const wrap of Array.from(root.children)) {
      const wEl = wrap as HTMLElement
      const hasWrapper = wEl.hasAttribute('data-block')
      const inner = (hasWrapper ? wEl.firstElementChild : wEl) as HTMLElement | null
      if (!inner) continue

      const x = hasWrapper ? parseFloat(wEl.style.left) || 0 : 20
      const y = hasWrapper ? parseFloat(wEl.style.top) || 0 : blocks.length * 60 + 20
      const w = hasWrapper ? parseFloat(wEl.style.width) || 0 : 0
      const h = hasWrapper ? parseFloat(wEl.style.height) || 0 : 0
      const tag = inner.tagName.toLowerCase()
      const shape = inner.getAttribute('data-shape')

      if (tag === 'page-break') {
        pages += 1
        continue
      }

      if (tag === 'svg') {
        const child = inner.firstElementChild
        const stroke = child?.getAttribute('stroke') || '#e1e4e8'
        const sw = parseFloat(child?.getAttribute('stroke-width') || '1') || 1
        const line: LineProps = { stroke, strokeWidth: sw, dash: 'solid' }
        if (shape === 'hline') {
          blocks.push({ id: uid(), type: 'hline', x, y, w: w || 300, h: 0, props: line })
        } else if (shape === 'vline') {
          blocks.push({ id: uid(), type: 'vline', x, y, w: 0, h: h || 80, props: line })
        } else {
          const svgW = w || parseFloat(inner.getAttribute('width') || '160') || 160
          const svgH = h || parseFloat(inner.getAttribute('height') || '80') || 80
          blocks.push({
            id: uid(), type: 'rect', x, y, w: svgW, h: svgH,
            props: {
              fill: child?.getAttribute('fill') || '#e8edf3',
              stroke, strokeWidth: sw,
              radius: parseFloat(child?.getAttribute('rx') || '0') || 0,
            },
          })
        }
        continue
      }

      if (tag === 'img') {
        blocks.push({
          id: uid(), type: 'photo', x, y, w: w || 200, h: h || 140,
          props: { src: inner.getAttribute('src') || '', fit: '' },
        })
        continue
      }

      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(inner.querySelectorAll('li')).map(li => li.textContent?.trim() || '')
        blocks.push({
          id: uid(), type: 'list', x, y, w, h: 0,
          props: {
            items: items.length ? items : ['Item'],
            size: parseFloat(firstStyled(inner, 'font-size')) || 13,
            color: firstStyled(inner, 'color') || '#333333',
            font: '',
          },
        })
        continue
      }

      // Everything else becomes a text block with flattened content
      const text = inner.textContent?.replace(/\s+/g, ' ').trim() || ''
      if (!text) continue
      const size = parseFloat(firstStyled(inner, 'font-size')) || 13
      const lhPx = parseFloat(firstStyled(inner, 'line-height'))
      const weightRaw = firstStyled(inner, 'font-weight')
      blocks.push({
        id: uid(), type: 'text', x, y, w, h: 0,
        props: {
          text, size,
          color: firstStyled(inner, 'color') || '#333333',
          weight: weightRaw === 'bold' || parseInt(weightRaw) >= 600 ? 'bold' : 'normal',
          align: (firstStyled(inner, 'text-align') as TextProps['align']) || 'left',
          lineHeight: lhPx > 0 ? Math.round((lhPx / size) * 100) / 100 : 0,
          font: firstStyled(inner, 'font-family')?.replace(/['"]/g, '').split(',')[0].trim() || '',
        },
      })
    }

    return { paperWidth, paperHeight, pages, bg, font, blocks }
  } catch {
    return null
  }
}
