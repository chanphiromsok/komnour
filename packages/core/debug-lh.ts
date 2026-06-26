import { sone, Font, Column, Row, Text } from 'sone'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const fontsDir = join(import.meta.dirname, 'node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])

const khmer = 'ខ្ញុំបានអាន'
const layout = Column(
  Row(Text('NoLH: ' + khmer).size(12).bg('#fee'), Text('|').size(12).bg('#ccc')).alignItems('flex-start'),
  Row(Text('LH20: ' + khmer).size(12).lineHeight(20).bg('#efe'), Text('|').size(12).lineHeight(20).bg('#ccc')).alignItems('flex-start'),
  Row(Text('LH14: ' + khmer).size(12).lineHeight(14).bg('#eef'), Text('|').size(12).lineHeight(14).bg('#ccc')).alignItems('flex-start'),
  Text('English compare').size(12).lineHeight(20).bg('#fef'),
).width(794).bg('white').padding(20)

const png = await sone(layout).png()
writeFileSync('debug-lh.png', png)
console.log('done')
