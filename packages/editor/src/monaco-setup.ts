import type * as Monaco from 'monaco-editor'

// ── Supported CSS properties (mirrors sanitize.ts ALLOWED_CSS) ─────────────
const SUPPORTED_CSS: Array<{ prop: string; values?: string[] }> = [
  { prop: 'padding' }, { prop: 'padding-top' }, { prop: 'padding-right' },
  { prop: 'padding-bottom' }, { prop: 'padding-left' },
  { prop: 'margin' }, { prop: 'margin-top' }, { prop: 'margin-right' },
  { prop: 'margin-bottom' }, { prop: 'margin-left' },
  { prop: 'gap' }, { prop: 'width' }, { prop: 'height' },
  { prop: 'min-width' }, { prop: 'max-width' }, { prop: 'min-height' }, { prop: 'max-height' },
  { prop: 'flex' }, { prop: 'flex-grow' }, { prop: 'flex-shrink' },
  { prop: 'flex-direction', values: ['row', 'column', 'row-reverse', 'column-reverse'] },
  { prop: 'flex-wrap', values: ['nowrap', 'wrap', 'wrap-reverse'] },
  { prop: 'display', values: ['flex', 'none', 'contents'] },
  { prop: 'justify-content', values: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'] },
  { prop: 'align-items', values: ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'] },
  { prop: 'align-self', values: ['flex-start', 'flex-end', 'center', 'stretch', 'auto'] },
  { prop: 'position', values: ['static', 'relative', 'absolute'] },
  { prop: 'top' }, { prop: 'right' }, { prop: 'bottom' }, { prop: 'left' },
  { prop: 'background' }, { prop: 'background-color' },
  { prop: 'color' },
  { prop: 'font-size' },
  { prop: 'font-weight', values: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'] },
  { prop: 'font-family', values: ['Kh-Siemreap',"Wingdings2","KhmerOSsiemreap",'Khmer-OS-Muol-Light'] },
  { prop: 'font-style', values: ['normal', 'italic', 'oblique'] },
  { prop: 'line-height' },
  { prop: 'text-align', values: ['left', 'right', 'center', 'justify'] },
  { prop: 'letter-spacing' },
  { prop: 'border' }, { prop: 'border-top' }, { prop: 'border-right' },
  { prop: 'border-bottom' }, { prop: 'border-left' },
  { prop: 'border-radius' }, { prop: 'border-width' }, { prop: 'border-color' },
]

// ── Custom snippets for our HTML tags ──────────────────────────────────────
const HTML_SNIPPETS = [
  {
    label: 'page-break',
    insertText: '<page-break></page-break>',
    detail: 'Komnour — insert a PDF page break',
    doc: 'Inserts a sone PageBreak() node. Only effective in PDF output.',
  },
  {
    label: 'div.row',
    insertText: '<div style="flex-direction: row; align-items: center; gap: ${1:8}px;">\n  $0\n</div>',
    detail: 'Flex row container',
    doc: 'A horizontal flex container with centered items.',
    isSnippet: true,
  },
  {
    label: 'div.col',
    insertText: '<div style="flex-direction: column; gap: ${1:8}px;">\n  $0\n</div>',
    detail: 'Flex column container',
    isSnippet: true,
  },
  {
    label: 'p.body',
    insertText: '<p style="font-size: ${1:13}px; line-height: ${2:22}px; color: ${3:#1a1a2e};">$0</p>',
    detail: 'Body paragraph',
    isSnippet: true,
  },
  {
    label: 'h1.title',
    insertText: '<h1 style="font-size: ${1:24}px; font-weight: bold; color: ${2:#1a1a2e};">$0</h1>',
    detail: 'Page title',
    isSnippet: true,
  },
  {
    label: 'table.basic',
    insertText: [
      '<table style="width: 100%; border-collapse: collapse;">',
      '  <thead>',
      '    <tr>',
      '      <th style="padding: 8px; background: #f5f5f5; font-weight: bold;">$1</th>',
      '      <th style="padding: 8px; background: #f5f5f5; font-weight: bold;">$2</th>',
      '    </tr>',
      '  </thead>',
      '  <tbody>',
      '    <tr>',
      '      <td style="padding: 8px; border-bottom: 1px solid #eee;">$3</td>',
      '      <td style="padding: 8px; border-bottom: 1px solid #eee;">$4</td>',
      '    </tr>',
      '  </tbody>',
      '</table>',
    ].join('\n'),
    detail: 'Basic table structure',
    isSnippet: true,
  },
]

export function setupMonaco(monaco: typeof Monaco) {
  // ── Register "Komnour Dark" theme ────────────────────────────────────────
  monaco.editor.defineTheme('komnour-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'c9d1d9', background: '0d1117' },
      { token: 'comment', foreground: '6e7681', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: 'f2cc60' },
      { token: 'operator', foreground: 'ff7b72' },
      { token: 'type', foreground: 'ffa657' },
      // HTML tokens
      { token: 'tag', foreground: '7ee787' },
      { token: 'tag.id.html', foreground: '7ee787' },
      { token: 'tag.class.html', foreground: '7ee787' },
      { token: 'delimiter.html', foreground: '8b949e' },
      { token: 'metatag.html', foreground: 'ffa657' },
      { token: 'attribute.name.html', foreground: 'ffa657' },
      { token: 'attribute.value.html', foreground: 'a5d6ff' },
      { token: 'attribute.value.number.html', foreground: 'f2cc60' },
      { token: 'attribute.value.unit.html', foreground: 'd2a8ff' },
      { token: 'entity.html', foreground: 'd2a8ff' },
      // CSS (inline style values)
      { token: 'attribute.value.html.css', foreground: 'a5d6ff' },
      { token: 'number.css', foreground: 'f2cc60' },
      { token: 'unit.css', foreground: 'd2a8ff' },
      { token: 'string.css', foreground: 'a5d6ff' },
      { token: 'keyword.css', foreground: '7ee787' },
    ],
    colors: {
      // Editor core
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f7880',
      'editor.inactiveSelectionBackground': '#264f7840',
      'editor.selectionHighlightBackground': '#264f7840',
      'editorCursor.foreground': '#58a6ff',
      // Line numbers
      'editorLineNumber.foreground': '#3d444d',
      'editorLineNumber.activeForeground': '#7d8590',
      // Gutter
      'editorGutter.background': '#0d1117',
      // Indent guides
      'editorIndentGuide.background': '#21262d',
      'editorIndentGuide.activeBackground': '#3d444d',
      // Bracket matching
      'editorBracketMatch.background': '#264f7860',
      'editorBracketMatch.border': '#58a6ff',
      // Find
      'editor.findMatchBackground': '#f2cc6040',
      'editor.findMatchHighlightBackground': '#f2cc6020',
      // Scrollbar
      'scrollbarSlider.background': '#30363d60',
      'scrollbarSlider.hoverBackground': '#30363d90',
      'scrollbarSlider.activeBackground': '#30363dc0',
      // Minimap
      'minimap.background': '#0d1117',
      // Widget (autocomplete popup)
      'editorWidget.background': '#161b22',
      'editorWidget.border': '#30363d',
      'editorSuggestWidget.background': '#161b22',
      'editorSuggestWidget.border': '#30363d',
      'editorSuggestWidget.foreground': '#c9d1d9',
      'editorSuggestWidget.selectedBackground': '#264f78',
      'editorSuggestWidget.highlightForeground': '#58a6ff',
      // Hover widget
      'editorHoverWidget.background': '#161b22',
      'editorHoverWidget.border': '#30363d',
    },
  })

  // ── Custom completions: HTML tags + snippets ─────────────────────────────
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['<', ' ', ':'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const suggestions: Monaco.languages.CompletionItem[] = []

      // CSS property completions inside style="..."
      const inlineStyleMatch = linePrefix.match(/style="([^"]*);?\s*([\w-]*)$/)
      if (inlineStyleMatch) {
        const typedProp = inlineStyleMatch[2]
        for (const { prop, values } of SUPPORTED_CSS) {
          if (!typedProp || prop.startsWith(typedProp)) {
            suggestions.push({
              label: prop,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: values
                ? `${prop}: \${1|${values.join(',')}|}; `
                : `${prop}: $1; `,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: 'CSS property',
              documentation: values ? `Supported values: ${values.join(', ')}` : undefined,
              range,
              sortText: `0_${prop}`,
            })
          }
        }
        return { suggestions }
      }

      // CSS value completions after "prop: "
      const propValueMatch = linePrefix.match(/([\w-]+):\s*([\w-]*)$/)
      if (propValueMatch) {
        const prop = SUPPORTED_CSS.find(c => c.prop === propValueMatch[1])
        if (prop?.values) {
          for (const v of prop.values) {
            suggestions.push({
              label: v,
              kind: monaco.languages.CompletionItemKind.EnumMember,
              insertText: v,
              range,
              sortText: `0_${v}`,
            })
          }
          return { suggestions }
        }
      }

      // HTML tag / snippet completions
      for (const snippet of HTML_SNIPPETS) {
        suggestions.push({
          label: snippet.label,
          kind: snippet.isSnippet
            ? monaco.languages.CompletionItemKind.Snippet
            : monaco.languages.CompletionItemKind.Class,
          insertText: snippet.insertText,
          insertTextRules: snippet.isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: snippet.detail,
          documentation: (snippet as any).doc,
          range,
          sortText: `1_${snippet.label}`,
        })
      }

      return { suggestions }
    },
  })
}
