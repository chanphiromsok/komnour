import { useRef, useState, useEffect } from 'react'
import type { Block, ParsedDoc } from '../types'
import { getRootStyles } from '../lib/blocks'

interface Props {
  doc: ParsedDoc
  blocks: Block[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onBlocksChange: (blocks: Block[]) => void
  onBlockChange?: (updated: Block) => void
  paperWidth?: number
  paperHeight?: number
}

const EDITABLE_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'ul', 'ol', 'label'])
type ResizeDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

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
  doc, blocks, selectedId, onSelect, onBlocksChange, onBlockChange,
  paperWidth = 794, paperHeight = 1123,
}: Props) {
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [op, setOp]               = useState<Op | null>(null)

  const opRef           = useRef<Op | null>(null)
  const blocksRef       = useRef(blocks)
  const onBlocksRef     = useRef(onBlocksChange)
  const onBlockRef      = useRef(onBlockChange)
  const wrapperRefs     = useRef(new Map<string, HTMLDivElement>())
  blocksRef.current     = blocks
  onBlocksRef.current   = onBlocksChange
  onBlockRef.current    = onBlockChange

  const rootStyles = getRootStyles(doc.openTag)
  const artStyle: React.CSSProperties = {
    position: 'relative',
    width: paperWidth,
    height: paperHeight,
    background: rootStyles['background-color'] ?? rootStyles['background'] ?? 'white',
    fontFamily: rootStyles['font-family'] ?? undefined,
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
      if (el) {
        const x = parseFloat(el.style.left)   || 0
        const y = parseFloat(el.style.top)    || 0
        const w = parseFloat(el.style.width)  || 0
        const h = parseFloat(el.style.height) || 0
        const blk = blocksRef.current.find(b => b.id === o.blockId)
        onBlocksRef.current(
          blocksRef.current.map(b => b.id === o.blockId
            ? { ...b, x, y, w: w || blk?.w || 0, h: h || blk?.h || 0 }
            : b
          )
        )
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

  const startMove = (e: React.MouseEvent, block: Block) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = wrapperRefs.current.get(block.id)
    if (!el) return
    const o: Op = {
      kind: 'move', blockId: block.id,
      startMx: e.clientX, startMy: e.clientY,
      origX: block.x, origY: block.y,
      origW: el.offsetWidth, origH: el.offsetHeight,
      scale: getScale(el),
    }
    opRef.current = o
    setOp(o)
  }

  const startResize = (e: React.MouseEvent, block: Block, dir: ResizeDir) => {
    e.stopPropagation()
    e.preventDefault()
    const el = wrapperRefs.current.get(block.id)
    if (!el) return
    const o: Op = {
      kind: 'resize', blockId: block.id, dir,
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
                width:  block.w || undefined,
                height: block.h || undefined,
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
                if (!isEditing) startMove(e, block)
              }}
              onClick={e => { e.stopPropagation(); if (!isEditing) onSelect(block.id) }}
              onDoubleClick={e => {
                e.stopPropagation()
                if (EDITABLE_TAGS.has(block.tagName)) { onSelect(block.id); setEditingId(block.id) }
              }}
            >
              {/* Resize handles */}
              {isSelected && !isEditing && (
                <ResizeHandles onMouseDown={(dir, e) => startResize(e, block, dir)} />
              )}

              {/* Block toolbar */}
              {isSelected && !isEditing && (
                <BlockToolbar
                  canEdit={EDITABLE_TAGS.has(block.tagName)}
                  onEdit={() => setEditingId(block.id)}
                  onDelete={() => { onBlocksChange(blocks.filter(b => b.id !== block.id)); onSelect(null) }}
                  onDuplicate={() => {
                    const copy: Block = { ...block, id: `b${Date.now()}`, x: block.x + 20, y: block.y + 20 }
                    onBlocksChange([...blocks, copy])
                    onSelect(copy.id)
                  }}
                />
              )}

              {/* Content */}
              <EditableBlock
                block={block}
                isEditing={isEditing}
                onStopEdit={stopEditing}
                onBlockChange={onBlockRef.current ?? (() => {})}
              />
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

// ── Resize logic ──────────────────────────────────────────────────────────────

function applyResize(el: HTMLElement, o: Op, dx: number, dy: number) {
  if (!o.dir) return
  let x = o.origX, y = o.origY, w = o.origW, h = o.origH

  if (o.dir.includes('e')) w = Math.max(30, o.origW + dx)
  if (o.dir.includes('s')) h = Math.max(20, o.origH + dy)
  if (o.dir.includes('w')) { x = o.origX + dx; w = Math.max(30, o.origW - dx) }
  if (o.dir.includes('n')) { y = o.origY + dy; h = Math.max(20, o.origH - dy) }

  el.style.left   = `${x}px`
  el.style.top    = `${y}px`
  el.style.width  = `${w}px`
  if (o.dir.includes('n') || o.dir.includes('s')) el.style.height = `${h}px`
}

// ── ResizeHandles ─────────────────────────────────────────────────────────────

const HANDLES: Array<{ dir: ResizeDir; style: React.CSSProperties; cursor: string }> = [
  { dir: 'nw', style: { top: -4, left: -4 },                                    cursor: 'nwse-resize' },
  { dir: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)' },  cursor: 'ns-resize'   },
  { dir: 'ne', style: { top: -4, right: -4 },                                   cursor: 'nesw-resize' },
  { dir: 'e',  style: { top: '50%', right: -4, transform: 'translateY(-50%)' }, cursor: 'ew-resize'   },
  { dir: 'se', style: { bottom: -4, right: -4 },                                cursor: 'nwse-resize' },
  { dir: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' }, cursor: 'ns-resize' },
  { dir: 'sw', style: { bottom: -4, left: -4 },                                 cursor: 'nesw-resize' },
  { dir: 'w',  style: { top: '50%', left: -4, transform: 'translateY(-50%)' },  cursor: 'ew-resize'   },
]

function ResizeHandles({ onMouseDown }: {
  onMouseDown: (dir: ResizeDir, e: React.MouseEvent) => void
}) {
  return (
    <>
      {HANDLES.map(h => (
        <div
          key={h.dir}
          data-rh={h.dir}
          onMouseDown={e => { e.stopPropagation(); onMouseDown(h.dir, e) }}
          style={{
            position: 'absolute', width: 8, height: 8,
            background: '#58a6ff', border: '1.5px solid white',
            borderRadius: 1, zIndex: 30, cursor: h.cursor,
            ...h.style,
          }}
        />
      ))}
    </>
  )
}

// ── EditableBlock ─────────────────────────────────────────────────────────────

function EditableBlock({ block, isEditing, onStopEdit, onBlockChange }: {
  block: Block
  isEditing: boolean
  onStopEdit: () => void
  onBlockChange: (updated: Block) => void
}) {
  const divRef      = useRef<HTMLDivElement>(null)
  const blockHtmlRef = useRef(block.html)
  blockHtmlRef.current = block.html

  useEffect(() => {
    if (!isEditing || !divRef.current) return
    const tmpDoc = new DOMParser().parseFromString(blockHtmlRef.current, 'text/html')
    const inner  = tmpDoc.body.firstElementChild as HTMLElement | null
    if (!inner) return
    inner.contentEditable = 'true'
    inner.style.outline   = 'none'
    divRef.current.innerHTML = ''
    divRef.current.appendChild(inner)
    inner.focus()
    try {
      const range = document.createRange()
      range.selectNodeContents(inner)
      range.collapse(false)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    } catch {}
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isEditing) return <div dangerouslySetInnerHTML={{ __html: block.html }} />

  return (
    <div
      ref={divRef}
      onBlur={e => {
        if (divRef.current?.contains(e.relatedTarget as Node)) return
        const inner = divRef.current?.firstElementChild as HTMLElement | null
        if (inner) {
          inner.removeAttribute('contenteditable')
          inner.style.removeProperty('outline')
          onBlockChange({ ...block, html: inner.outerHTML })
        }
        onStopEdit()
      }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onStopEdit() } }}
    />
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
