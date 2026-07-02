import { useRef, useState, useEffect } from 'react'
import { Column, Row, Text, Span, PageBreak, Path, Photo, List, ListItem, Table, TableRow, TableCell, render } from 'sone'
import { Pencil, Copy, Trash2, Bold, Italic, Underline, Strikethrough } from 'lucide-react'
import type { SoneBuilderSet } from '@komnour/html-to-syntax'
import type { SoneBlock, VeDoc, BlockType, TextProps, ListProps, TableProps } from '../types'
import { buildBlockNode } from '../lib/block-sone'
import { browserRenderer } from '../lib/sone-renderer'
import { spansToHtml, htmlToSpans } from '../lib/rich-text'
import { spaceKey } from '../lib/interaction'

const soneBuilders: SoneBuilderSet = { Column, Row, Text, Span, PageBreak, Path, Photo, List, ListItem, Table, TableRow, TableCell }
const imageCache = new Map<string | Uint8Array, any>()

interface Props {
  doc: VeDoc
  blocks: SoneBlock[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onBlocksChange: (blocks: SoneBlock[]) => void
  onBlockChange: (updated: SoneBlock) => void
  fontsReady: boolean
}

const EDITABLE_TYPES = new Set<BlockType>(['text', 'list'])
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const ALL_DIRS: ResizeDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLES_FOR: Record<BlockType, ResizeDir[]> = {
  text:  ['e', 'w'],
  list:  ['e', 'w'],
  hline: ['e', 'w'],
  vline: ['n', 's'],
  rect:  ALL_DIRS,
  photo: ALL_DIRS,
  table: [],
}

interface Op {
  kind: 'move' | 'resize'
  blockId: string
  dir?: ResizeDir
  startMx: number
  startMy: number
  origX: number
  origY: number
  origW: number
  origH: number
  scale: number  // CSS zoom factor so screen-px delta converts to artboard-px correctly
}

export default function Canvas({
  doc, blocks, selectedId, onSelect, onBlocksChange, onBlockChange, fontsReady,
}: Props) {
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [op, setOp]               = useState<Op | null>(null)

  const opRef           = useRef<Op | null>(null)
  const blocksRef       = useRef(blocks)
  const onBlocksRef     = useRef(onBlocksChange)
  const wrapperRefs     = useRef(new Map<string, HTMLDivElement>())
  blocksRef.current     = blocks
  onBlocksRef.current   = onBlocksChange

  const pages = Math.max(1, doc.pages || 1)
  const artStyle: React.CSSProperties = {
    position: 'relative',
    width: doc.paperWidth,
    height: doc.paperHeight * pages,
    background: doc.bg || 'white',
    boxSizing: 'border-box',
    boxShadow: '0 0 0 1px #21262d, 0 8px 40px rgba(0,0,0,0.6)',
    borderRadius: 2,
    overflow: 'hidden',
  }

  useEffect(() => {
    if (!op) return
    const onMove = (e: MouseEvent) => {
      const o = opRef.current
      if (!o) return
      const el = wrapperRefs.current.get(o.blockId)
      if (!el) return
      const dx = (e.clientX - o.startMx) / o.scale
      const dy = (e.clientY - o.startMy) / o.scale
      if (o.kind === 'move') {
        el.style.left = `${Math.max(0, o.origX + dx)}px`
        el.style.top  = `${Math.max(0, o.origY + dy)}px`
      } else {
        applyResize(el, o, dx, dy)
      }
    }
    const onUp = () => {
      const o = opRef.current
      if (!o) return
      const el = wrapperRefs.current.get(o.blockId)
      const blk = blocksRef.current.find(b => b.id === o.blockId)
      if (el && blk) {
        const x = parseFloat(el.style.left) || 0
        const y = parseFloat(el.style.top)  || 0
        let { w, h } = blk
        if (o.kind === 'resize') {
          const dirs = HANDLES_FOR[blk.type]
          if (dirs.includes('e') || dirs.includes('w')) w = parseFloat(el.style.width) || el.offsetWidth
          if (blk.type === 'vline' || blk.type === 'rect' || blk.type === 'photo') {
            h = parseFloat(el.style.height) || el.offsetHeight
          }
          if (blk.type === 'vline') w = blk.w
          if (blk.type === 'hline') h = blk.h
        }
        onBlocksRef.current(
          blocksRef.current.map(b => b.id === o.blockId ? { ...b, x, y, w, h } : b)
        )
        el.style.width = ''
        el.style.height = ''
      }
      opRef.current = null
      setOp(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',  onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',  onUp)
    }
  }, [!!op]) // eslint-disable-line react-hooks/exhaustive-deps

  const getScale = (el: HTMLElement) => {
    if (el.offsetWidth === 0) return 1
    return el.getBoundingClientRect().width / el.offsetWidth
  }

  const startOp = (e: React.MouseEvent, block: SoneBlock, kind: Op['kind'], dir?: ResizeDir) => {
    if (kind === 'move' && e.button !== 0) return
    e.stopPropagation()
    if (kind === 'resize') e.preventDefault()
    const el = wrapperRefs.current.get(block.id)
    if (!el) return
    const o: Op = {
      kind, blockId: block.id, dir,
      startMx: e.clientX, startMy: e.clientY,
      origX: block.x, origY: block.y,
      origW: el.offsetWidth, origH: el.offsetHeight,
      scale: getScale(el),
    }
    opRef.current = o
    setOp(o)
  }

  const stopEditing = () => setEditingId(null)

  // Ghost copies of repeat blocks on their non-master pages (display only)
  const ghosts: Array<{ key: string; block: SoneBlock }> = []
  for (const b of blocks) {
    if (!b.repeat) continue
    const masterPage = Math.floor(b.y / doc.paperHeight)
    const inPageY = b.y - masterPage * doc.paperHeight
    for (let p = 0; p < pages; p++) {
      if (p === masterPage) continue
      ghosts.push({ key: `${b.id}@${p}`, block: { ...b, y: p * doc.paperHeight + inPageY } })
    }
  }

  return (
    <div
      style={{ position: 'relative', marginLeft: 40 }}
      onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
    >
      <div
        style={artStyle}
        onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
      >
        {/* Page boundary guides */}
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div key={`pg${i}`} style={{
            position: 'absolute', left: 0, right: 0, top: (i + 1) * doc.paperHeight,
            borderTop: '1px dashed #a0b3d0', pointerEvents: 'none', zIndex: 5,
          }}>
            <span style={{
              position: 'absolute', right: 6, top: 2, fontSize: 9, color: '#a0b3d0',
              background: 'rgba(255,255,255,0.7)', padding: '0 4px', borderRadius: 2,
            }}>
              Page {i + 2}
            </span>
          </div>
        ))}

        {/* Ghosts (repeated header/footer on other pages) */}
        {ghosts.map(({ key, block }) => (
          <div key={key} style={{ position: 'absolute', left: block.x, top: block.y, opacity: 0.4, pointerEvents: 'none' }}>
            <SoneBlockView block={{ ...block, y: 0, x: 0 }} pageFont={doc.font} fontsReady={fontsReady} />
          </div>
        ))}

        {blocks.map(block => {
          const isSelected = block.id === selectedId
          const isEditing  = block.id === editingId
          const isHovered  = block.id === hoverId && !isSelected
          return (
            <div
              key={block.id}
              ref={el => { if (el) wrapperRefs.current.set(block.id, el); else wrapperRefs.current.delete(block.id) }}
              style={{
                position: 'absolute',
                left: block.x,
                top:  block.y,
                minWidth: 8,
                minHeight: 4,
                transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
                boxSizing: 'border-box',
                outline: isSelected ? '1px solid #58a6ff' : isHovered ? '1px dashed #484f58' : 'none',
                outlineOffset: 1,
                cursor: isEditing ? 'text' : op?.kind === 'move' ? 'grabbing' : 'default',
                userSelect: isEditing ? 'text' : 'none',
              }}
              onMouseEnter={() => setHoverId(block.id)}
              onMouseLeave={() => setHoverId(null)}
              onMouseDown={e => {
                if (spaceKey.down) return                       // let the pan layer handle it
                if ((e.target as HTMLElement).closest('[data-rh]')) return
                if (!isEditing) startOp(e, block, 'move')
              }}
              onClick={e => { e.stopPropagation(); if (!isEditing) onSelect(block.id) }}
              onDoubleClick={e => {
                e.stopPropagation()
                if (EDITABLE_TYPES.has(block.type)) { onSelect(block.id); setEditingId(block.id) }
              }}
            >
              {isSelected && !isEditing && HANDLES_FOR[block.type].length > 0 && (
                <ResizeHandles dirs={HANDLES_FOR[block.type]} onMouseDown={(dir, e) => startOp(e, block, 'resize', dir)} />
              )}

              {isSelected && !isEditing && block.type === 'table' && (
                <TableColumnResizers block={block} onChange={onBlockChange} />
              )}

              {isSelected && !isEditing && (
                <BlockToolbar
                  canEdit={EDITABLE_TYPES.has(block.type)}
                  onEdit={() => setEditingId(block.id)}
                  onDelete={() => { onBlocksChange(blocks.filter(b => b.id !== block.id)); onSelect(null) }}
                  onDuplicate={() => {
                    const copy: SoneBlock = { ...block, props: { ...block.props }, id: `b${Date.now()}`, x: block.x + 20, y: block.y + 20 }
                    onBlocksChange([...blocks, copy]); onSelect(copy.id)
                  }}
                />
              )}

              {isEditing && block.type === 'text' ? (
                <RichTextEditor block={block} pageFont={doc.font}
                  onCommit={u => { onBlockChange(u); stopEditing() }} onCancel={stopEditing} />
              ) : isEditing && block.type === 'list' ? (
                <ListEditor block={block} onCommit={u => { onBlockChange(u); stopEditing() }} onCancel={stopEditing} />
              ) : (
                <SoneBlockView block={block} pageFont={doc.font} fontsReady={fontsReady} />
              )}
            </div>
          )
        })}

        {blocks.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13, pointerEvents: 'none' }}>
            No blocks yet. Add one from the toolbar.
          </div>
        )}
      </div>
    </div>
  )
}

// ── SoneBlockView ─────────────────────────────────────────────────────────────

function SoneBlockView({ block, pageFont, fontsReady }: { block: SoneBlock; pageFont: string; fontsReady: boolean }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const contentKey = JSON.stringify([block.type, block.w, block.h, block.props, pageFont])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const node = buildBlockNode(block, soneBuilders, pageFont, false)
        if (!node) return
        const canvas: HTMLCanvasElement = await render(node, browserRenderer, { cache: imageCache })
        if (cancelled || !holderRef.current) return
        const dpr = window.devicePixelRatio || 1
        canvas.style.width  = `${canvas.width / dpr}px`
        canvas.style.height = `${canvas.height / dpr}px`
        canvas.style.display = 'block'
        holderRef.current.replaceChildren(canvas)
      } catch (err) {
        console.error('sone block render failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [contentKey, fontsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={holderRef} style={{ pointerEvents: 'none' }} />
}

// ── RichTextEditor: contentEditable + floating format toolbar ─────────────────

function RichTextEditor({ block, pageFont, onCommit, onCancel }: {
  block: SoneBlock; pageFont: string; onCommit: (u: SoneBlock) => void; onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const p = block.props as TextProps

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = spansToHtml(p.spans)
    document.execCommand('styleWithCSS', false, 'true')
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el); range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges(); sel?.addRange(range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    const el = ref.current
    if (!el) return onCancel()
    onCommit({ ...block, props: { ...p, spans: htmlToSpans(el) } })
  }

  const cmd = (command: string, value?: string) => {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    ref.current?.focus()
  }

  return (
    <>
      <FloatingFormatBar onCmd={cmd} />
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={e => {
          // keep editing if focus moved to the format bar
          if ((e.relatedTarget as HTMLElement)?.closest('[data-fmtbar]')) return
          commit()
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
          e.stopPropagation()
        }}
        onMouseDown={e => e.stopPropagation()}
        style={{
          display: 'block',
          width: block.w > 0 ? block.w : 200,
          outline: 'none',
          background: 'rgba(88,166,255,0.06)',
          fontFamily: `'${p.font || pageFont}', sans-serif`,
          fontSize: p.size,
          color: p.color,
          textAlign: p.align,
          lineHeight: p.lineHeight > 0 ? p.lineHeight : 1.4,
          whiteSpace: 'pre-wrap',
        }}
      />
    </>
  )
}

function FloatingFormatBar({ onCmd }: { onCmd: (cmd: string, value?: string) => void }) {
  const stop = (e: React.MouseEvent) => e.preventDefault()  // keep the text selection
  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer',
    padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
  }
  return (
    <div data-fmtbar style={{
      position: 'absolute', top: -40, left: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 2,
      background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '3px 5px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
    }}>
      <button style={btnStyle} title="Bold" onMouseDown={stop} onClick={() => onCmd('bold')}><Bold size={14} /></button>
      <button style={btnStyle} title="Italic" onMouseDown={stop} onClick={() => onCmd('italic')}><Italic size={14} /></button>
      <button style={btnStyle} title="Underline" onMouseDown={stop} onClick={() => onCmd('underline')}><Underline size={14} /></button>
      <button style={btnStyle} title="Strikethrough" onMouseDown={stop} onClick={() => onCmd('strikeThrough')}><Strikethrough size={14} /></button>
      <div style={{ width: 1, height: 16, background: '#30363d', margin: '0 2px' }} />
      <label title="Text color" onMouseDown={stop} style={{ ...btnStyle, position: 'relative' }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, background: 'linear-gradient(135deg,#f85149,#58a6ff)', display: 'block' }} />
        <input type="color" onMouseDown={stop}
          onChange={e => onCmd('foreColor', e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
      </label>
    </div>
  )
}

// ── ListEditor (plain items, one per line) ────────────────────────────────────

function ListEditor({ block, onCommit, onCancel }: {
  block: SoneBlock; onCommit: (u: SoneBlock) => void; onCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const p = block.props as ListProps
  const initial = p.items.join('\n')
  useEffect(() => {
    const ta = ref.current; if (!ta) return
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length)
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px` }
    fit(); ta.addEventListener('input', fit); return () => ta.removeEventListener('input', fit)
  }, [])
  const commit = () => {
    const items = (ref.current?.value ?? initial).split('\n').map(s => s.trim()).filter(Boolean)
    onCommit({ ...block, props: { ...p, items: items.length ? items : ['Item'] } })
  }
  return (
    <textarea ref={ref} defaultValue={initial} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() }; e.stopPropagation() }}
      onMouseDown={e => e.stopPropagation()}
      style={{
        display: 'block', width: block.w > 0 ? block.w : 220, border: 'none', outline: 'none',
        resize: 'none', background: 'rgba(88,166,255,0.06)', padding: '0 0 0 20px', overflow: 'hidden',
        fontFamily: 'inherit', fontSize: p.size, color: p.color, lineHeight: 1.5,
      }}
    />
  )
}

// ── Table column resizers ─────────────────────────────────────────────────────

function TableColumnResizers({ block, onChange }: { block: SoneBlock; onChange: (u: SoneBlock) => void }) {
  const p = block.props as TableProps
  const totalH = p.rowHeights.reduce((a, b) => a + b, 0)
  let cx = 0
  return (
    <>
      {p.colWidths.slice(0, -1).map((cw, i) => {
        cx += cw
        const left = cx
        return (
          <div key={i} data-rh="col"
            onMouseDown={e => {
              e.stopPropagation(); e.preventDefault()
              const startX = e.clientX
              const startW = p.colWidths[i]
              const el = (e.currentTarget.closest('[style]') as HTMLElement)
              const scale = el ? el.getBoundingClientRect().width / el.offsetWidth : 1
              const move = (ev: MouseEvent) => {
                const next = [...p.colWidths]
                next[i] = Math.max(24, Math.round(startW + (ev.clientX - startX) / scale))
                onChange({ ...block, props: { ...p, colWidths: next }, w: next.reduce((a, b) => a + b, 0) })
              }
              const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
              document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
            }}
            style={{ position: 'absolute', top: 0, left: left - 3, width: 6, height: totalH, cursor: 'ew-resize', zIndex: 25 }}
          />
        )
      })}
    </>
  )
}

// ── Resize logic ──────────────────────────────────────────────────────────────

function applyResize(el: HTMLElement, o: Op, dx: number, dy: number) {
  if (!o.dir) return
  let x = o.origX, y = o.origY, w = o.origW, h = o.origH
  if (o.dir.includes('e')) w = Math.max(8, o.origW + dx)
  if (o.dir.includes('s')) h = Math.max(4, o.origH + dy)
  if (o.dir.includes('w')) { x = o.origX + dx; w = Math.max(8, o.origW - dx) }
  if (o.dir.includes('n')) { y = o.origY + dy; h = Math.max(4, o.origH - dy) }
  el.style.left = `${x}px`
  el.style.top  = `${y}px`
  if (o.dir.includes('e') || o.dir.includes('w')) el.style.width  = `${w}px`
  if (o.dir.includes('n') || o.dir.includes('s')) el.style.height = `${h}px`
}

// ── ResizeHandles ─────────────────────────────────────────────────────────────

const HANDLE_STYLE: Record<ResizeDir, { style: React.CSSProperties; cursor: string }> = {
  nw: { style: { top: -4, left: -4 },                                      cursor: 'nwse-resize' },
  n:  { style: { top: -4, left: '50%', transform: 'translateX(-50%)' },    cursor: 'ns-resize'   },
  ne: { style: { top: -4, right: -4 },                                     cursor: 'nesw-resize' },
  e:  { style: { top: '50%', right: -4, transform: 'translateY(-50%)' },   cursor: 'ew-resize'   },
  se: { style: { bottom: -4, right: -4 },                                  cursor: 'nwse-resize' },
  s:  { style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' }, cursor: 'ns-resize'   },
  sw: { style: { bottom: -4, left: -4 },                                   cursor: 'nesw-resize' },
  w:  { style: { top: '50%', left: -4, transform: 'translateY(-50%)' },    cursor: 'ew-resize'   },
}

function ResizeHandles({ dirs, onMouseDown }: { dirs: ResizeDir[]; onMouseDown: (dir: ResizeDir, e: React.MouseEvent) => void }) {
  return (
    <>
      {dirs.map(dir => (
        <div key={dir} data-rh={dir}
          onMouseDown={e => { e.stopPropagation(); onMouseDown(dir, e) }}
          style={{
            position: 'absolute', width: 8, height: 8,
            background: '#58a6ff', border: '1.5px solid white',
            borderRadius: 1, zIndex: 30, cursor: HANDLE_STYLE[dir].cursor,
            ...HANDLE_STYLE[dir].style,
          }}
        />
      ))}
    </>
  )
}

// ── BlockToolbar ──────────────────────────────────────────────────────────────

function BlockToolbar({ canEdit, onEdit, onDelete, onDuplicate }: {
  canEdit: boolean; onEdit: () => void; onDelete: () => void; onDuplicate: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: -30, right: 0, zIndex: 40,
      display: 'flex', gap: 2,
      background: '#161b22', border: '1px solid #30363d', borderRadius: 5, padding: '2px 4px',
    }}>
      {canEdit && <ToolBtn title="Edit text" onClick={onEdit}><Pencil size={12} /></ToolBtn>}
      <ToolBtn title="Duplicate (offset +20px)" onClick={onDuplicate}><Copy size={12} /></ToolBtn>
      <ToolBtn title="Delete" onClick={onDelete}><Trash2 size={12} /></ToolBtn>
    </div>
  )
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7d8590', padding: '3px 5px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#f85149')}
      onMouseLeave={e => (e.currentTarget.style.color = '#7d8590')}
    >{children}</button>
  )
}
