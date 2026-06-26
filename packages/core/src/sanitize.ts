import { parse, HTMLElement, TextNode, Node } from 'node-html-parser'

// Tags removed entirely — content also removed
const STRIP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet',
  'form', 'button', 'select', 'textarea', 'noscript', 'template',
  'meta', 'link', 'head', 'svg', 'canvas', 'video', 'audio',
])
// html / body / unknown tags are UNWRAPPED — children are preserved

// Tags our converter handles — kept as-is (after attribute filtering)
const ALLOWED_TAGS = new Set([
  'div', 'section', 'article', 'header', 'footer',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'span', 'strong', 'b', 'em', 'i',
  'ul', 'ol', 'li', 'label',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'hr', 'br',
  'input',        // type=checkbox only
  'img',          // Photo()
  'page-break',   // sone PageBreak()
])

// Unknown tags are UNWRAPPED — their children are preserved inline

// CSS properties our converter reads (kebab-case)
const ALLOWED_CSS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin',  'margin-top',  'margin-right',  'margin-bottom',  'margin-left',
  'gap', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'flex', 'flex-direction', 'flex-wrap', 'flex-shrink', 'flex-grow',
  'display', 'justify-content', 'align-items', 'align-self',
  'position', 'top', 'right', 'bottom', 'left',
  'background', 'background-color',
  'color', 'font-size', 'font-weight', 'font-family', 'font-style',
  'line-height', 'text-align', 'letter-spacing',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'border-width', 'border-color',
])

// Attributes allowed per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*':     new Set(['style']),
  'input': new Set(['type', 'checked', 'style']),
  'img':   new Set(['src', 'width', 'height', 'alt', 'style']),
  'th':    new Set(['colspan', 'rowspan', 'style']),
  'td':    new Set(['colspan', 'rowspan', 'style']),
}

export interface SanitizeResult {
  html: string
  warnings: string[]
}

function filterStyle(raw: string, warnings: string[]): string {
  const kept: string[] = []
  for (const decl of raw.split(';')) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon === -1) continue
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    if (ALLOWED_CSS.has(prop)) {
      kept.push(trimmed)
    } else {
      warnings.push(`CSS property "${prop}" is not supported and was removed`)
    }
  }
  return kept.join('; ')
}

function processNode(node: Node, warnings: string[]): string {
  if (node instanceof TextNode) {
    // escape minimal HTML entities to avoid re-parse issues
    return node.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  if (!(node instanceof HTMLElement)) return ''

  const tag = node.tagName?.toLowerCase() ?? ''

  // completely remove dangerous tags
  if (STRIP_TAGS.has(tag)) {
    warnings.push(`<${tag}> was removed`)
    return ''
  }

  // recurse children first
  const inner = node.childNodes.map(c => processNode(c, warnings)).join('')

  // unknown tags — unwrap, keep children
  if (tag && !ALLOWED_TAGS.has(tag)) {
    warnings.push(`<${tag}> is not supported — content preserved, tag removed`)
    return inner
  }

  // input: only allow checkbox
  if (tag === 'input') {
    const type = node.getAttribute('type')?.toLowerCase()
    if (type !== 'checkbox') {
      warnings.push(`<input type="${type ?? ''}"> is not supported — removed`)
      return ''
    }
  }

  // build allowed attribute string
  const globalAttrs = ALLOWED_ATTRS['*'] ?? new Set()
  const tagAttrs    = ALLOWED_ATTRS[tag] ?? new Set()
  const attrParts: string[] = []

  for (const [attr, val] of Object.entries(node.attributes)) {
    const attrLower = attr.toLowerCase()
    if (attrLower === 'style') {
      const filtered = filterStyle(val, warnings)
      if (filtered) attrParts.push(`style="${filtered}"`)
    } else if (globalAttrs.has(attrLower) || tagAttrs.has(attrLower)) {
      attrParts.push(`${attrLower}="${val.replace(/"/g, '&quot;')}"`)
    } else {
      warnings.push(`Attribute "${attr}" on <${tag}> is not supported and was removed`)
    }
  }

  const attrStr = attrParts.length ? ' ' + attrParts.join(' ') : ''

  // void elements
  if (tag === 'hr' || tag === 'br' || tag === 'input' || tag === 'img') {
    return `<${tag}${attrStr}>`
  }

  return `<${tag}${attrStr}>${inner}</${tag}>`
}

export function sanitize(html: string): SanitizeResult {
  const warnings: string[] = []
  const root = parse(html)
  const output = root.childNodes.map(n => processNode(n, warnings)).join('')
  return { html: output, warnings }
}
