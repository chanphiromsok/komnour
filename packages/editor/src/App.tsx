import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Column, Row, Text, Span, PageBreak, Path, Photo, renderPages } from 'sone'
import { htmlToSoneSyntax } from '@komnour/html-to-syntax'
import { setupMonaco } from './monaco-setup'
import { browserRenderer } from './sone-renderer'

// Font files served via Vite asset pipeline
import notoKhmer400 from '@fontsource/noto-sans-khmer/files/noto-sans-khmer-all-400-normal.woff?url'
import notoKhmer700 from '@fontsource/noto-sans-khmer/files/noto-sans-khmer-all-700-normal.woff?url'
import inter400 from '@fontsource/inter/files/inter-all-400-normal.woff?url'

const SERVER = 'http://localhost:3001'
const LS_KEY = 'komnour:html'

const TEMPLATES: { label: string; html: string }[] = [
  {
    label: 'Loan Agreement',
    html: `<div style="padding: 48px; font-family: 'Noto Sans Khmer';">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 22px; font-weight: bold; color: #1a1a2e;">
      កិច្ចសន្យាខ្ចីប្រាក់
    </div>
    <div style="font-size: 13px; color: #555; margin-top: 4px;">LOAN AGREEMENT CONTRACT</div>
  </div>
  <p style="font-size: 13px; line-height: 22px; margin-bottom: 16px; color: #333;">
    ចំនួនប្រាក់កម្ចី: <strong>$12,000.00</strong> — អត្រាការប្រាក់: <span style="color: #c0392b;">1.5% / ខែ</span>
  </p>
  <ul style="margin-bottom: 24px; padding-left: 20px;">
    <li style="font-size: 13px; line-height: 22px; margin-bottom: 6px;">ត្រូវមានអត្តសញ្ញាណប័ណ្ណ</li>
    <li style="font-size: 13px; line-height: 22px; margin-bottom: 6px;">ត្រូវមានទ្រព្យជំហររ</li>
    <li style="font-size: 13px; line-height: 22px; color: #c0392b;">ការទូទាត់មុនថ្ងៃទី 1</li>
  </ul>
  <page-break></page-break>
  <p style="font-size: 13px; line-height: 22px; color: #333;">Page 2 content after break.</p>
</div>`,
  },
  {
    label: 'Invoice',
    html: `<div style="padding: 48px; font-family: 'Inter', sans-serif;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
    <div>
      <div style="font-size: 24px; font-weight: bold; color: #0d1117;">INVOICE</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">#INV-2024-001</div>
    </div>
    <div style="text-align: right; font-size: 12px; color: #444;">
      <div>Issued: Jan 1, 2024</div>
      <div>Due: Jan 31, 2024</div>
    </div>
  </div>
  <div style="display: flex; justify-content: space-between; margin-bottom: 32px; font-size: 13px;">
    <div>
      <div style="font-weight: bold; margin-bottom: 4px;">From</div>
      <div>Acme Corp</div>
      <div style="color: #666;">123 Main St, City</div>
    </div>
    <div style="text-align: right;">
      <div style="font-weight: bold; margin-bottom: 4px;">Bill To</div>
      <div>Client Name</div>
      <div style="color: #666;">456 Other Ave, Town</div>
    </div>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
    <tr style="background: #f6f8fa; font-weight: bold;">
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8;">Description</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">Qty</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">Unit Price</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">Total</td>
    </tr>
    <tr>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8;">Design Services</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">10</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">$50.00</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">$500.00</td>
    </tr>
    <tr>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8;">Development</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">20</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">$80.00</td>
      <td style="padding: 10px 12px; border: 1px solid #e1e4e8; text-align: right;">$1,600.00</td>
    </tr>
  </table>
  <div style="text-align: right; font-size: 14px; font-weight: bold; color: #0d1117;">
    Total: $2,100.00
  </div>
</div>`,
  },
  {
    label: 'Report',
    html: `<div style="padding: 48px; font-family: 'Inter', sans-serif; color: #24292f;">
  <h1 style="font-size: 28px; font-weight: bold; margin-bottom: 8px; color: #0d1117;">Monthly Report</h1>
  <div style="font-size: 12px; color: #57606a; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #e1e4e8;">
    January 2024 · Prepared by Finance Team
  </div>
  <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0d1117;">Executive Summary</h2>
  <p style="font-size: 13px; line-height: 22px; margin-bottom: 24px; color: #444;">
    This month saw a <strong>12% increase</strong> in revenue compared to the previous period,
    driven primarily by new client acquisitions and expansion of existing accounts.
  </p>
  <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0d1117;">Key Metrics</h2>
  <ul style="font-size: 13px; line-height: 24px; margin-bottom: 24px; padding-left: 20px;">
    <li>Revenue: <strong>$84,500</strong> (+12%)</li>
    <li>New Clients: <strong>8</strong></li>
    <li>Retention Rate: <strong>94%</strong></li>
    <li>Avg. Deal Size: <strong>$10,562</strong></li>
  </ul>
  <page-break></page-break>
  <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0d1117;">Appendix</h2>
  <p style="font-size: 13px; line-height: 22px; color: #444;">Detailed breakdown available on request.</p>
</div>`,
  },
]

const DEFAULT_HTML = TEMPLATES[0].html

type Status = 'idle' | 'loading' | 'error'

const css = String.raw

const GLOBAL_STYLE = css`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Inter', system-ui, sans-serif; background: #0d1117; color: #c9d1d9; height: 100vh; overflow: hidden; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #484f58; }
  select, button { font-family: inherit; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
`

// ── Block drag-and-drop outline ────────────────────────────────────────────
type Block = { html: string; tagName: string; label: string }
type ParsedHTML = { openTag: string; closeTag: string; blocks: Block[] }

function parseHTMLBlocks(rawHtml: string): ParsedHTML | null {
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
    const root = doc.body.firstElementChild
    if (!root) return null
    const shell = (root.cloneNode(false) as Element).outerHTML
    const openTag = shell.slice(0, shell.indexOf('>') + 1)
    const closeTag = `</${root.tagName.toLowerCase()}>`
    const blocks: Block[] = Array.from(root.children).map(el => ({
      html: el.outerHTML,
      tagName: el.tagName.toLowerCase(),
      label: el.tagName.toLowerCase() === 'page-break'
        ? '─── Page Break ───'
        : (el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 72) || `<${el.tagName.toLowerCase()}>`),
    }))
    return { openTag, closeTag, blocks }
  } catch { return null }
}

function serializeHTMLBlocks({ openTag, closeTag }: ParsedHTML, blocks: Block[]): string {
  return [openTag, ...blocks.map(b => '  ' + b.html), closeTag].join('\n')
}

function parseInlineStyle(openTag: string): React.CSSProperties {
  const m = openTag.match(/style="([^"]*)"/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const decl of m[1].split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const prop = decl.slice(0, colon).trim()
    const val = decl.slice(colon + 1).trim()
    if (prop && val) out[prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] = val
  }
  return out as React.CSSProperties
}

// ── Interactive design canvas: drag blocks on the live DOM preview ──────────
function DesignCanvas({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const parsed = useMemo(() => parseHTMLBlocks(html), [html])
  const rootStyle = useMemo(() => parsed ? parseInlineStyle(parsed.openTag) : {}, [parsed])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (!parsed) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#484f58', fontSize: 12 }}>
      Wrap content in a root &lt;div&gt; to enable design mode.
    </div>
  )

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const next = [...parsed.blocks]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(serializeHTMLBlocks(parsed, next))
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div style={{ position: 'relative', marginLeft: 32 }}>
      <div style={{
        width: 794,
        background: 'white',
        boxSizing: 'border-box',
        boxShadow: '0 0 0 1px #21262d, 0 12px 48px rgba(0,0,0,0.7)',
        borderRadius: 2,
        ...rootStyle,
      }}>
        {parsed.blocks.map((block, i) => (
          <div
            key={i}
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i) }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(i) }}
            onDragLeave={e => {
              // only clear if leaving to a non-child element
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverIdx(null)
            }}
            onDrop={() => handleDrop(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              position: 'relative',
              opacity: dragIdx === i ? 0.25 : 1,
              transition: 'opacity 0.1s',
              outline: overIdx === i && dragIdx !== i ? '2px solid #58a6ff' : hoverIdx === i ? '1px dashed #30363d' : 'none',
              outlineOffset: 2,
              cursor: 'default',
            }}
          >
            {/* Blue insertion line at top when dragging over */}
            {overIdx === i && dragIdx !== i && (
              <div style={{
                position: 'absolute', top: -2, left: -8, right: -8, height: 2,
                background: '#58a6ff', borderRadius: 1, zIndex: 20, pointerEvents: 'none',
              }} />
            )}

            {/* Drag handle in the left gutter — appears on hover */}
            {(hoverIdx === i || dragIdx === i) && (
              <div
                title="Drag to reorder"
                style={{
                  position: 'absolute', left: -28, top: '50%', transform: 'translateY(-50%)',
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'grab', color: '#484f58', userSelect: 'none',
                  background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
                }}
              >
                <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                  <circle cx="2" cy="2" r="1.5"/><circle cx="6" cy="2" r="1.5"/>
                  <circle cx="2" cy="7" r="1.5"/><circle cx="6" cy="7" r="1.5"/>
                  <circle cx="2" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/>
                </svg>
              </div>
            )}

            <div dangerouslySetInnerHTML={{ __html: block.html }} />
          </div>
        ))}
      </div>
    </div>
  )
}

const BLOCK_ICONS: Record<string, string> = {
  p: 'P', h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4',
  div: '▭', ul: '≡', ol: '≡', table: '⊞', 'page-break': '╌', img: '▨',
}

function BlockOutline({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const parsed = useMemo(() => parseHTMLBlocks(html), [html])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  if (!parsed) return (
    <div style={{ padding: 24, color: '#484f58', fontSize: 12, textAlign: 'center', lineHeight: '20px' }}>
      Wrap content in a root &lt;div&gt; to enable block editing.
    </div>
  )
  if (!parsed.blocks.length) return (
    <div style={{ padding: 24, color: '#484f58', fontSize: 12, textAlign: 'center' }}>No blocks found</div>
  )

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    const next = [...parsed.blocks]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(toIdx, 0, moved)
    onChange(serializeHTMLBlocks(parsed, next))
    setDragIdx(null)
    setOverIdx(null)
  }

  const onDragStart = (e: DragEvent, i: number) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragIdx(i)
  }
  const onDragOver = (e: DragEvent, i: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIdx(i)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '10px 8px' }}>
      <div style={{ fontSize: 10, color: '#3d444d', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 8px 8px' }}>
        {parsed.blocks.length} blocks · drag to reorder
      </div>
      {parsed.blocks.map((block, i) => (
        <div
          key={i}
          draggable
          onDragStart={e => onDragStart(e, i)}
          onDragOver={e => onDragOver(e, i)}
          onDragLeave={() => setOverIdx(null)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '7px 10px', marginBottom: 4,
            background: dragIdx === i ? '#161b22' : '#0d1117',
            border: '1px solid',
            borderColor: overIdx === i && dragIdx !== i ? '#58a6ff' : dragIdx === i ? '#30363d' : '#21262d',
            borderRadius: 6, cursor: 'grab',
            opacity: dragIdx === i ? 0.35 : 1,
            transition: 'border-color 0.1s, opacity 0.12s',
            userSelect: 'none',
          }}
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="#30363d" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="2" cy="2" r="1.5"/><circle cx="6" cy="2" r="1.5"/>
            <circle cx="2" cy="7" r="1.5"/><circle cx="6" cy="7" r="1.5"/>
            <circle cx="2" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/>
          </svg>
          <div style={{
            flexShrink: 0, padding: '0 5px', minWidth: 24, height: 18,
            background: '#161b22', border: '1px solid #30363d', borderRadius: 3,
            fontSize: 9, fontWeight: 700, color: block.tagName === 'page-break' ? '#484f58' : '#7d8590',
            fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {BLOCK_ICONS[block.tagName] || block.tagName.slice(0, 3).toUpperCase()}
          </div>
          <div style={{
            flex: 1, minWidth: 0, fontSize: 12, lineHeight: '18px',
            color: block.tagName === 'page-break' ? '#3d444d' : '#7d8590',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontStyle: block.tagName === 'page-break' ? 'italic' : 'normal',
          }}>
            {block.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Figma-like zoom/pan canvas ─────────────────────────────────────────────
function ZoomPane({ children, loading, onZoomChange }: { children: React.ReactNode; loading: boolean; onZoomChange?: (z: number) => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [cursor, setCursor] = useState('default')
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanning = useRef(false)
  const spaceDown = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 40, y: 40 })

  const applyZoom = useCallback((newZoom: number, newPan: { x: number; y: number }) => {
    zoomRef.current = newZoom
    panRef.current = newPan
    setZoom(newZoom)
    setPan(newPan)
    onZoomChange?.(newZoom)
  }, [onZoomChange])

  const resetView = useCallback(() => applyZoom(1, { x: 40, y: 40 }), [applyZoom])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const z = zoomRef.current
      const p = panRef.current
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.pow(0.998, e.deltaY)
        const nz = Math.min(8, Math.max(0.05, z * factor))
        applyZoom(nz, {
          x: mx - (mx - p.x) * (nz / z),
          y: my - (my - p.y) * (nz / z),
        })
      } else {
        const np = { x: p.x - e.deltaX, y: p.y - e.deltaY }
        panRef.current = np
        setPan(np)
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [applyZoom])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if ((e.target as HTMLElement)?.closest?.('.monaco-editor')) return
      e.preventDefault()
      spaceDown.current = true
      setCursor('grab')
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceDown.current = false
      if (!isPanning.current) setCursor('default')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault()
      isPanning.current = true
      panStart.current = { mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y }
      setCursor('grabbing')
    }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isPanning.current) return
    const np = {
      x: panStart.current.px + (e.clientX - panStart.current.mx),
      y: panStart.current.py + (e.clientY - panStart.current.my),
    }
    panRef.current = np
    setPan(np)
  }
  const onMouseUp = () => {
    if (!isPanning.current) return
    isPanning.current = false
    setCursor(spaceDown.current ? 'grab' : 'default')
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', cursor }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        willChange: 'transform',
        opacity: loading ? 0.45 : 1,
        transition: 'opacity 0.18s ease',
      }}>
        {children}
      </div>

      <div style={{
        position: 'absolute', bottom: 14, right: 14,
        display: 'flex', alignItems: 'center', gap: 1,
        background: '#161b22', border: '1px solid #30363d',
        borderRadius: 7, overflow: 'hidden',
        fontSize: 11, color: '#7d8590',
        userSelect: 'none', zIndex: 10,
      }}>
        <button
          onClick={() => applyZoom(Math.max(0.05, zoomRef.current / 1.25), panRef.current)}
          style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', padding: '5px 10px', fontSize: 15, lineHeight: 1 }}
        >−</button>
        <span
          onClick={resetView}
          title="Reset zoom (100%)"
          style={{ padding: '5px 6px', minWidth: 42, textAlign: 'center', cursor: 'pointer', borderLeft: '1px solid #21262d', borderRight: '1px solid #21262d' }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => applyZoom(Math.min(8, zoomRef.current * 1.25), panRef.current)}
          style={{ background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', padding: '5px 10px', fontSize: 15, lineHeight: 1 }}
        >+</button>
      </div>

      <div style={{
        position: 'absolute', bottom: 14, left: 14,
        fontSize: 10, color: '#30363d', userSelect: 'none', pointerEvents: 'none',
      }}>
        Ctrl+scroll to zoom · Space+drag to pan
      </div>
    </div>
  )
}

function injectStyle(css: string) {
  if (typeof document === 'undefined') return
  const id = 'komnour-global'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = css
  document.head.appendChild(el)
}

export default function App() {
  injectStyle(GLOBAL_STYLE)

  const [html, setHtml] = useState(() => localStorage.getItem(LS_KEY) ?? DEFAULT_HTML)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [pages, setPages] = useState<string[]>([])     // canvas data URLs, one per page
  const [fontsReady, setFontsReady] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('komnour:server') ?? SERVER)
  const [showServerConfig, setShowServerConfig] = useState(false)
  const [serverUrlDraft, setServerUrlDraft] = useState(serverUrl)
  const [routing, setRouting] = useState(false)

  // Load fonts on mount, then trigger first render
  useEffect(() => {
    Promise.all([
      browserRenderer.registerFont('Noto Sans Khmer', [notoKhmer400, notoKhmer700]),
      browserRenderer.registerFont('Inter', [inter400]),
    ]).then(() => setFontsReady(true)).catch(console.error)
  }, [])

  // Local render: HTML → sone syntax → eval with real builders → renderPages → data URLs
  const renderLocal = useCallback(async (source: string) => {
    setStatus('loading')
    setError('')
    try {
      const syntax = htmlToSoneSyntax(source)
      // eslint-disable-next-line no-new-func
      const layout = new Function(
        'Column', 'Row', 'Text', 'Span', 'PageBreak', 'Path', 'Photo',
        `"use strict"; return (${syntax})`
      )(Column, Row, Text, Span, PageBreak, Path, Photo)

      const canvases = await renderPages(layout, browserRenderer, { pageHeight: 1123 })
      setPages(canvases.map(c => c.toDataURL('image/png')))
      setStatus('idle')
    } catch (e: any) {
      setError(e.message)
      setStatus('error')
    }
  }, [])

  // Debounce render on html change (waits for fonts first)
  useEffect(() => {
    if (!fontsReady) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => renderLocal(html), 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [html, fontsReady, renderLocal])

  useEffect(() => { localStorage.setItem(LS_KEY, html) }, [html])

  const [leftView, setLeftView] = useState<'code' | 'blocks'>('code')
  const [view, setView] = useState<'preview' | 'design' | 'syntax'>('preview')
  const syntax = useMemo(() => htmlToSoneSyntax(html, { preamble: true }), [html])
  const [copied, setCopied] = useState(false)
  const copySyntax = () => {
    navigator.clipboard.writeText(syntax)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null)

  const exportFile = async (fmt: 'pdf' | 'png') => {
    setExporting(fmt)
    try {
      const res = await fetch(`${serverUrl}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, format: fmt }),
      })
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `document.${fmt}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    } finally {
      setExporting(null)
    }
  }

  const routeToServer = async () => {
    setRouting(true)
    try {
      await fetch(`${serverUrl}/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      })
    } finally {
      setRouting(false)
    }
  }

  const saveServerUrl = () => {
    const url = serverUrlDraft.trim().replace(/\/$/, '')
    setServerUrl(url)
    localStorage.setItem('komnour:server', url)
    setShowServerConfig(false)
  }

  const handleMonacoMount = (_: unknown, monaco: Monaco) => {
    setupMonaco(monaco)
    monaco.editor.setTheme('komnour-dark')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#0d1117' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 44,
        background: '#010409',
        borderBottom: '1px solid #21262d',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <polygon points="9,1 17,5 17,13 9,17 1,13 1,5" fill="none" stroke="#58a6ff" strokeWidth="1.5" />
            <polygon points="9,4 14,7 14,11 9,14 4,11 4,7" fill="#58a6ff" opacity="0.2" />
            <circle cx="9" cy="9" r="2" fill="#58a6ff" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 13, color: '#e6edf3', letterSpacing: '0.02em' }}>
            Komnour
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: '#21262d', margin: '0 4px' }} />

        {/* Template selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ color: '#484f58', flexShrink: 0 }}>
            <rect x="0.5" y="0.5" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
            <rect x="6.5" y="0.5" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
            <rect x="0.5" y="6.5" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
            <rect x="6.5" y="6.5" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
          </svg>
          <select
            value=""
            onChange={e => { if (e.target.value) setHtml(e.target.value); e.target.value = '' }}
            style={{
              background: 'transparent', color: '#7d8590',
              border: 'none', fontSize: 12, cursor: 'pointer',
              outline: 'none', padding: '2px 0',
            }}
          >
            <option value="" disabled>Templates</option>
            {TEMPLATES.map(t => (
              <option key={t.label} value={t.html}>{t.label}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90, justifyContent: 'flex-end' }}>
          {status === 'loading' && (
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
              <circle cx="6" cy="6" r="4.5" stroke="#30363d" strokeWidth="1.5" fill="none" />
              <path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" stroke="#58a6ff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          )}
          {status === 'error' && <span style={{ fontSize: 10 }}>⛔</span>}
          {status === 'idle' && !fontsReady && <span style={{ fontSize: 10, color: '#7d8590' }}>●</span>}
          {status === 'idle' && fontsReady && <span style={{ fontSize: 10, color: '#3db87a' }}>●</span>}
          <span style={{
            fontSize: 11, color: status === 'error' ? '#f85149' : status === 'loading' ? '#7d8590' : fontsReady ? '#3db87a' : '#7d8590',
          }}>
            {!fontsReady ? 'loading fonts…' : status === 'loading' ? 'rendering…' : status === 'error' ? error.slice(0, 40) : 'ready'}
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: '#21262d', margin: '0 4px' }} />

        {/* Export + Route buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => exportFile('png')}
            disabled={exporting !== null}
            title="Export PNG (requires server)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', color: '#7d8590',
              border: '1px solid #30363d',
              borderRadius: 6, padding: '5px 12px',
              fontSize: 12, fontWeight: 500, cursor: exporting ? 'wait' : 'pointer',
              transition: 'all 0.12s', opacity: exporting === 'pdf' ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.color = '#e6edf3' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#7d8590' }}
          >
            {exporting === 'png'
              ? <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}><circle cx="6" cy="6" r="4.5" stroke="#30363d" strokeWidth="1.5" fill="none" /><path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" stroke="#7d8590" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            }
            PNG
          </button>
          <button
            onClick={() => exportFile('pdf')}
            disabled={exporting !== null}
            title="Export PDF (requires server)"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#1f6feb', color: '#ffffff',
              border: '1px solid #388bfd40',
              borderRadius: 6, padding: '5px 12px',
              fontSize: 12, fontWeight: 500, cursor: exporting ? 'wait' : 'pointer',
              transition: 'background 0.12s', opacity: exporting === 'png' ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = '#388bfd' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1f6feb' }}
          >
            {exporting === 'pdf'
              ? <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}><circle cx="6" cy="6" r="4.5" stroke="#1f6feb" strokeWidth="1.5" fill="none" /><path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 6l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            }
            PDF
          </button>

          <div style={{ width: 1, height: 20, background: '#21262d', alignSelf: 'center' }} />

          {/* Route to server — placeholder */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={routeToServer}
              disabled={routing}
              title={`Send to ${serverUrl}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', color: '#7d8590',
                border: '1px solid #30363d',
                borderRadius: 6, padding: '5px 12px',
                fontSize: 12, fontWeight: 500, cursor: routing ? 'wait' : 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { if (!routing) { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#484f58' } }}
              onMouseLeave={e => { e.currentTarget.style.color = '#7d8590'; e.currentTarget.style.borderColor = '#30363d' }}
            >
              {routing
                ? <svg width="12" height="12" viewBox="0 0 12 12" style={{ animation: 'spin 1s linear infinite' }}><circle cx="6" cy="6" r="4.5" stroke="#30363d" strokeWidth="1.5" fill="none" /><path d="M6 1.5 A4.5 4.5 0 0 1 10.5 6" stroke="#7d8590" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              }
              Route
            </button>
          </div>

          {/* Server config button */}
          <button
            onClick={() => { setServerUrlDraft(serverUrl); setShowServerConfig(v => !v) }}
            title="Configure server URL"
            style={{
              display: 'flex', alignItems: 'center',
              background: 'transparent', color: showServerConfig ? '#58a6ff' : '#484f58',
              border: '1px solid ' + (showServerConfig ? '#388bfd40' : '#30363d'),
              borderRadius: 6, padding: '5px 8px',
              fontSize: 12, cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3' }}
            onMouseLeave={e => { e.currentTarget.style.color = showServerConfig ? '#58a6ff' : '#484f58' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.5 2.5l.7.7M8.8 8.8l.7.7M9.5 2.5l-.7.7M3.2 8.8l-.7.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Server config popover ─────────────────────────────────────────── */}
      {showServerConfig && (
        <div style={{
          position: 'fixed', top: 52, right: 16, zIndex: 100,
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: 8, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 280,
          animation: 'fadein 0.1s ease',
        }}>
          <div style={{ fontSize: 11, color: '#7d8590', marginBottom: 2 }}>Server URL</div>
          <input
            autoFocus
            value={serverUrlDraft}
            onChange={e => setServerUrlDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveServerUrl(); if (e.key === 'Escape') setShowServerConfig(false) }}
            placeholder="http://localhost:3001"
            style={{
              background: '#0d1117', border: '1px solid #30363d',
              borderRadius: 6, padding: '6px 10px',
              color: '#c9d1d9', fontSize: 12, outline: 'none',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowServerConfig(false)}
              style={{
                background: 'none', border: '1px solid #30363d', borderRadius: 5,
                color: '#7d8590', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveServerUrl}
              style={{
                background: '#1f6feb', border: 'none', borderRadius: 5,
                color: '#fff', fontSize: 11, padding: '4px 10px', cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Main panes ─────────────────────────────────────────────────── */}
      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>

        {/* Editor panel */}
        <Panel defaultSize={50} minSize={20}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Left panel tab bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch', height: 35, flexShrink: 0,
              background: '#010409', borderBottom: '1px solid #21262d',
            }}>
              {(['code', 'blocks'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setLeftView(v)}
                  style={{
                    background: leftView === v ? '#0d1117' : 'transparent',
                    color: leftView === v ? '#c9d1d9' : '#484f58',
                    border: 'none',
                    borderTop: leftView === v ? '2px solid #58a6ff' : '2px solid transparent',
                    borderRight: '1px solid #21262d',
                    padding: '0 16px',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    transition: 'color 0.12s', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {v === 'code' ? (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity: 0.7 }}>
                      <polyline points="1,3 4,5.5 1,8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      <line x1="5.5" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ opacity: 0.7 }}>
                      <rect x="1" y="1" width="9" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                      <rect x="1" y="4.5" width="9" height="2.5" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                      <rect x="1" y="8" width="9" height="2" rx="0.5" stroke="currentColor" strokeWidth="1"/>
                    </svg>
                  )}
                  {v}
                </button>
              ))}
            </div>

            {/* Left panel content */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {/* Monaco always rendered (but hidden when blocks view) to preserve editor state */}
              <div style={{ position: 'absolute', inset: 0, display: leftView === 'code' ? 'block' : 'none' }}>
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  value={html}
                  onChange={v => setHtml(v ?? '')}
                  theme="komnour-dark"
                  onMount={handleMonacoMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineHeight: 22,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                    fontLigatures: true,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                    insertSpaces: true,
                    renderWhitespace: 'none',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: 'on',
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    padding: { top: 16, bottom: 16 },
                    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6, useShadows: false },
                    suggest: { showKeywords: false, preview: true },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    renderLineHighlight: 'gutter',
                    automaticLayout: true,
                  }}
                />
              </div>
              {leftView === 'blocks' && (
                <div style={{ position: 'absolute', inset: 0, background: '#0d1117' }}>
                  <BlockOutline html={html} onChange={setHtml} />
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* ── Resize handle ──────────────────────────────────────────── */}
        <PanelResizeHandle style={{ width: 4, background: '#21262d', cursor: 'col-resize' }} />

        {/* Preview / Syntax panel */}
        <Panel defaultSize={50} minSize={20}>
          <div style={{
            height: '100%',
            background: view === 'syntax' ? '#0d1117' : '#090c10',
            ...(view !== 'syntax' && {
              backgroundImage: 'radial-gradient(circle, #21262d 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }),
            display: 'flex', flexDirection: 'column', position: 'relative',
          }}>

            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch', height: 35, flexShrink: 0,
              background: '#010409',
              borderBottom: '1px solid #21262d',
            }}>
              {(['preview', 'design', 'syntax'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? (v === 'syntax' ? '#0d1117' : '#090c10') : 'transparent',
                    color: view === v ? '#c9d1d9' : '#484f58',
                    border: 'none',
                    borderTop: view === v ? '2px solid #58a6ff' : '2px solid transparent',
                    borderRight: '1px solid #21262d',
                    padding: '0 16px',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    transition: 'color 0.12s',
                  }}
                >
                  {v}
                </button>
              ))}

              <div style={{ flex: 1 }} />

              {view === 'preview' && (
                <span style={{ fontSize: 10, color: '#30363d', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
                  794px · canvas
                </span>
              )}
              {view === 'design' && (
                <span style={{ fontSize: 10, color: '#30363d', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
                  794px · drag to reorder
                </span>
              )}
              {view === 'syntax' && (
                <button
                  onClick={copySyntax}
                  style={{
                    background: 'none', border: 'none',
                    color: copied ? '#3db87a' : '#484f58',
                    fontSize: 11, cursor: 'pointer', padding: '0 16px',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'color 0.15s',
                  }}
                >
                  {copied
                    ? <><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5 L4 8 L9.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Copied</>
                    : <><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="1" y="3.5" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1" fill="#010409"/></svg> Copy</>
                  }
                </button>
              )}
            </div>

            {/* Content */}
            {view === 'design' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <ZoomPane loading={false} onZoomChange={z => setZoomPct(Math.round(z * 100))}>
                  <DesignCanvas html={html} onChange={setHtml} />
                </ZoomPane>
              </div>
            )}
            {view === 'preview' && (
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {status === 'loading' && pages.length === 0 && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 12, color: '#484f58', fontSize: 12, pointerEvents: 'none',
                  }}>
                    <svg width="32" height="32" viewBox="0 0 32 32" style={{ animation: 'spin 1.2s linear infinite' }}>
                      <circle cx="16" cy="16" r="12" stroke="#21262d" strokeWidth="3" fill="none" />
                      <path d="M16 4 A12 12 0 0 1 28 16" stroke="#58a6ff" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                    rendering…
                  </div>
                )}
                <ZoomPane loading={status === 'loading'} onZoomChange={z => setZoomPct(Math.round(z * 100))}>
                  {pages.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {pages.map((url, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img
                            src={url}
                            alt={`page ${i + 1}`}
                            draggable={false}
                            style={{ display: 'block', width: 794, boxShadow: '0 0 0 1px #21262d, 0 12px 48px rgba(0,0,0,0.7)', borderRadius: 2 }}
                          />
                          {pages.length > 1 && (
                            <div style={{ position: 'absolute', bottom: -14, right: 0, fontSize: 9, color: '#3d444d', userSelect: 'none', pointerEvents: 'none' }}>
                              {i + 1} / {pages.length}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ZoomPane>
              </div>
            )}
            {view === 'syntax' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  language="typescript"
                  value={syntax}
                  theme="komnour-dark"
                  onMount={(_, monaco) => setupMonaco(monaco)}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineHeight: 20,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                    fontLigatures: true,
                    wordWrap: 'off',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    renderWhitespace: 'none',
                    smoothScrolling: true,
                    domReadOnly: true,
                    cursorStyle: 'line',
                    padding: { top: 16, bottom: 16 },
                    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6, useShadows: false },
                    overviewRulerLanes: 0,
                    renderLineHighlight: 'none',
                    automaticLayout: true,
                  }}
                />
              </div>
            )}
          </div>
        </Panel>

      </PanelGroup>

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        height: 22, padding: '0 12px',
        background: '#010409', borderTop: '1px solid #21262d',
        flexShrink: 0, gap: 16,
      }}>
        {(view === 'preview' || view === 'design') && (
          <span style={{ fontSize: 10, color: '#484f58' }}>{zoomPct}%</span>
        )}
        <span style={{ fontSize: 10, color: '#30363d' }}>·</span>
        {view === 'syntax' ? (
          <>
            <span style={{ fontSize: 10, color: '#484f58' }}>TypeScript</span>
            <span style={{ fontSize: 10, color: '#484f58' }}>{syntax.length.toLocaleString()} chars</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 10, color: '#484f58' }}>HTML</span>
            <span style={{ fontSize: 10, color: '#484f58' }}>UTF-8</span>
            <span style={{ fontSize: 10, color: '#484f58' }}>{html.length.toLocaleString()} chars</span>
          </>
        )}
      </div>
    </div>
  )
}
