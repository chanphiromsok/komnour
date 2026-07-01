import { useCallback, useEffect, useRef, useState } from 'react'
import type { Block, ParsedDoc } from '../types'
import { parseDoc, serializeDoc, addBlock } from '../lib/blocks'
import { loadFonts } from '../lib/fonts'
import { htmlToSoneSyntax } from '@komnour/html-to-syntax'
import Canvas from './Canvas'
import PropertyPanel, { PagePanel } from './PropertyPanel'

// ── Font asset imports ─────────────────────────────────────────────────────
import notoKhmer400 from '@fontsource/noto-sans-khmer/files/noto-sans-khmer-all-400-normal.woff?url'
import notoKhmer700 from '@fontsource/noto-sans-khmer/files/noto-sans-khmer-all-700-normal.woff?url'
import inter400 from '@fontsource/inter/files/inter-all-400-normal.woff?url'
import urlKhmerOSSiemreap  from '../../../glyphs/fonts/KhmerOsSiemreab/KhmerOSsiemreap.ttf?url'
import urlKhSiemreap       from '../../../glyphs/fonts/KhSiemreap/Kh-Siemreap.ttf?url'
import urlKhmerOSMuolLight from '../../../glyphs/fonts/KhmerOSMuolLight/Khmer-OS-Muol-Light.ttf?url'
import urlWingdings2       from '../../../glyphs/fonts/KhmerWing2/wingdings2.ttf?url'
import urlCalibriR         from '../../../glyphs/fonts/Calibri/calibri.ttf?url'
import urlCalibriB         from '../../../glyphs/fonts/Calibri/calibrib.ttf?url'
import urlCalibriI         from '../../../glyphs/fonts/Calibri/calibrii.ttf?url'
import urlCalibriL         from '../../../glyphs/fonts/Calibri/calibril.ttf?url'
import urlCalibriBI        from '../../../glyphs/fonts/Calibri/calibriz.ttf?url'
import urlKhmerBursaR      from '../../../glyphs/fonts/KhmerBursa/Mo5V56.ttf?url'
import urlKhmerBursaB      from '../../../glyphs/fonts/KhmerBursa/Mo8V56.ttf?url'

const FONT_MAP: Record<string, string[]> = {
  'Noto Sans Khmer':    [notoKhmer400, notoKhmer700],
  'Inter':              [inter400],
  'KhmerOSsiemreap':   [urlKhmerOSSiemreap],
  'Kh-Siemreap':       [urlKhSiemreap],
  'Khmer-OS-Muol-Light':[urlKhmerOSMuolLight],
  'Wingdings2':         [urlWingdings2],
  'Calibri':            [urlCalibriR, urlCalibriB, urlCalibriI, urlCalibriL, urlCalibriBI],
  'KhmerBursa':         [urlKhmerBursaR, urlKhmerBursaB],
}

// ── Default document ───────────────────────────────────────────────────────
const DEFAULT_HTML = `<div style="font-family: 'Noto Sans Khmer'; background: white; width: 794px; height: 1123px; position: relative;">
  <div data-block style="position:absolute;left:20px;top:20px;width:754px;"><div style="text-align: center;"><span style="font-size: 22px; font-weight: bold; color: #1a1a2e;">កិច្ចសន្យាខ្ចីប្រាក់</span></div></div>
  <div data-block style="position:absolute;left:20px;top:80px;width:754px;"><div style="text-align: center;"><span style="font-size: 13px; color: #555;">LOAN AGREEMENT CONTRACT</span></div></div>
  <div data-block style="position:absolute;left:20px;top:130px;width:754px;"><p style="font-size: 13px; line-height: 22px; color: #333;">ចំនួនប្រាក់កម្ចី: <strong>$12,000.00</strong></p></div>
  <div data-block style="position:absolute;left:20px;top:180px;width:754px;"><p style="font-size: 13px; line-height: 22px; color: #333;">អត្រាការប្រាក់: <span style="color: #c0392b;">1.5% / ខែ</span></p></div>
</div>`

const LS_KEY = 'komnour:ve:html'
const LS_WIDTH_KEY = 'komnour:ve:paperWidth'
const LS_HEIGHT_KEY = 'komnour:ve:paperHeight'

const PAPER_SIZES = [
  { value: 794,  h: 1123, label: 'A4' },
  { value: 816,  h: 1056, label: 'Letter' },
  { value: 559,  h: 794,  label: 'A5' },
  { value: 1122, h: 1587, label: 'A3' },
]

const ADD_ITEMS = [
  { tag: 'p',          label: 'Paragraph' },
  { tag: 'h1',         label: 'Heading 1' },
  { tag: 'h2',         label: 'Heading 2' },
  { tag: 'div',        label: 'Section' },
  { tag: 'img',        label: 'Image' },
  { tag: 'ul',         label: 'List' },
  { tag: 'hr',         label: 'H-Line' },
  { tag: 'rect',       label: 'Rectangle' },
  { tag: 'vline',      label: 'V-Line' },
  { tag: 'page-break', label: 'Page Break' },
]

// ── ZoomPane ───────────────────────────────────────────────────────────────
function ZoomPane({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(0.9)
  const [pan, setPan] = useState({ x: 60, y: 40 })
  const zoomRef = useRef(0.9)
  const panRef = useRef({ x: 60, y: 40 })
  const isPanning = useRef(false)
  const spaceDown = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState('default')

  const apply = useCallback((z: number, p: { x: number; y: number }) => {
    zoomRef.current = z; panRef.current = p; setZoom(z); setPan(p)
  }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const handler = (e: globalThis.WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const z = zoomRef.current, p = panRef.current
      if (e.ctrlKey || e.metaKey) {
        const nz = Math.min(4, Math.max(0.1, z * Math.pow(0.998, e.deltaY)))
        apply(nz, { x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) })
      } else {
        const np = { x: p.x - e.deltaX, y: p.y - e.deltaY }
        panRef.current = np; setPan(np)
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [apply])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !spaceDown.current) { spaceDown.current = true; setCursor('grab') } }
    const up   = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceDown.current = false; if (!isPanning.current) setCursor('default') } }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', cursor }}
      onMouseDown={e => {
        if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
          e.preventDefault(); isPanning.current = true
          panStart.current = { mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y }
          setCursor('grabbing')
        }
      }}
      onMouseMove={e => {
        if (!isPanning.current) return
        const np = { x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my }
        panRef.current = np; setPan(np)
      }}
      onMouseUp={() => { if (isPanning.current) { isPanning.current = false; setCursor(spaceDown.current ? 'grab' : 'default') } }}
      onMouseLeave={() => { if (isPanning.current) { isPanning.current = false; setCursor('default') } }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, willChange: 'transform',
        transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}>
        {children}
      </div>

      <div style={{
        position: 'absolute', bottom: 14, right: 14,
        display: 'flex', alignItems: 'center', gap: 1,
        background: '#161b22', border: '1px solid #30363d', borderRadius: 7, overflow: 'hidden',
        fontSize: 11, color: '#7d8590', userSelect: 'none', zIndex: 10,
      }}>
        <ZBtn onClick={() => apply(Math.max(0.1, zoomRef.current / 1.25), panRef.current)}>−</ZBtn>
        <span onClick={() => apply(0.9, { x: 60, y: 40 })}
          style={{ padding: '5px 8px', minWidth: 44, textAlign: 'center', cursor: 'pointer',
            borderLeft: '1px solid #21262d', borderRight: '1px solid #21262d' }}>
          {Math.round(zoom * 100)}%
        </span>
        <ZBtn onClick={() => apply(Math.min(4, zoomRef.current * 1.25), panRef.current)}>+</ZBtn>
      </div>
      <div style={{ position: 'absolute', bottom: 14, left: 14, fontSize: 10, color: '#30363d', userSelect: 'none', pointerEvents: 'none' }}>
        Ctrl+scroll to zoom · Space+drag to pan
      </div>
    </div>
  )
}

function ZBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer',
      padding: '5px 10px', fontSize: 15, lineHeight: 1,
    }}>{children}</button>
  )
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [rawHtml, setRawHtml] = useState(() => localStorage.getItem(LS_KEY) ?? DEFAULT_HTML)
  const [doc, setDoc] = useState<ParsedDoc | null>(() => parseDoc(rawHtml))
  const [blocks, setBlocks] = useState<Block[]>(() => parseDoc(rawHtml)?.blocks ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [paperWidth, setPaperWidth] = useState<number>(
    () => Number(localStorage.getItem(LS_WIDTH_KEY)) || 794
  )
  const [paperHeight, setPaperHeight] = useState<number>(
    () => Number(localStorage.getItem(LS_HEIGHT_KEY)) || 1123
  )

  const history = useRef<Block[][]>([])
  const push = (next: Block[]) => {
    history.current = [...history.current.slice(-49), blocks]
    commit(next)
  }
  const undo = () => {
    const prev = history.current.pop()
    if (prev) commit(prev)
  }

  const commit = (next: Block[]) => {
    setBlocks(next)
    if (!doc) return
    const html = serializeDoc(doc, next)
    setRawHtml(html)
    localStorage.setItem(LS_KEY, html)
  }

  const handleDocChange = (updated: ParsedDoc) => {
    setDoc(updated)
    const html = serializeDoc(updated, blocks)
    setRawHtml(html)
    localStorage.setItem(LS_KEY, html)
  }

  const handlePaperWidth = (w: number) => {
    const size = PAPER_SIZES.find(s => s.value === w)
    setPaperWidth(w)
    if (size) { setPaperHeight(size.h); localStorage.setItem(LS_HEIGHT_KEY, String(size.h)) }
    localStorage.setItem(LS_WIDTH_KEY, String(w))
  }

  useEffect(() => {
    loadFonts(FONT_MAP).then(() => setFontsReady(true)).catch(console.error)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.isContentEditable) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleCopySone = async () => {
    if (!doc) return
    try {
      const blocksHtml = blocks.map(b => b.html).join('\n')
      const code = htmlToSoneSyntax(blocksHtml, { width: paperWidth, preamble: true })
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

  const handleBlockChange = (updated: Block) => {
    push(blocks.map(b => b.id === updated.id ? updated : b))
  }

  const injectStyle = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Inter', sans-serif; background: #090c10; color: #c9d1d9; height: 100vh; overflow: hidden; }
    ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    select, button, input { font-family: inherit; }
  `

  if (!doc) return <div style={{ color: '#f85149', padding: 40 }}>Could not parse HTML. Wrap content in a root &lt;div&gt;.</div>

  return (
    <>
      <style>{injectStyle}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#090c10' }}>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 44, padding: '0 16px', flexShrink: 0,
          background: '#010409', borderBottom: '1px solid #21262d',
          userSelect: 'none',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 8 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <polygon points="9,1 17,5 17,13 9,17 1,13 1,5" fill="none" stroke="#58a6ff" strokeWidth="1.5"/>
              <polygon points="9,4 14,7 14,11 9,14 4,11 4,7" fill="#58a6ff" opacity="0.2"/>
              <circle cx="9" cy="9" r="2" fill="#58a6ff"/>
            </svg>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#e6edf3', letterSpacing: '0.02em' }}>
              Visual Editor
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: '#21262d', margin: '0 4px' }} />

          {/* Paper size */}
          <select
            value={String(paperWidth)}
            onChange={e => handlePaperWidth(Number(e.target.value))}
            style={{
              background: '#161b22', border: '1px solid #30363d', borderRadius: 6,
              color: '#7d8590', fontSize: 11, padding: '4px 8px', cursor: 'pointer', outline: 'none',
            }}
          >
            {PAPER_SIZES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <div style={{ width: 1, height: 20, background: '#21262d', margin: '0 4px' }} />

          {/* Add block */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAddMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', color: '#7d8590',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Add Block
            </button>
            {showAddMenu && (
              <div
                style={{
                  position: 'absolute', top: 36, left: 0, zIndex: 100,
                  background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
                  padding: '4px', minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
                onMouseLeave={() => setShowAddMenu(false)}
              >
                {ADD_ITEMS.map(item => (
                  <button
                    key={item.tag}
                    onClick={() => {
                      push(addBlock(blocks, item.tag, selectedId))
                      setShowAddMenu(false)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', borderRadius: 5,
                      color: '#c9d1d9', fontSize: 12, padding: '6px 10px', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#21262d')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Undo */}
          <button
            onClick={undo}
            title="Undo (Cmd/Ctrl+Z)"
            style={{
              display: 'flex', alignItems: 'center',
              background: 'transparent', color: '#484f58',
              border: '1px solid #30363d', borderRadius: 6,
              padding: '5px 8px', fontSize: 12, cursor: 'pointer',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 5H7.5C9.43 5 11 6.57 11 8.5S9.43 12 7.5 12H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M4.5 2.5L2 5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Copy Sone */}
          <button
            onClick={handleCopySone}
            title="Copy sone layout code to clipboard"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: copyState === 'copied' ? '#1a3c2a' : 'transparent',
              color: copyState === 'copied' ? '#3db87a' : '#484f58',
              border: '1px solid ' + (copyState === 'copied' ? '#2ea04326' : '#30363d'),
              borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {copyState === 'copied' ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1"/>
                  <rect x="1" y="3.5" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1" fill="#010409"/>
                </svg>
                Copy Sone
              </>
            )}
          </button>

          <div style={{ flex: 1 }} />

          {/* Font status */}
          <span style={{ fontSize: 10, color: fontsReady ? '#3db87a' : '#484f58' }}>
            {fontsReady ? '● fonts ready' : '● loading fonts…'}
          </span>
        </div>

        {/* ── Main area ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* Canvas */}
          <div style={{
            flex: 1, minWidth: 0,
            background: '#090c10',
            backgroundImage: 'radial-gradient(circle, #21262d 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}>
            <ZoomPane>
              <Canvas
                doc={doc}
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onBlocksChange={next => push(next)}
                onBlockChange={handleBlockChange}
                paperWidth={paperWidth}
                paperHeight={paperHeight}
              />
            </ZoomPane>
          </div>

          {/* Right panel */}
          <div style={{
            width: 260, flexShrink: 0,
            background: '#0d1117',
            borderLeft: '1px solid #21262d',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              height: 35, display: 'flex', alignItems: 'center', padding: '0 14px',
              borderBottom: '1px solid #21262d', fontSize: 11,
              color: selectedBlock ? '#c9d1d9' : '#7d8590', letterSpacing: '0.04em',
            }}>
              {selectedBlock ? `Properties · <${selectedBlock.tagName}>` : 'Page'}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {selectedBlock ? (
                <PropertyPanel block={selectedBlock} onChange={handleBlockChange} />
              ) : (
                <PagePanel
                  doc={doc}
                  onDocChange={handleDocChange}
                  paperWidth={paperWidth}
                  onPaperWidthChange={handlePaperWidth}
                />
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
