import { sone, Font, PageBreak, Column, Text } from 'sone'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

const fontsDir = join(import.meta.dirname, 'packages/core/node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])

// Test 1: simple PageBreak
const layout1 = Column(
  Text('Page 1 content').size(16),
  PageBreak(),
  Text('Page 2 content').size(16),
).width(794).bg('white')

const pages1 = await sone(layout1, { pageHeight: 1123 }).pages()
console.log('Test 1 (direct PageBreak) page count:', pages1.length)

// Test 2: simulating what our converter creates (nesting inside div)
const layout2 = Column(
  Column(
    Text('Page 1 paragraph').size(14),
    PageBreak(),
    Text('Page 2 paragraph').size(14),
  ).padding(40)
).width(794).bg('white')

const pages2 = await sone(layout2, { pageHeight: 1123 }).pages()
console.log('Test 2 (nested PageBreak) page count:', pages2.length)

// Test 3: using renderToBuffer from our package
import { renderToBuffer } from './packages/core/src/index.ts'
const buf = await renderToBuffer(
  '<div style="padding:40px"><p style="font-size:14px;">Page 1</p><page-break></page-break><p style="font-size:14px;">Page 2</p></div>',
  'pdf'
)
writeFileSync('test-pagebreak.pdf', buf)
console.log('Test 3 (full pipeline) PDF size:', buf.length, 'bytes')
