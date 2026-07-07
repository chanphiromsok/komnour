import type {
  SoneBlock, VeDoc, BlockType, TextProps, TextSpan, LineProps, TableProps, TableCell,
} from '../types'

let seq = 0
export const uid = () => `b${Date.now().toString(36)}${++seq}`

export const LS_DOC_KEY = 'komnour:ve:doc'
const LS_OLD_HTML_KEY = 'komnour:ve:html'

// ── Span helpers ──────────────────────────────────────────────────────────────

export const plainSpans = (text: string): TextSpan[] => [{ text }]
export const spansText = (spans: TextSpan[]): string => spans.map(s => s.text).join('')

// ── New block templates ───────────────────────────────────────────────────────

const textDefaults = (): TextProps => ({
  spans: plainSpans('New text'), size: 13, color: '#333333',
  align: 'left', lineHeight: 1.6, font: '',
})

const defaultTable = (): TableProps => {
  const cell = (text: string, bold = false): TableCell =>
    ({ text, colspan: 1, rowspan: 1, bg: '', align: 'left', bold })
  return {
    rows: [
      [cell('Header 1', true), cell('Header 2', true), cell('Header 3', true)],
      [cell('R1C1'), cell('R1C2'), cell('R1C3')],
      [cell('R2C1'), cell('R2C2'), cell('R2C3')],
    ],
    colWidths: [120, 120, 120],
    rowHeights: [28, 28, 28],
    borderColor: '#c8d0da', borderWidth: 1,
    size: 12, color: '#333333',
    headerRow: true, headerBg: '#f0f3f7',
    font: '',
  }
}

export function newBlock(type: BlockType, x: number, y: number, paperWidth: number): SoneBlock {
  const base = { id: uid(), type, x, y, rotation: 0 }
  switch (type) {
    case 'text':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: textDefaults() }
    case 'rect':
      return { ...base, w: 160, h: 80, props: { fill: '#e8edf3', stroke: '#c0c8d4', strokeWidth: 1, radius: 4, dash: 'solid' } }
    case 'hline':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: { stroke: '#e1e4e8', strokeWidth: 1, dash: 'solid' } }
    case 'vline':
      return { ...base, w: 0, h: 80, props: { stroke: '#e1e4e8', strokeWidth: 2, dash: 'solid' } }
    case 'photo':
      return { ...base, w: 200, h: 140, props: { src: '', fit: '' } }
    case 'list':
      return { ...base, w: paperWidth - 2 * x, h: 0, props: { items: ['Item 1', 'Item 2'], listStyle: 'disc', size: 13, color: '#333333', gap: 4, font: '' } }
    case 'table': {
      const t = defaultTable()
      return { ...base, w: t.colWidths.reduce((a, b) => a + b, 0), h: t.rowHeights.reduce((a, b) => a + b, 0), props: t }
    }
  }
}

/** Heading is a text block preset, not a separate type. */
export function newHeading(x: number, y: number, paperWidth: number): SoneBlock {
  const blk = newBlock('text', x, y, paperWidth)
  blk.props = { ...textDefaults(), spans: [{ text: 'Heading', bold: true }], size: 24, color: '#0d1117' }
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
      { id: uid(), type: 'text', x: 20, y: 24, w: 754, h: 0, rotation: 0,
        props: t({ spans: [{ text: 'កិច្ចសន្យាខ្ចីប្រាក់', bold: true }], size: 22, align: 'center', color: '#1a1a2e' }) },
      { id: uid(), type: 'text', x: 20, y: 76, w: 754, h: 0, rotation: 0,
        props: t({ spans: plainSpans('LOAN AGREEMENT CONTRACT'), size: 13, align: 'center', color: '#555555' }) },
      { id: uid(), type: 'hline', x: 20, y: 110, w: 754, h: 0, rotation: 0,
        props: { stroke: '#e1e4e8', strokeWidth: 1, dash: 'solid' } },
      { id: uid(), type: 'text', x: 20, y: 136, w: 754, h: 0, rotation: 0,
        props: t({ spans: [{ text: 'ចំនួនប្រាក់កម្ចី: ' }, { text: '$12,000.00', bold: true }], size: 13, lineHeight: 1.7 }) },
      { id: uid(), type: 'text', x: 20, y: 176, w: 754, h: 0, rotation: 0,
        props: t({ spans: [{ text: 'អត្រាការប្រាក់: ' }, { text: '1.5% / ខែ', color: '#c0392b' }], size: 13, lineHeight: 1.7 }) },
    ],
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveDoc(doc: VeDoc) {
  localStorage.setItem(LS_DOC_KEY, JSON.stringify(doc))
}

/** Backfill fields added after a doc was first saved. */
function normalizeDoc(doc: VeDoc): VeDoc {
  doc.pages = Math.max(1, doc.pages || 1)
  doc.blocks.forEach(b => {
    b.rotation ??= 0
    if (b.type === 'text') {
      const p = b.props as TextProps & { text?: string; weight?: string }
      if (!Array.isArray(p.spans)) {
        p.spans = p.text != null ? [{ text: p.text, bold: p.weight === 'bold' }] : plainSpans('')
      }
      delete p.text; delete p.weight
    }
    if (b.type === 'list') {
      const p = b.props as { listStyle?: string; gap?: number }
      p.listStyle ??= 'disc'
      p.gap ??= 4
    }
    if (b.type === 'rect' || b.type === 'hline' || b.type === 'vline') {
      const p = b.props as { dash?: string }
      p.dash ??= 'solid'
    }
  })
  return doc
}

export function loadDoc(): VeDoc {
  try {
    const raw = localStorage.getItem(LS_DOC_KEY)
    if (raw) {
      const doc = JSON.parse(raw) as VeDoc
      if (Array.isArray(doc.blocks) && doc.paperWidth > 0) return normalizeDoc(doc)
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

      if (tag === 'page-break') { pages += 1; continue }

      if (tag === 'svg') {
        const child = inner.firstElementChild
        const stroke = child?.getAttribute('stroke') || '#e1e4e8'
        const sw = parseFloat(child?.getAttribute('stroke-width') || '1') || 1
        const line: LineProps = { stroke, strokeWidth: sw, dash: 'solid' }
        if (shape === 'hline') {
          blocks.push({ id: uid(), type: 'hline', x, y, w: w || 300, h: 0, rotation: 0, props: line })
        } else if (shape === 'vline') {
          blocks.push({ id: uid(), type: 'vline', x, y, w: 0, h: h || 80, rotation: 0, props: line })
        } else {
          const svgW = w || parseFloat(inner.getAttribute('width') || '160') || 160
          const svgH = h || parseFloat(inner.getAttribute('height') || '80') || 80
          blocks.push({
            id: uid(), type: 'rect', x, y, w: svgW, h: svgH, rotation: 0,
            props: {
              fill: child?.getAttribute('fill') || '#e8edf3',
              stroke, strokeWidth: sw, dash: 'solid',
              radius: parseFloat(child?.getAttribute('rx') || '0') || 0,
            },
          })
        }
        continue
      }

      if (tag === 'img') {
        blocks.push({
          id: uid(), type: 'photo', x, y, w: w || 200, h: h || 140, rotation: 0,
          props: { src: inner.getAttribute('src') || '', fit: '' },
        })
        continue
      }

      if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(inner.querySelectorAll('li')).map(li => li.textContent?.trim() || '')
        blocks.push({
          id: uid(), type: 'list', x, y, w, h: 0, rotation: 0,
          props: {
            items: items.length ? items : ['Item'],
            listStyle: tag === 'ol' ? 'decimal' : 'disc',
            size: parseFloat(firstStyled(inner, 'font-size')) || 13,
            color: firstStyled(inner, 'color') || '#333333',
            gap: 4,
            font: '',
          },
        })
        continue
      }

      const text = inner.textContent?.replace(/\s+/g, ' ').trim() || ''
      if (!text) continue
      const size = parseFloat(firstStyled(inner, 'font-size')) || 13
      const lhPx = parseFloat(firstStyled(inner, 'line-height'))
      const weightRaw = firstStyled(inner, 'font-weight')
      const bold = weightRaw === 'bold' || parseInt(weightRaw) >= 600
      blocks.push({
        id: uid(), type: 'text', x, y, w, h: 0, rotation: 0,
        props: {
          spans: [{ text, bold: bold || undefined }],
          size,
          color: firstStyled(inner, 'color') || '#333333',
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
