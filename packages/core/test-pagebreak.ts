import { sone, Font, PageBreak, Column, Text } from 'sone'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { renderToBuffer } from './src/index.ts'

const fontsDir = join(import.meta.dirname, 'node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])

const layout1 = Column(
  Text('Page 1 content').size(16),
  PageBreak(),
  Text('Page 2 content').size(16),
).width(794).bg('white')

const pages1 = await sone(layout1, { pageHeight: 1123 }).pages()
console.log('Test 1 page count:', pages1.length)

const layout2 = Column(
  Column(
    Text('Page 1 paragraph').size(14),
    PageBreak(),
    Text('Page 2 paragraph').size(14),
  ).padding(40)
).width(794).bg('white')

const pages2 = await sone(layout2, { pageHeight: 1123 }).pages()
console.log('Test 2 page count:', pages2.length)

const buf = await renderToBuffer(
  '<div style="padding:40px"><p style="font-size:14px;">Page 1</p><page-break></page-break><p style="font-size:14px;">Page 2</p></div>',
  'pdf'
)
writeFileSync('test-output.pdf', buf)
console.log('Test 3 PDF size:', buf.length, 'bytes')
