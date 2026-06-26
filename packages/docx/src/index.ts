import mammoth from 'mammoth'
import { parse as parseHtml, HTMLElement as NHElement, Node } from 'node-html-parser'

export interface DocxResult {
  /** Engine-compatible HTML — pass through @komnour/core renderToBuffer / renderToPages */
  html: string
  /** Non-fatal conversion warnings from mammoth */
  warnings: string[]
}

// Word paragraph/character style → engine HTML tag.
// `:fresh` stops mammoth merging consecutive same-tag paragraphs.
//
// NOTE: Do NOT add "List Paragraph" here — it overrides mammoth's numbering
// detection and turns bullet/numbered lists into plain <p> elements.
const STYLE_MAP = [
  // Standard English heading names
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  // Lowercase variants used by some locales / third-party templates
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
  // Common title styles
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  // Manual page break → engine's custom block element
  "br[type='page'] => page-break",
].join('\n')

// 1 inch = 914400 EMU; at 96 DPI → 1 pixel = 9525 EMU
const EMU_PER_PX = 9525

/**
 * Convert a DOCX buffer to HTML compatible with the komnour layout engine.
 *
 * The returned HTML is ready to pass straight into @komnour/core:
 *   const { html } = await docxToHtml(buffer)
 *   const png = await renderToBuffer(html)         // sanitize() runs inside
 *   const pages = await renderToPages(html)
 *
 * What is preserved:
 *   - Document structure: headings (h1-h6), paragraphs, lists (ul/ol/li)
 *   - Inline formatting: bold (<strong>), italic (<em>)
 *   - Tables: <table>/<thead>/<tbody>/<tr>/<th>/<td>
 *   - Images: <img width height> — engine renders a sized grey placeholder
 *   - Page breaks → <page-break> (engine-specific element)
 *
 * What is not preserved (Word features with no engine equivalent):
 *   - Text alignment / indentation
 *   - Text / background colors and font sizes
 *   - Underline, strikethrough (<u>/<s> content is kept, tags stripped by sanitizer)
 *   - Hyperlinks (<a> content is kept, tag stripped by sanitizer)
 *   - Footnote/endnote anchors and superscripts
 */
export async function docxToHtml(input: Buffer | ArrayBuffer): Promise<DocxResult> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,

      // Emit <img width="W" height="H" src=""> without base64 data.
      // The engine renders <img> as a sized grey placeholder box; the src is
      // irrelevant and would balloon the HTML string if left as base64.
      convertImage: mammoth.images.imgElement(async (image) => {
        // mammoth stores EMU dimensions from <wp:extent> on its internal image
        // object — not in the public types but present at runtime since v1.0.
        const dims = (image as any).dimensions as { width?: number; height?: number } | undefined
        return {
          src: '',
          ...(dims?.width  && { width:  String(Math.round(dims.width  / EMU_PER_PX)) }),
          ...(dims?.height && { height: String(Math.round(dims.height / EMU_PER_PX)) }),
        }
      }),
    },
  )

  return {
    html: postProcess(result.value),
    warnings: result.messages.map(m => m.message),
  }
}

// ─── Post-processing ─────────────────────────────────────────────────────────
//
// Mammoth produces valid HTML but has patterns our engine doesn't handle well:
//
//  1. <li><p>text</p></li>  — mammoth wraps li content in <p> for items that
//     have paragraph properties (footnotes, formatted lists, etc.).  The engine's
//     li handler puts <p> in blockKids, so the bullet marker renders alone and
//     the text appears on the next line.  Fix: unwrap <p> from <li>.
//
//  2. <p><page-break></page-break></p>  — manual page breaks come out as inline
//     elements inside a paragraph.  The engine needs them at block level.
//
//  3. Empty <p> tags — Word documents often have trailing blank paragraphs.
//     Remove them to avoid spurious vertical whitespace in the output.
//
//  4. class="..." attributes — mammoth emits classes for unrecognised styles.
//     The engine reads only style="…"; the sanitizer strips classes too, but
//     removing them here keeps the HTML smaller.

function postProcess(html: string): string {
  const root = parseHtml(html)

  unwrapParagraphsInListItems(root)
  removeEmptyParagraphs(root)

  return root.toString()
    .replace(/<p[^>]*>\s*<page-break><\/page-break>\s*<\/p>/gi, '<page-break>')
    .replace(/\s+class="[^"]*"/g, '')
}

// Mammoth wraps <li> content in <p> when the Word paragraph has explicit
// paragraph formatting (line spacing, space-before/after, etc.).  The engine's
// li handler treats <p> as a block element, detaching the text from the marker.
//
// Strategy:
//  - Single <p> child  → replace <li><p>X</p></li> with <li>X</li>
//  - Multiple <p>s     → join their inner HTML with <br> so the engine keeps
//    them in the same inline text flow (a line break between paragraphs)
//  - Mixed <p> and block siblings (nested <ul>/<ol>/<table>) → unwrap the <p>
//    children and leave real block siblings in place
function unwrapParagraphsInListItems(root: ReturnType<typeof parseHtml>) {
  for (const li of root.querySelectorAll('li')) {
    // Collect direct element children
    const elementChildren = li.childNodes.filter(
      (c): c is NHElement => c instanceof NHElement,
    )

    const pChildren = elementChildren.filter(
      c => c.tagName?.toLowerCase() === 'p',
    )

    if (pChildren.length === 0) continue  // no <p> inside this <li> — nothing to do

    // Rebuild the li's inner HTML: replace each <p> with its inner content,
    // separating consecutive <p> blocks with <br>, leave other elements as-is.
    let newInner = ''
    let prevWasP = false

    for (const child of li.childNodes) {
      if (child instanceof NHElement && child.tagName?.toLowerCase() === 'p') {
        if (prevWasP) newInner += '<br>'   // paragraph separator
        newInner += child.innerHTML
        prevWasP = true
      } else {
        newInner += child.toString()
        prevWasP = false
      }
    }

    li.innerHTML = newInner
  }
}

// Remove <p> elements that carry no renderable content.
// Word documents routinely end with blank paragraphs; they create invisible
// whitespace in the rendered output.
function removeEmptyParagraphs(root: ReturnType<typeof parseHtml>) {
  for (const p of root.querySelectorAll('p')) {
    const hasVisibleChild = p.childNodes.some(c => {
      if (c instanceof NHElement) return true  // any element counts (img, br…)
      return c.text.trim() !== ''              // non-empty text node
    })
    if (!hasVisibleChild) p.remove()
  }
}
