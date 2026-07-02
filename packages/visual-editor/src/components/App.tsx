import { useCallback, useEffect, useRef, useState } from 'react'
import type { SoneBlock, VeDoc, BlockType } from '../types'
import { loadDoc, saveDoc, newBlock, newHeading } from '../lib/block-model'
import { docToSoneCode } from '../lib/block-sone'
import { browserRenderer } from '../lib/sone-renderer'
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

const ADD_ITEMS: Array<{ type: BlockType | 'heading'; label: string }> = [
  { type: 'text',    label: 'Text' },
  { type: 'heading', label: 'Heading' },
  { type: 'list',    label: 'List' },
  { type: 'rect',    label: 'Rectangle' },
  { type: 'hline',   label: 'H-Line' },
  { type: 'vline',   label: 'V-Line' },
  { type: 'photo',   label: 'Image' },
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
  const [doc, setDoc] = useState<VeDoc>(() => loadDoc())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  const docRef = useRef(doc)
  docRef.current = doc

  const history = useRef<SoneBlock[][]>([])

  const commit = (next: VeDoc) => {
    setDoc(next)
    saveDoc(next)
  }
  const commitBlocks = (blocks: SoneBlock[]) => commit({ ...docRef.current, blocks })
  const push = (blocks: SoneBlock[]) => {
    history.current = [...history.current.slice(-49), docRef.current.blocks]
    commitBlocks(blocks)
  }
  const undo = () => {
    const prev = history.current.pop()
    if (prev) commitBlocks(prev)
  }

  const handleDocChange = (patch: Partial<VeDoc>) => commit({ ...docRef.current, ...patch })

  const handleBlockChange = (updated: SoneBlock) => {
    push(doc.blocks.map(b => b.id === updated.id ? updated : b))
  }

  // Register fonts with the sone renderer (it does its own hasFont checks)
  useEffect(() => {
    Promise.all(
      Object.entries(FONT_MAP).map(([name, urls]) => browserRenderer.registerFont(name, urls))
    ).then(() => setFontsReady(true)).catch(console.error)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t?.isContentEditable || t?.tagName === 'TEXTAREA' || t?.tagName === 'INPUT') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleAdd = (type: BlockType | 'heading') => {
    const maxBottom = doc.blocks.length > 0
      ? Math.max(...doc.blocks.map(b => b.y + (b.h || 40)))
      : 8
    const y = maxBottom + 16
    const blk = type === 'heading'
      ? newHeading(20, y, doc.paperWidth)
      : newBlock(type, 20, y, doc.paperWidth)
    push([...doc.blocks, blk])
    setSelectedId(blk.id)
    setShowAddMenu(false)
  }

  const handleCopySone = async () => {
    try {
      await navigator.clipboard.writeText(docToSoneCode(doc))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const selectedBlock = doc.blocks.find(b => b.id === selectedId) ?? null

  const injectStyle = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Inter', sans-serif; background: #090c10; color: #c9d1d9; height: 100vh; overflow: hidden; }
    ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    select, button, input, textarea { font-family: inherit; }
  `

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
                    key={item.type}
                    onClick={() => handleAdd(item.type)}
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

          {/* Add page */}
          <button
            onClick={() => handleDocChange({ pages: doc.pages + 1 })}
            title="Append a page to the artboard"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', color: '#7d8590',
              border: '1px solid #30363d', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <rect x="1.5" y="1" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
              <path d="M5.5 4v3M4 5.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Page ({doc.pages})
          </button>

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
                blocks={doc.blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onBlocksChange={next => push(next)}
                onBlockChange={handleBlockChange}
                fontsReady={fontsReady}
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
              {selectedBlock ? `Properties · ${selectedBlock.type}` : 'Page'}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {selectedBlock ? (
                <PropertyPanel block={selectedBlock} onChange={handleBlockChange} />
              ) : (
                <PagePanel doc={doc} onDocChange={handleDocChange} />
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
