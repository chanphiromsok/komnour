import { parse, HTMLElement, TextNode } from 'node-html-parser'
const html = `<div style="flex-direction: row; align-items: center; gap: 10px;">
    <input type="checkbox" checked>
    <p style="font-size: 12px; line-height: 20px; flex: 1;">
      ខ្ញុំបានអាន និងយល់ព្រមចំពោះអត្រាការប្រាក់ 1.5% ក្នុងមួយខែ ដែលត្រូវបានយកទៅអនុវត្ត
      លើប្រាក់ដើមដែលនៅសល់ (I have read and agreed to the 1.5% monthly interest rate applied on the remaining principal balance).
    </p>
  </div>`
const root = parse(html)
const div = root.childNodes[0] as HTMLElement
console.log('div childNodes count:', div.childNodes.length)
div.childNodes.forEach((c, i) => {
  if (c instanceof TextNode) {
    const trimmed = c.text.replace(/\n/g, '↵').replace(/\s+/g, ' ').substring(0, 40)
    console.log(i, 'TextNode:', JSON.stringify(trimmed))
  } else {
    console.log(i, 'Element:', (c as HTMLElement).tagName, 'children:', (c as HTMLElement).childNodes.length)
    if ((c as HTMLElement).tagName === 'P') {
      (c as HTMLElement).childNodes.forEach((cc, j) => {
        if (cc instanceof TextNode) {
          const trimmed = cc.text.replace(/\n/g, '↵').replace(/\s+/g, ' ')
          console.log(`  p.child[${j}]:`, JSON.stringify(trimmed.substring(0, 80)))
        }
      })
    }
  }
})
