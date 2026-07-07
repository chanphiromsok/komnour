// Convert any CSS color string → #rrggbb for <input type="color">
export function toHexColor(color: string): string {
  if (!color || color === 'transparent') return '#000000'
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000' // reset
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
}

// "24px" → 24, "1.5em" → 1.5
export function parseNumeric(val: string): number {
  return parseFloat(val) || 0
}

// "24px" → "px", "1.5em" → "em", "bold" → ""
export function parseUnit(val: string): string {
  return val?.replace(/[\d.\s-]+/, '') || 'px'
}

// Expand padding/margin shorthand to 4 sides (returns px strings)
export function expand4(val: string): [string, string, string, string] {
  if (!val) return ['0px', '0px', '0px', '0px']
  const parts = val.trim().split(/\s+/)
  switch (parts.length) {
    case 1: return [parts[0], parts[0], parts[0], parts[0]]
    case 2: return [parts[0], parts[1], parts[0], parts[1]]
    case 3: return [parts[0], parts[1], parts[2], parts[1]]
    default: return [parts[0], parts[1], parts[2], parts[3]]
  }
}

// Get effective side value from StyleMap, checking shorthand first
export function getSide(
  styles: Record<string, string>,
  shorthand: string,
  side: 'top' | 'right' | 'bottom' | 'left'
): string {
  const longhand = `${shorthand}-${side}`
  if (styles[longhand]) return styles[longhand]
  if (styles[shorthand]) return expand4(styles[shorthand])[['top','right','bottom','left'].indexOf(side)]
  return '0px'
}

// camelCase CSS → kebab-case: "fontSize" → "font-size"
export function toKebab(camel: string): string {
  return camel.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
}

// Parse inline style tag attribute → Record<kebab, value>
export function parseStyleAttr(styleStr: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of styleStr.split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const k = decl.slice(0, colon).trim()
    const v = decl.slice(colon + 1).trim()
    if (k && v) out[k] = v
  }
  return out
}
