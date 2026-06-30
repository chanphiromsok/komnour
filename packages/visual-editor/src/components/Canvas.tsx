import { useRef, useState, useEffect } from 'react'
import type { Block, ParsedDoc } from '../types'
import {
  reorderBlocks, getRootStyles, makeFlexRow,
  isFlexRow, getFlexColumns, setFlexColumns,
} from '../lib/blocks'

interface Props {
  doc: ParsedDoc
  blocks: Block[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onBlocksChange: (blocks: Block[]) => void
  onBlockChange?: (updated: Block) => void
  paperWidth?: number
}

const EDITABLE_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'ul', 'ol', 'label'])

type DropSide = 'top' | 'bottom' | 'left' | 'right'
type DropTarget = { idx: number; side: DropSide }
type BlockDrag = { idx: number; html: string; x: number; y: number }

export default function Canvas({
  doc, blocks, selectedId, onSelect, onBlocksChange, onBlockChange, paperWidth = 794,
}: Props) {
  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [drag, setDrag]           = useState<BlockDrag | null>(null)
  const [drop, setDrop]           = useState<DropTarget | null>(null)

  // Refs avoid stale closures inside document listeners
  const dragRef   = useRef<BlockDrag | null>(null)
  const dropRef   = useRef<DropTarget | null>(null)
  const blocksRef = useRef(blocks)
  const onChangeRef = useRef(onBlocksChange)
  const blockEls  = useRef<(HTMLDivElement | null)[]>([])
  blocksRef.current = blocks
  onChangeRef.current = onBlocksChange

  const rootStyles = getRootStyles(doc.openTag)
  const reactStyle: React.CSSProperties = {}
  for (const [k, v] of Object.entries(rootStyles)) {
    const camel = k.replace(/-([a-z])/g, (_, l) => l.toUpperCase())
    ;(reactStyle as Record<string, string>)[camel] = v as string
  }

  // Mouse-based drag (starts from drag handle onMouseDown)
  useEffect(() => {
    if (!drag) return

    const onMove = (e: MouseEvent) => {
      const next: BlockDrag = { ...dragRef.current!, x: e.clientX, y: e.clientY }
      dragRef.current = next
      setDrag({ ...next })

      let found: DropTarget | null = null
      for (let i = 0; i < blockEls.current.length; i++) {
        if (i === dragRef.current.idx) continue
        const el = blockEls.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right) continue
        if (e.clientY < r.top - 10 || e.clientY > r.bottom + 10) continue
        const relX = (e.clientX - r.left) / r.width
        const relY = (e.clientY - r.top) / r.height
        const side: DropSide = relX < 0.25 ? 'left' : relX > 0.75 ? 'right' : relY < 0.5 ? 'top' : 'bottom'
        found = { idx: i, side }
        break
      }
      dropRef.current = found
      setDrop(found)
    }

    const onUp = () => {
      const d  = dragRef.current
      const dp = dropRef.current
      const blks = blocksRef.current
      if (d && dp) {
        const { idx: from } = d
        const { idx: to, side } = dp
        if (side === 'left' || side === 'right') {
          const lb = side === 'left' ? blks[to] : blks[from]
          const rb = side === 'left' ? blks[from] : blks[to]
          const row = makeFlexRow(lb, rb)
          const at = Math.min(from, to)
          const next = blks.filter((_, i) => i !== from && i !== to)
          next.splice(at, 0, row)
          onChangeRef.current(next)
        } else {
          let ti = side === 'bottom' ? to + 1 : to
          if (from < ti) ti--
          if (from !== ti) onChangeRef.current(reorderBlocks(blks, from, ti))
        }
      }
      dragRef.current = null
      dropRef.current = null
      setDrag(null)
      setDrop(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [!!drag]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopEditing = () => setEditingId(null)

  return (
    <>
      {/* Floating drag ghost (outside zoom transform) */}
      {drag && (
        <div style={{
          position: 'fixed', left: drag.x + 14, top: drag.y - 14,
          pointerEvents: 'none', zIndex: 9999,
          maxWidth: paperWidth * 0.6, overflow: 'hidden',
          opacity: 0.85, transform: 'scale(0.8)', transformOrigin: 'top left',
          background: 'white', border: '2px solid #58a6ff', borderRadius: 4,
          padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }} dangerouslySetInnerHTML={{ __html: drag.html }} />
      )}

      <div
        style={{ position: 'relative', marginLeft: 40 }}
        onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
      >
        <div
          style={{
            width: paperWidth, background: 'white', boxSizing: 'border-box',
            boxShadow: '0 0 0 1px #21262d, 0 8px 40px rgba(0,0,0,0.6)',
            borderRadius: 2, minHeight: 60, ...reactStyle,
          }}
          onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
        >
          {blocks.map((block, i) => {
            const isSelected = block.id === selectedId
            const isEditing  = block.id === editingId
            const flexRow    = isFlexRow(block)
            const dropHere   = drop?.idx === i
            const side       = dropHere ? drop!.side : null
            const isDragging = drag?.idx === i

            return (
              <div
                key={block.id}
                ref={el => { blockEls.current[i] = el }}
                onMouseEnter={() => setHoverId(block.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={e => { e.stopPropagation(); if (!isEditing) onSelect(block.id) }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  if (!flexRow && EDITABLE_TAGS.has(block.tagName)) {
                    onSelect(block.id)
                    setEditingId(block.id)
                  }
                }}
                style={{
                  position: 'relative',
                  opacity: isDragging ? 0.25 : 1,
                  outline: isSelected
                    ? '2px solid #58a6ff'
                    : dropHere
                    ? '2px solid #58a6ff'
                    : hoverId === block.id && !isSelected
                    ? '1px dashed #484f58'
                    : 'none',
                  outlineOffset: isSelected ? 1 : 2,
                  transition: 'opacity 0.1s',
                  cursor: isEditing ? 'text' : 'default',
                }}
              >
                {/* Drop indicators */}
                {dropHere && (side === 'top' || side === 'bottom') && (
                  <div style={{
                    position: 'absolute',
                    top: side === 'top' ? -2 : undefined,
                    bottom: side === 'bottom' ? -2 : undefined,
                    left: -8, right: -8, height: 2,
                    background: '#58a6ff', borderRadius: 1, zIndex: 20, pointerEvents: 'none',
                  }} />
                )}
                {dropHere && (side === 'left' || side === 'right') && (
                  <div style={{
                    position: 'absolute',
                    left: side === 'left' ? -2 : undefined,
                    right: side === 'right' ? -2 : undefined,
                    top: -8, bottom: -8, width: 2,
                    background: '#58a6ff', borderRadius: 1, zIndex: 20, pointerEvents: 'none',
                  }} />
                )}

                {/* Block drag handle */}
                {!isEditing && (hoverId === block.id || isSelected) && (
                  <div
                    title="Drag to reorder"
                    style={{
                      position: 'absolute', left: -32, top: '50%', transform: 'translateY(-50%)',
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'grab', color: '#484f58',
                      background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
                      zIndex: 10, userSelect: 'none',
                    }}
                    onMouseDown={e => {
                      e.preventDefault()
                      const state: BlockDrag = { idx: i, html: block.html, x: e.clientX, y: e.clientY }
                      dragRef.current = state
                      setDrag(state)
                    }}
                  >
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                      <circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/>
                      <circle cx="2" cy="6" r="1.3"/><circle cx="6" cy="6" r="1.3"/>
                      <circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>
                    </svg>
                  </div>
                )}

                {/* Editing hint */}
                {isEditing && (
                  <div style={{
                    position: 'absolute', top: -24, left: 0, zIndex: 30,
                    background: '#1f6feb', borderRadius: 4, padding: '2px 8px',
                    fontSize: 10, color: '#fff', pointerEvents: 'none', whiteSpace: 'nowrap',
                  }}>
                    Editing — click outside or Esc to save
                  </div>
                )}

                {/* Block toolbar */}
                {isSelected && !isEditing && (
                  <BlockToolbar
                    canEdit={!flexRow && EDITABLE_TAGS.has(block.tagName)}
                    onEdit={() => setEditingId(block.id)}
                    onDelete={() => { onBlocksChange(blocks.filter(b => b.id !== block.id)); onSelect(null) }}
                    onDuplicate={() => {
                      const copy = { ...block, id: `b${Date.now()}` }
                      const next = [...blocks]; next.splice(i + 1, 0, copy)
                      onBlocksChange(next); onSelect(copy.id)
                    }}
                  />
                )}

                {flexRow ? (
                  <FlexRowContent block={block} onBlockChange={onBlockChange ?? (() => {})} />
                ) : (
                  <EditableBlock
                    block={block} isEditing={isEditing}
                    onStopEdit={stopEditing} onBlockChange={onBlockChange ?? (() => {})}
                  />
                )}
              </div>
            )
          })}

          {blocks.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              No blocks yet. Add one from the toolbar.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── FlexRowContent ─────────────────────────────────────────────────────────────

type ColDrag = { colIdx: number; html: string; x: number; y: number }

function FlexRowContent({ block, onBlockChange }: {
  block: Block
  onBlockChange: (updated: Block) => void
}) {
  const [colDrag, setColDrag]   = useState<ColDrag | null>(null)
  const [colDrop, setColDrop]   = useState<number | null>(null)
  const [editingCol, setEditingCol] = useState<number | null>(null)

  const colDragRef  = useRef<ColDrag | null>(null)
  const colDropRef  = useRef<number | null>(null)
  const blockRef    = useRef(block)
  const onChangeRef = useRef(onBlockChange)
  const colEls      = useRef<(HTMLDivElement | null)[]>([])
  blockRef.current    = block
  onChangeRef.current = onBlockChange

  const columns = getFlexColumns(block)

  useEffect(() => {
    if (!colDrag) return

    const onMove = (e: MouseEvent) => {
      const next: ColDrag = { ...colDragRef.current!, x: e.clientX, y: e.clientY }
      colDragRef.current = next
      setColDrag({ ...next })

      let found: number | null = null
      for (let i = 0; i < colEls.current.length; i++) {
        if (i === colDragRef.current.colIdx) continue
        const el = colEls.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left - 12 && e.clientX <= r.right + 12) {
          found = i; break
        }
      }
      colDropRef.current = found
      setColDrop(found)
    }

    const onUp = () => {
      const d  = colDragRef.current
      const to = colDropRef.current
      if (d && to !== null && d.colIdx !== to) {
        const cols = getFlexColumns(blockRef.current)
        const htmls = cols.map(c => c.html)
        const [moved] = htmls.splice(d.colIdx, 1)
        htmls.splice(to, 0, moved)
        onChangeRef.current(setFlexColumns(blockRef.current, htmls))
      }
      colDragRef.current = null
      colDropRef.current = null
      setColDrag(null)
      setColDrop(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [!!colDrag]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Column ghost */}
      {colDrag && (
        <div style={{
          position: 'fixed', left: colDrag.x + 10, top: colDrag.y - 10,
          pointerEvents: 'none', zIndex: 9999,
          maxWidth: 220, overflow: 'hidden',
          opacity: 0.85, transform: 'scale(0.8)', transformOrigin: 'top left',
          background: 'white', border: '2px solid #58a6ff', borderRadius: 4,
          padding: 4, boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        }} dangerouslySetInnerHTML={{ __html: colDrag.html }} />
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {columns.map((col, i) => (
          <div
            key={i}
            ref={el => { colEls.current[i] = el }}
            style={{
              flex: 1, position: 'relative',
              opacity: colDrag?.colIdx === i ? 0.25 : 1,
              outline: colDrop === i && colDrag?.colIdx !== i ? '2px dashed #58a6ff' : 'none',
              outlineOffset: 2,
            }}
          >
            {/* Column drop indicator */}
            {colDrop === i && colDrag?.colIdx !== i && (
              <div style={{
                position: 'absolute', left: -2, top: 0, bottom: 0, width: 2,
                background: '#58a6ff', zIndex: 20, pointerEvents: 'none',
              }} />
            )}

            {/* Column drag handle */}
            <div
              title={`Column ${i + 1} — drag to reorder`}
              style={{
                position: 'absolute', top: 2, right: 2, zIndex: 15,
                width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#161b22', border: '1px solid #30363d', borderRadius: 3,
                cursor: 'grab', color: '#58a6ff', userSelect: 'none',
              }}
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                const state: ColDrag = { colIdx: i, html: col.html, x: e.clientX, y: e.clientY }
                colDragRef.current = state
                setColDrag(state)
              }}
            >
              <svg width="6" height="8" viewBox="0 0 6 8" fill="currentColor">
                <circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/>
                <circle cx="1.5" cy="4"   r="1"/><circle cx="4.5" cy="4"   r="1"/>
                <circle cx="1.5" cy="6.5" r="1"/><circle cx="4.5" cy="6.5" r="1"/>
              </svg>
            </div>

            {editingCol === i ? (
              <ColEditor
                html={col.html}
                onSave={html => {
                  const htmls = columns.map((c, ci) => ci === i ? html : c.html)
                  onBlockChange(setFlexColumns(block, htmls))
                  setEditingCol(null)
                }}
                onCancel={() => setEditingCol(null)}
              />
            ) : (
              <div
                style={{ minHeight: 20 }}
                onDoubleClick={e => { e.stopPropagation(); setEditingCol(i) }}
                dangerouslySetInnerHTML={{ __html: col.html }}
              />
            )}
          </div>
        ))}
      </div>
    </>
  )
}

// ── ColEditor ─────────────────────────────────────────────────────────────────

function ColEditor({ html, onSave, onCancel }: {
  html: string
  onSave: (html: string) => void
  onCancel: () => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const htmlRef = useRef(html)

  useEffect(() => {
    if (!divRef.current) return
    const tmpDoc = new DOMParser().parseFromString(htmlRef.current, 'text/html')
    const inner = tmpDoc.body.firstElementChild as HTMLElement | null
    if (!inner) return
    inner.contentEditable = 'true'
    inner.style.outline = 'none'
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div style={{
        position: 'absolute', top: -18, left: 0, zIndex: 30,
        background: '#1f6feb', borderRadius: 4, padding: '1px 6px',
        fontSize: 9, color: '#fff', pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>Esc to save</div>
      <div
        ref={divRef}
        onBlur={e => {
          if (divRef.current?.contains(e.relatedTarget as Node)) return
          const inner = divRef.current?.firstElementChild as HTMLElement | null
          if (inner) {
            inner.removeAttribute('contenteditable')
            inner.style.removeProperty('outline')
            onSave(inner.outerHTML)
          } else onCancel()
        }}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
      />
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
  const divRef = useRef<HTMLDivElement>(null)
  const blockHtmlRef = useRef(block.html)
  blockHtmlRef.current = block.html

  useEffect(() => {
    if (!isEditing || !divRef.current) return
    const tmpDoc = new DOMParser().parseFromString(blockHtmlRef.current, 'text/html')
    const inner = tmpDoc.body.firstElementChild as HTMLElement | null
    if (!inner) return
    inner.contentEditable = 'true'
    inner.style.outline = 'none'
    divRef.current.innerHTML = ''
    divRef.current.appendChild(inner)
    inner.focus()
    try {
      const range = document.createRange()
      range.selectNodeContents(inner)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
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
      position: 'absolute', top: -30, right: 0, zIndex: 30,
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
      <ToolBtn title="Duplicate" onClick={onDuplicate}>
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
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#7d8590', padding: '3px 5px', borderRadius: 3, display: 'flex', alignItems: 'center',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = '#f85149')}
      onMouseLeave={e => (e.currentTarget.style.color = '#7d8590')}
    >
      {children}
    </button>
  )
}
