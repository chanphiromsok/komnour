import { sone, Font, Row, Column, Text } from 'sone'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const fontsDir = join(import.meta.dirname, 'node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])
await Font.load('Inter', [join(import.meta.dirname, 'node_modules/@fontsource/inter/files/inter-all-400-normal.woff')])

const layout = Column(
  Column(
    Row(
      Column().width(16).height(16).bg('#1a1a2e').borderWidth(1.5).borderColor('#1a1a2e').rounded(2),
      Column(
        Text('Long English: This is a long sentence that should wrap to multiple lines when it reaches the column boundary.').size(12).lineHeight(20)
      ).flex(1)
    ).gap(10).alignItems('center').margin(0,0,10,0),
    Row(
      Column().width(16).height(16).borderWidth(1.5).borderColor('#555').rounded(2),
      Column(
        Text('Khmer: ខ្ញុំបានអាន និងយល់ព្រមចំពោះអត្រាការប្រាក់ 1.5% ក្នុងមួយខែ (I have read and agreed to the 1.5% monthly rate).').size(12).lineHeight(20)
      ).flex(1)
    ).gap(10).alignItems('center')
  ).padding(20)
).width(794).bg('white')

const png = await sone(layout).png()
writeFileSync('debug-row-output.png', png)
console.log('done, check debug-row-output.png')
