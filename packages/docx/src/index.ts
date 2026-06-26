import mammoth from 'mammoth'

export interface DocxResult {
  /** Engine-compatible HTML — pass through @komnour/core renderToBuffer / renderToPages */
  html: string
  /** Non-fatal conversion warnings from mammoth */
  warnings: string[]
}

// Word paragraph/character style → engine HTML tag.
// `:fresh` stops mammoth merging consecutive same-tag paragraphs.
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
  // List Paragraph style adds unwanted indentation via numering; keep as plain <p>
  "p[style-name='List Paragraph'] => p:fresh",
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
 *   const png = await renderToBuffer(html)         // renderToBuffer calls sanitize() internally
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
 *   - Underline, strikethrough (tags are stripped by the sanitizer)
 *   - Absolute positioning, text boxes
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
        // object — not in the public types but present at runtime since 1.0.
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

function postProcess(html: string): string {
  return html
    // A manual page break inside a paragraph comes out as <p><page-break></page-break></p>.
    // Hoist it to a standalone block element so the engine can detect it correctly.
    .replace(/<p[^>]*>\s*<page-break><\/page-break>\s*<\/p>/gi, '<page-break>')
    // Remove class attributes — the engine reads only style="…" attributes;
    // the @komnour/core sanitizer also strips classes, but removing them here
    // keeps the HTML smaller before it reaches the sanitizer.
    .replace(/\s+class="[^"]*"/g, '')
}
