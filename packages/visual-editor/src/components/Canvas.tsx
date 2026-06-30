import { useRef, useState, useEffect } from 'react'
import type { Block, ParsedDoc } from '../types'
import { reorderBlocks, getRootStyles } from '../lib/blocks'

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

export default function Canvas({
  doc, blocks, selectedId, onSelect, onBlocksChange, onBlockChange, paperWidth = 794,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const rootStyles = getRootStyles(doc.openTag)
  const reactStyle: React.CSSProperties = {}
  for (const [k, v] of Object.entries(rootStyles)) {
    const camel = k.replace(/-([a-z])/g, (_, l) => l.toUpperCase())
    ;(reactStyle as Record<string, string>)[camel] = v as string
  }

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    onBlocksChange(reorderBlocks(blocks, dragIdx, toIdx))
    setDragIdx(null)
    setOverIdx(null)
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
          const isOver = overIdx === i && dragIdx !== i
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
                setOverIdx(i)
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverIdx(null)
              }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
              onMouseEnter={() => setHoverId(block.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={e => { e.stopPropagation(); if (!isEditing) onSelect(block.id) }}
              onDoubleClick={e => {
                e.stopPropagation()
                if (EDITABLE_TAGS.has(block.tagName)) {
                  onSelect(block.id)
                  setEditingId(block.id)
                }
              }}
              style={{
                position: 'relative',
                opacity: dragIdx === i ? 0.25 : 1,
                outline: isSelected
                  ? '2px solid #58a6ff'
                  : isOver
                  ? '2px solid #58a6ff'
                  : hoverId === block.id && !isSelected
                  ? '1px dashed #484f58'
                  : 'none',
                outlineOffset: isSelected ? 1 : 2,
                transition: 'opacity 0.1s',
                cursor: isEditing ? 'text' : 'default',
              }}
            >
              {/* Drop indicator */}
              {isOver && (
                <div style={{
                  position: 'absolute', top: -2, left: -8, right: -8, height: 2,
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
                  canEdit={EDITABLE_TAGS.has(block.tagName)}
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

              <EditableBlock
                block={block}
                isEditing={isEditing}
                onStopEdit={stopEditing}
                onBlockChange={onBlockChange ?? (() => {})}
              />
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
