import { useRef, useState, useEffect } from 'react'
import type { Block, ParsedDoc } from '../types'
import {
  reorderBlocks, getRootStyles, makeFlexRow,
  isFlexRow, getFlexColumns, setFlexColumns, getBlockStyles,
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

type DropEdge = { idx: number; side: 'top' | 'bottom' | 'left' | 'right' }

export default function Canvas({
  doc, blocks, selectedId, onSelect, onBlocksChange, onBlockChange, paperWidth = 794,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropEdge, setDropEdge] = useState<DropEdge | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const rootStyles = getRootStyles(doc.openTag)
  const reactStyle: React.CSSProperties = {}
  for (const [k, v] of Object.entries(rootStyles)) {
    const camel = k.replace(/-([a-z])/g, (_, l) => l.toUpperCase())
    ;(reactStyle as Record<string, string>)[camel] = v as string
  }

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || !dropEdge) return
    const { side } = dropEdge
    if (side === 'left' || side === 'right') {
      const leftBlock  = side === 'left'  ? blocks[toIdx] : blocks[dragIdx]
      const rightBlock = side === 'left'  ? blocks[dragIdx] : blocks[toIdx]
      const row = makeFlexRow(leftBlock, rightBlock)
      const insertAt = Math.min(dragIdx, toIdx)
      const next = blocks.filter((_, i) => i !== dragIdx && i !== toIdx)
      next.splice(insertAt, 0, row)
      onBlocksChange(next)
    } else {
      if (dragIdx !== toIdx) onBlocksChange(reorderBlocks(blocks, dragIdx, toIdx))
    }
    setDragIdx(null)
    setDropEdge(null)
  }

  const stopEditing = () => setEditingId(null)

  return (
    <div
      style={{ position: 'relative', marginLeft: 40 }}
      onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
    >
      <div
        style={{
          width: paperWidth,
          background: 'white',
          boxSizing: 'border-box',
          boxShadow: '0 0 0 1px #21262d, 0 8px 40px rgba(0,0,0,0.6)',
          borderRadius: 2,
          minHeight: 60,
          ...reactStyle,
        }}
        onClick={e => { if (e.target === e.currentTarget) { onSelect(null); stopEditing() } }}
      >
        {blocks.map((block, i) => {
          const isSelected = block.id === selectedId
          const isEditing = block.id === editingId
          const flexRow = isFlexRow(block)
          const edge = dropEdge?.idx === i && dragIdx !== i ? dropEdge.side : null
          const isOverV = edge === 'top' || edge === 'bottom'
          const isOverH = edge === 'left' || edge === 'right'
          return (
            <div
              key={block.id}
              draggable={!editingId}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move'
                setDragIdx(i)
              }}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                const relX = (e.clientX - rect.left) / rect.width
                const relY = (e.clientY - rect.top) / rect.height
                let side: DropEdge['side']
                if (relX < 0.25) side = 'left'
                else if (relX > 0.75) side = 'right'
                else side = relY < 0.5 ? 'top' : 'bottom'
                setDropEdge({ idx: i, side })
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropEdge(null)
              }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setDropEdge(null) }}
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
                opacity: dragIdx === i ? 0.25 : 1,
                outline: isSelected
                  ? '2px solid #58a6ff'
                  : (isOverV || isOverH)
                  ? '2px solid #58a6ff'
                  : hoverId === block.id && !isSelected
                  ? '1px dashed #484f58'
                  : 'none',
                outlineOffset: isSelected ? 1 : 2,
                transition: 'opacity 0.1s',
                cursor: isEditing ? 'text' : 'default',
              }}
            >
              {/* Drop indicator — horizontal (top/bottom reorder) */}
              {isOverV && (
                <div style={{
                  position: 'absolute',
                  top: edge === 'top' ? -2 : undefined,
                  bottom: edge === 'bottom' ? -2 : undefined,
                  left: -8, right: -8, height: 2,
                  background: '#58a6ff', borderRadius: 1, zIndex: 20, pointerEvents: 'none',
                }} />
              )}

              {/* Drop indicator — vertical (left/right merge) */}
              {isOverH && (
                <div style={{
                  position: 'absolute',
                  left: edge === 'left' ? -2 : undefined,
                  right: edge === 'right' ? -2 : undefined,
                  top: -8, bottom: -8, width: 2,
                  background: '#58a6ff', borderRadius: 1, zIndex: 20, pointerEvents: 'none',
                }} />
              )}

              {/* Drag handle */}
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

              {/* Selected toolbar */}
              {isSelected && !isEditing && (
                <BlockToolbar
                  canEdit={!flexRow && EDITABLE_TAGS.has(block.tagName)}
                  onEdit={() => setEditingId(block.id)}
                  onDelete={() => {
                    onBlocksChange(blocks.filter(b => b.id !== block.id))
                    onSelect(null)
                  }}
                  onDuplicate={() => {
                    const copy = { ...block, id: `b${Date.now()}` }
                    const next = [...blocks]
                    next.splice(i + 1, 0, copy)
                    onBlocksChange(next)
                    onSelect(copy.id)
                  }}
                />
              )}

              {flexRow ? (
                <FlexRowContent
                  block={block}
                  onBlockChange={onBlockChange ?? (() => {})}
                />
              ) : (
                <EditableBlock
                  block={block}
                  isEditing={isEditing}
                  onStopEdit={stopEditing}
                  onBlockChange={onBlockChange ?? (() => {})}
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
  )
}

// ── FlexRowContent ─────────────────────────────────────────────────────────────

function FlexRowContent({ block, onBlockChange }: {
  block: Block
  onBlockChange: (updated: Block) => void
}) {
  const [dragCol, setDragCol] = useState<number | null>(null)
  const [overCol, setOverCol] = useState<number | null>(null)
  const [editingCol, setEditingCol] = useState<number | null>(null)

  const columns = getFlexColumns(block)

  const blockStyles = getBlockStyles(block)
  const outerStyle: React.CSSProperties = { display: 'flex', gap: 16, alignItems: 'flex-start' }
  if (blockStyles['margin-bottom']) outerStyle.marginBottom = blockStyles['margin-bottom']
  if (blockStyles['margin-top'])    outerStyle.marginTop    = blockStyles['margin-top']

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const htmls = columns.map(c => c.html)
    const [moved] = htmls.splice(from, 1)
    htmls.splice(to, 0, moved)
    onBlockChange(setFlexColumns(block, htmls))
  }

  const saveCol = (idx: number, html: string) => {
    const htmls = columns.map((c, i) => i === idx ? html : c.html)
    onBlockChange(setFlexColumns(block, htmls))
    setEditingCol(null)
  }

  return (
    <div style={outerStyle}>
      {columns.map((col, i) => (
        <ColSlot
          key={i}
          idx={i}
          colHtml={col.html}
          isDragging={dragCol === i}
          isOver={overCol === i && dragCol !== i}
          isEditing={editingCol === i}
          onDragStart={e => { e.stopPropagation(); setDragCol(i) }}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOverCol(i) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
          onDrop={e => { e.stopPropagation(); if (dragCol !== null) reorder(dragCol, i); setDragCol(null); setOverCol(null) }}
          onDragEnd={() => { setDragCol(null); setOverCol(null) }}
          onDoubleClick={e => { e.stopPropagation(); setEditingCol(i) }}
          onSaveEdit={html => saveCol(i, html)}
          onCancelEdit={() => setEditingCol(null)}
        />
      ))}
    </div>
  )
}

// ── ColSlot ────────────────────────────────────────────────────────────────────

function ColSlot({
  idx, colHtml, isDragging, isOver, isEditing,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  onDoubleClick, onSaveEdit, onCancelEdit,
}: {
  idx: number
  colHtml: string
  isDragging: boolean
  isOver: boolean
  isEditing: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDoubleClick: (e: React.MouseEvent) => void
  onSaveEdit: (html: string) => void
  onCancelEdit: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const divRef = useRef<HTMLDivElement>(null)
  const htmlRef = useRef(colHtml)
  htmlRef.current = colHtml

  useEffect(() => {
    if (!isEditing || !divRef.current) return
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
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        flex: 1, position: 'relative',
        opacity: isDragging ? 0.25 : 1,
        outline: isOver ? '2px dashed #58a6ff' : isEditing ? '2px solid #1f6feb' : 'none',
        outlineOffset: 2,
        cursor: isEditing ? 'text' : 'default',
      }}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onDoubleClick}
    >
      {/* Column drop indicator */}
      {isOver && (
        <div style={{
          position: 'absolute', left: -2, top: 0, bottom: 0, width: 2,
          background: '#58a6ff', zIndex: 20, pointerEvents: 'none',
        }} />
      )}

      {/* Column drag handle */}
      {!isEditing && hovered && (
        <div
          title={`Column ${idx + 1} — drag to reorder`}
          style={{
            position: 'absolute', top: 2, right: 2, zIndex: 15,
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#161b22', border: '1px solid #30363d', borderRadius: 3,
            cursor: 'grab', color: '#58a6ff', pointerEvents: 'none',
          }}
        >
          <svg width="6" height="8" viewBox="0 0 6 8" fill="currentColor">
            <circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/>
            <circle cx="1.5" cy="4"   r="1"/><circle cx="4.5" cy="4"   r="1"/>
            <circle cx="1.5" cy="6.5" r="1"/><circle cx="4.5" cy="6.5" r="1"/>
          </svg>
        </div>
      )}

      {/* Editing hint */}
      {isEditing && (
        <div style={{
          position: 'absolute', top: -20, left: 0, zIndex: 30,
          background: '#1f6feb', borderRadius: 4, padding: '1px 6px',
          fontSize: 9, color: '#fff', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          Esc to save
        </div>
      )}

      {isEditing ? (
        <div
          ref={divRef}
          onBlur={e => {
            if (divRef.current?.contains(e.relatedTarget as Node)) return
            const inner = divRef.current?.firstElementChild as HTMLElement | null
            if (inner) {
              inner.removeAttribute('contenteditable')
              inner.style.removeProperty('outline')
              onSaveEdit(inner.outerHTML)
            } else {
              onCancelEdit()
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); onCancelEdit() }
          }}
        />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: colHtml }} />
      )}
    </div>
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

  if (!isEditing) {
    return <div dangerouslySetInnerHTML={{ __html: block.html }} />
  }

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
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onStopEdit() }
      }}
    />
  )
}

// ── BlockToolbar ──────────────────────────────────────────────────────────────

function BlockToolbar({ canEdit, onEdit, onDelete, onDuplicate }: {
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: -30, right: 0, zIndex: 30,
      display: 'flex', gap: 2,
      background: '#161b22', border: '1px solid #30363d',
      borderRadius: 5, padding: '2px 4px',
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
