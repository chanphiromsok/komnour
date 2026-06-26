import { sone, Font, Row, Column, Text, calculateLayout, renderer as soneRenderer } from 'sone'
import { join } from 'node:path'

const fontsDir = join(import.meta.dirname, 'node_modules/@fontsource/noto-sans-khmer/files')
await Font.load('Noto Sans Khmer', [`${fontsDir}/noto-sans-khmer-all-400-normal.woff`])

const textStr = 'ខ្ញុំបានអាន និងយល់ព្រមចំពោះអត្រាការប្រាក់ 1.5% ក្នុងមួយខែ ដែលត្រូវបានយកទៅអនុវត្ត លើប្រាក់ដើមដែលនៅសល់ (I have read and agreed to the 1.5% monthly interest rate applied on the remaining principal balance).'

const row = Row(
  Column().width(16).height(16).bg('#1a1a2e').rounded(2),
  Column(Text(textStr).size(12).lineHeight(20)).flex(1)
).gap(10).alignItems('center')

const layout = Column(Column(row).padding(20)).width(794).bg('white')

const { layout: yogaLayout } = await calculateLayout(layout, soneRenderer)

function printLayout(node: any, depth = 0) {
  const indent = '  '.repeat(depth)
  const w = node.getComputedWidth()
  const h = node.getComputedHeight()
  const t = node.getComputedTop()
  const l = node.getComputedLeft()
  console.log(`${indent}[${depth}] w:${w} h:${h} top:${t} left:${l} childCount:${node.getChildCount()}`)
  for (let i = 0; i < node.getChildCount(); i++) {
    printLayout(node.getChild(i), depth + 1)
  }
}

printLayout(yogaLayout)
