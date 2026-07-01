import { Blob as HbBlob, Face, Font, Buffer as HbBuffer, shape } from 'harfbuzzjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONT_PATH = join(__dirname, '../../glyphs/fonts/KhmerOsSiemreab/KhmerOSsiemreap.ttf')
const OUT_DIR = join(__dirname, '../output')

const SAMPLES = [
  'កិច្ចសន្យាខ្ចីប្រាក់',
  'ចំនួនប្រាក់កម្ចី: $12,000.00',
  'អត្រាការប្រាក់: 1.5% / ខែ',
]

function shapeText(fontBytes: ArrayBuffer, text: string) {
  const blob = new HbBlob(fontBytes)
  const face = new Face(blob, 0)
  const font = new Font(face)
  font.setScale(face.upem, face.upem)

  const buf = new HbBuffer()
  buf.addText(text)
  buf.guessSegmentProperties()
  shape(font, buf)

  const infos = buf.getGlyphInfos()
  const positions = buf.getGlyphPositions()

  return { font, face, blob, upem: face.upem, infos, positions }
}

// HarfBuzz glyph paths are Y-up (font coordinate space).
// pdf-lib drawSvgPath uses SVG space (Y-down). Negate Y to convert.
function buildSvgPath(font: Font, glyphId: number, fontSize: number, upem: number): string {
  const scale = fontSize / upem
  const json = font.glyphToJson(glyphId)
  const cmds: string[] = []
  for (const cmd of json) {
    const v = cmd.values
    switch (cmd.type) {
      case 'M': cmds.push(`M ${(v[0]*scale).toFixed(3)} ${(-v[1]*scale).toFixed(3)}`); break
      case 'L': cmds.push(`L ${(v[0]*scale).toFixed(3)} ${(-v[1]*scale).toFixed(3)}`); break
      case 'Q': cmds.push(`Q ${(v[0]*scale).toFixed(3)} ${(-v[1]*scale).toFixed(3)} ${(v[2]*scale).toFixed(3)} ${(-v[3]*scale).toFixed(3)}`); break
      case 'C': cmds.push(`C ${(v[0]*scale).toFixed(3)} ${(-v[1]*scale).toFixed(3)} ${(v[2]*scale).toFixed(3)} ${(-v[3]*scale).toFixed(3)} ${(v[4]*scale).toFixed(3)} ${(-v[5]*scale).toFixed(3)}`); break
      case 'Z': cmds.push('Z'); break
    }
  }
  return cmds.join(' ')
}

async function main() {
  const fontBytes = readFileSync(FONT_PATH).buffer as ArrayBuffer
  console.log(`Font: ${FONT_PATH} (${fontBytes.byteLength} bytes)`)

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  // ── Log shaped glyph IDs ───────────────────────────────────────────────────
  console.log('\n── HarfBuzz shaped glyph IDs ──')
  for (const text of SAMPLES) {
    const { font, face, blob, upem, infos, positions } = shapeText(fontBytes, text)
    const codepoints = [...text].map(c => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'))
    console.log(`\nText:      ${text}`)
    console.log(`Unicode:   ${codepoints.join(' ')}`)
    console.log(`Glyphs:    ${infos.map(g => g.codepoint).join(' ')}`)
    console.log(`Advances:  ${positions.map(p => p.xAdvance).join(' ')}`)
  }

  // ── Build PDF ──────────────────────────────────────────────────────────────
  console.log('\n── Generating khmer.pdf ──')
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  await pdfDoc.embedFont(new Uint8Array(fontBytes))

  const page = pdfDoc.addPage([595, 842])
  const fontSize = 24
  let y = 780

  for (const text of SAMPLES) {
    const { font, face, blob, upem, infos, positions } = shapeText(fontBytes, text)
    const scale = fontSize / upem

    let x = 50
    for (let i = 0; i < infos.length; i++) {
      const gid = infos[i].codepoint
      const svgPath = buildSvgPath(font, gid, fontSize, upem)
      if (svgPath) {
        page.drawSvgPath(svgPath, {
          x: x + positions[i].xOffset * scale,
          y: y + positions[i].yOffset * scale,
          color: rgb(0, 0, 0),
        })
      }
      x += positions[i].xAdvance * scale
    }

    y -= fontSize * 2
  }

  const pdfBytes = await pdfDoc.save()
  const outPath = join(OUT_DIR, 'khmer.pdf')
  writeFileSync(outPath, pdfBytes)
  console.log(`Saved: ${outPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
