import { sone, Font } from 'sone'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { htmlToSone } from './html-to-sone.ts'
import { sanitize } from './sanitize.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => join(__dirname, p)

const fontsDir = load('node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [
  `${fontsDir}/noto-sans-khmer-all-400-normal.woff`,
  `${fontsDir}/noto-sans-khmer-all-700-normal.woff`,
])
await Font.load('Inter', [
  load('node_modules/@fontsource/inter/files/inter-all-400-normal.woff'),
])

const input  = process.argv[2] ?? 'input.html'
const output = process.argv[3] ?? basename(input, '.html') + '.pdf'

const rawHtml = readFileSync(load(input), 'utf-8')

const { html: cleanHtml, warnings } = sanitize(rawHtml)
if (warnings.length) {
  console.warn(`[sanitize] ${warnings.length} warning(s):`)
  warnings.forEach(w => console.warn(`  • ${w}`))
}

const layout = htmlToSone(cleanHtml)
  .width(794)
  .padding(0)
  .bg('white')

const pdf = await sone(layout).pdf()

writeFileSync(load(output), pdf)
console.log(`${output} generated`)
