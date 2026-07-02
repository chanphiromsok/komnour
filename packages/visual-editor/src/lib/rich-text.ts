import type { TextSpan } from '../types'

// contentEditable ⇄ TextSpan[] serialization for the inline editor.

interface Active {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  size?: number
  font?: string
}

export function spansToHtml(spans: TextSpan[]): string {
  if (!spans.length) return ''
  return spans.map(s => {
    const style: string[] = []
    if (s.bold) style.push('font-weight:bold')
    if (s.italic) style.push('font-style:italic')
    const deco = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean)
    if (deco.length) style.push(`text-decoration:${deco.join(' ')}`)
    if (s.color) style.push(`color:${s.color}`)
    if (s.size) style.push(`font-size:${s.size}px`)
    if (s.font) style.push(`font-family:'${s.font}'`)
    const text = escapeHtml(s.text) || '​'
    return style.length ? `<span style="${style.join(';')}">${text}</span>` : `<span>${text}</span>`
  }).join('')
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function htmlToSpans(root: HTMLElement): TextSpan[] {
  const spans: TextSpan[] = []
  walk(root, {}, spans)
  // Merge adjacent runs with identical styling
  const merged: TextSpan[] = []
  for (const s of spans) {
    if (!s.text) continue
    const prev = merged[merged.length - 1]
    if (prev && sameStyle(prev, s)) prev.text += s.text
    else merged.push({ ...s })
  }
  return merged.length ? merged : [{ text: '' }]
}

function walk(node: Node, inherited: Active, out: TextSpan[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/​/g, '')
      if (text) out.push(activeToSpan(inherited, text))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') { out.push(activeToSpan(inherited, '\n')); continue }
    const next: Active = { ...inherited }
    if (tag === 'b' || tag === 'strong') next.bold = true
    if (tag === 'i' || tag === 'em') next.italic = true
    if (tag === 'u') next.underline = true
    if (tag === 's' || tag === 'strike' || tag === 'del') next.strike = true
    const st = el.style
    const fw = st.fontWeight
    if (fw) next.bold = fw === 'bold' || parseInt(fw) >= 600   // explicit weight overrides inherited
    if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') next.italic = true
    if (st.fontStyle === 'normal') next.italic = false
    const deco = `${st.textDecoration} ${st.textDecorationLine}`
    if (deco.includes('underline')) next.underline = true
    if (deco.includes('line-through')) next.strike = true
    if (st.color) next.color = rgbToHex(st.color)
    const fs = parseFloat(st.fontSize)
    if (!isNaN(fs)) next.size = Math.round(fs)
    if (st.fontFamily) next.font = st.fontFamily.replace(/['"]/g, '').split(',')[0].trim()
    walk(el, next, out)
  }
}

function activeToSpan(a: Active, text: string): TextSpan {
  const s: TextSpan = { text }
  if (a.bold) s.bold = true
  if (a.italic) s.italic = true
  if (a.underline) s.underline = true
  if (a.strike) s.strike = true
  if (a.color) s.color = a.color
  if (a.size) s.size = a.size
  if (a.font) s.font = a.font
  return s
}

function sameStyle(a: TextSpan, b: TextSpan): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline && !!a.strike === !!b.strike &&
    a.color === b.color && a.size === b.size && a.font === b.font
}

function rgbToHex(c: string): string {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return c
  const hex = (n: string) => (+n).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}
