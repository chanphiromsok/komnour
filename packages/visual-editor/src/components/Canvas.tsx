import { useRef, useState, useEffect } from 'react'
import { Column, Row, Text, Span, PageBreak, Path, Photo, render } from 'sone'
import type { SoneBuilderSet } from '@komnour/html-to-syntax'
import type { SoneBlock, VeDoc, BlockType, TextProps, ListProps } from '../types'
import { buildBlockNode } from '../lib/block-sone'
import { browserRenderer } from '../lib/sone-renderer'

const soneBuilders: SoneBuilderSet = { Column, Row, Text, Span, PageBreak, Path, Photo }
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

  // Document-level mouse listeners during drag/resize
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
          if (dirs.includes('e') || dirs.includes('w')) w = parseFloat(el.style.width)  || el.offsetWidth
          if (blk.type === 'vline' || blk.type === 'rect' || blk.type === 'photo') {
            h = parseFloat(el.style.height) || el.offsetHeight
          }
          // a line's thin axis is owned by strokeWidth, not the resize op
          if (blk.type === 'vline') w = blk.w
          if (blk.type === 'hline') h = blk.h
        }
        onBlocksRef.current(
          blocksRef.current.map(b => b.id === o.blockId ? { ...b, x, y, w, h } : b)
        )
        // Clear inline sizes so the committed block's canvas defines its own box
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

  return (
    <div
      style={{ position: 'relative', marginLeft: 40 }}
      onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
    >
      {/* Artboard */}
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

        {blocks.map(block => {
          const isSelected = block.id === selectedId
          const isEditing  = block.id === editingId
          const isHovered  = block.id === hoverId && !isSelected

          return (
            <div
              key={block.id}
              ref={el => {
                if (el) wrapperRefs.current.set(block.id, el)
                else wrapperRefs.current.delete(block.id)
              }}
              style={{
                position: 'absolute',
                left: block.x,
                top:  block.y,
                minWidth: 8,
                minHeight: 4,
                boxSizing: 'border-box',
                outline: isSelected
                  ? '1px solid #58a6ff'
                  : isHovered
                  ? '1px dashed #484f58'
                  : 'none',
                outlineOffset: 1,
                cursor: isEditing ? 'text' : op?.kind === 'move' ? 'grabbing' : 'default',
                userSelect: isEditing ? 'text' : 'none',
              }}
              onMouseEnter={() => setHoverId(block.id)}
              onMouseLeave={() => setHoverId(null)}
              onMouseDown={e => {
                if ((e.target as HTMLElement).closest('[data-rh]')) return
                if (!isEditing) startOp(e, block, 'move')
              }}
              onClick={e => { e.stopPropagation(); if (!isEditing) onSelect(block.id) }}
              onDoubleClick={e => {
                e.stopPropagation()
                if (EDITABLE_TYPES.has(block.type)) { onSelect(block.id); setEditingId(block.id) }
              }}
            >
              {/* Resize handles */}
              {isSelected && !isEditing && (
                <ResizeHandles
                  dirs={HANDLES_FOR[block.type]}
                  onMouseDown={(dir, e) => startOp(e, block, 'resize', dir)}
                />
              )}

              {/* Block toolbar */}
              {isSelected && !isEditing && (
                <BlockToolbar
                  canEdit={EDITABLE_TYPES.has(block.type)}
                  onEdit={() => setEditingId(block.id)}
                  onDelete={() => { onBlocksChange(blocks.filter(b => b.id !== block.id)); onSelect(null) }}
                  onDuplicate={() => {
                    const copy: SoneBlock = {
                      ...block,
                      props: { ...block.props },
                      id: `b${Date.now()}`, x: block.x + 20, y: block.y + 20,
                    }
                    onBlocksChange([...blocks, copy])
                    onSelect(copy.id)
                  }}
                />
              )}

              {/* Content: sone-rendered canvas, or overlay editor while editing */}
              {isEditing ? (
                <OverlayEditor
                  block={block}
                  pageFont={doc.font}
                  onCommit={updated => { onBlockChange(updated); stopEditing() }}
                  onCancel={stopEditing}
                />
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

// ── SoneBlockView: render one block through sone to a canvas ─────────────────

function SoneBlockView({ block, pageFont, fontsReady }: {
  block: SoneBlock
  pageFont: string
  fontsReady: boolean
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  // Content identity: x/y don't affect the rendered pixels, so exclude them
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

// ── OverlayEditor: Figma-style double-click text editing ─────────────────────

function OverlayEditor({ block, pageFont, onCommit, onCancel }: {
  block: SoneBlock
  pageFont: string
  onCommit: (updated: SoneBlock) => void
  onCancel: () => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const isList = block.type === 'list'
  const p = block.props as TextProps & ListProps
  const initial = isList ? (p.items ?? []).join('\n') : (p.text ?? '')

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px` }
    fit()
    ta.addEventListener('input', fit)
    return () => ta.removeEventListener('input', fit)
  }, [])

  const commit = () => {
    const value = taRef.current?.value ?? initial
    if (isList) {
      const items = value.split('\n').map(s => s.trim()).filter(Boolean)
      onCommit({ ...block, props: { ...p, items: items.length ? items : ['Item'] } })
    } else {
      onCommit({ ...block, props: { ...p, text: value } })
    }
  }

  return (
    <textarea
      ref={taRef}
      defaultValue={initial}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
      }}
      onMouseDown={e => e.stopPropagation()}
      style={{
        display: 'block',
        width: block.w > 0 ? block.w : 200,
        border: 'none', outline: 'none', resize: 'none',
        background: 'rgba(88,166,255,0.06)',
        padding: 0, margin: 0, overflow: 'hidden',
        fontFamily: `'${p.font || pageFont}', sans-serif`,
        fontSize: p.size ?? 13,
        color: p.color ?? '#333',
        fontWeight: !isList && p.weight === 'bold' ? 700 : 400,
        textAlign: !isList ? (p.align ?? 'left') : 'left',
        lineHeight: !isList && p.lineHeight > 0 ? p.lineHeight : 1.4,
      }}
    />
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

function ResizeHandles({ dirs, onMouseDown }: {
  dirs: ResizeDir[]
  onMouseDown: (dir: ResizeDir, e: React.MouseEvent) => void
}) {
  return (
    <>
      {dirs.map(dir => (
        <div
          key={dir}
          data-rh={dir}
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
      {canEdit && (
        <ToolBtn title="Edit text" onClick={onEdit}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </ToolBtn>
      )}
      <ToolBtn title="Duplicate (offset +20px)" onClick={onDuplicate}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <rect x="3.5" y="1" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1"/>
          <rect x="1" y="3.5" width="6.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1" fill="#161b22"/>
        </svg>
      </ToolBtn>
      <ToolBtn title="Delete" onClick={onDelete}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1.5 3h8M4 3V1.5h3V3M4.5 5v3.5M6.5 5v3.5M2.5 3l.5 6.5h5L9 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </ToolBtn>
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
