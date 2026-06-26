import { htmlToSone } from './src/html-to-sone.ts'
import { sanitize } from './src/sanitize.ts'
const html = '<div style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" checked><p style="font-size:12px;line-height:20px;flex:1;">Long text: This sentence should wrap to multiple lines when it hits the column boundary.</p></div>'
const { html: clean } = sanitize(html)
const root = htmlToSone(clean)
const row = (root as any).children?.[0]
console.log('row type:', row?.type, 'props:', JSON.stringify(row?.props))
row?.children?.forEach((k: any, i: number) => {
  console.log(`child[${i}] type:${k?.type} props:`, JSON.stringify(k?.props))
  k?.children?.forEach((kk: any, j: number) => {
    console.log(`  inner[${j}] type:${kk?.type} props:`, JSON.stringify(kk?.props), 'children:', kk?.children?.length)
  })
})
