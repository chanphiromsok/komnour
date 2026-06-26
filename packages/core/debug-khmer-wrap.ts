import { sone, Font, Column, Text } from 'sone'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const fontsDir = join(import.meta.dirname, 'node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])

// Same text, constrained to 200px vs 728px  
const textStr = 'ខ្ញុំបានអាន និងយល់ព្រមចំពោះអត្រាការប្រាក់ 1.5%'

const layout = Column(
  Column(Text(textStr).size(12).lineHeight(20)).width(200).bg('#eef'),
  Column(Text(textStr).size(12).lineHeight(20)).width(400).bg('#efe'),
  Column(Text(textStr).size(12).lineHeight(20)).width(728).bg('#fee'),
).width(794).bg('white').padding(20)

const png = await sone(layout).png()
writeFileSync('debug-khmer-wrap.png', png)
console.log('done')
