import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const DEFAULT_HTML = `<div style="padding: 48px; font-family: 'Noto Sans Khmer';">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 22px; font-weight: bold; color: #1a1a2e;">
      កិច្ចសន្យាខ្ចីប្រាក់
    </div>
    <div style="font-size: 13px; color: #555; margin-top: 4px;">LOAN AGREEMENT CONTRACT</div>
  </div>

  <p style="font-size: 13px; line-height: 22px; margin-bottom: 16px; color: #333;">
    ចំនួនប្រាក់កម្ចី: <strong>$12,000.00</strong> —
    អត្រាការប្រាក់: <span style="color: #c0392b;">1.5% / ខែ</span>
  </p>

  <ul style="margin-bottom: 24px; padding-left: 20px;">
    <li style="font-size: 13px; line-height: 22px; margin-bottom: 6px;">ត្រូវមានអត្តសញ្ញាណប័ណ្ណ</li>
    <li style="font-size: 13px; line-height: 22px; margin-bottom: 6px;">ត្រូវមានទ្រព្យជំហររ</li>
    <li style="font-size: 13px; line-height: 22px; color: #c0392b;">ការទូទាត់មុនថ្ងៃទី 1</li>
  </ul>

  <page-break></page-break>

  <p style="font-size: 13px; line-height: 22px; color: #333;">Page 2 content after break.</p>
</div>`

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

  const [view, setView] = useState<'preview' | 'syntax'>('preview')
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
      const res = await fetch(`${SERVER}/render`, {
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

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => exportFile('png')}
            disabled={exporting !== null}
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
        </div>
      </div>

      {/* ── Main panes ─────────────────────────────────────────────────── */}
      <PanelGroup direction="horizontal" style={{ flex: 1, overflow: 'hidden' }}>

        {/* Editor panel */}
        <Panel defaultSize={50} minSize={20}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              height: 35, background: '#010409',
              borderBottom: '1px solid #21262d',
              flexShrink: 0, paddingLeft: 12,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: '100%',
                borderRight: '1px solid #21262d',
                color: '#c9d1d9', fontSize: 12,
                background: '#0d1117',
                borderTop: '2px solid #58a6ff',
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.6 }}>
                  <rect x="1" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                  <rect x="7" y="1" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                  <rect x="1" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                  <rect x="7" y="7" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" />
                </svg>
                document.html
              </div>
            </div>

            <Editor
              height="calc(100% - 35px)"
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
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                  useShadows: false,
                },
                suggest: { showKeywords: false, preview: true },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: 'gutter',
                automaticLayout: true,
              }}
            />
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
            display: 'flex', flexDirection: 'column',
          }}>

            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'stretch', height: 35, flexShrink: 0,
              background: '#010409',
              borderBottom: '1px solid #21262d',
            }}>
              {(['preview', 'syntax'] as const).map(v => (
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
                  794px · local
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
            {view === 'preview' ? (
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
            ) : (
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
        {view === 'preview' && (
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
