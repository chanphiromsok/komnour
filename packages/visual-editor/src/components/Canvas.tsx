import { useRef, useState, type DragEvent } from 'react'
import type { Block, ParsedDoc } from '../types'
import { reorderBlocks } from '../lib/blocks'
import { getRootStyles } from '../lib/blocks'

interface Props {
  doc: ParsedDoc
  blocks: Block[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onBlocksChange: (blocks: Block[]) => void
}

export default function Canvas({ doc, blocks, selectedId, onSelect, onBlocksChange }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const rootStyles = getRootStyles(doc.openTag)
  const reactStyle: React.CSSProperties = {}
  for (const [k, v] of Object.entries(rootStyles)) {
    const camel = k.replace(/-([a-z])/g, (_, l) => l.toUpperCase())
    ;(reactStyle as Record<string, string>)[camel] = v
  }

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) return
    onBlocksChange(reorderBlocks(blocks, dragIdx, toIdx))
    setDragIdx(null)
    setOverIdx(null)
  }

  return (
    <div
      style={{ position: 'relative', marginLeft: 40 }}
      onClick={e => { if (e.target === e.currentTarget) onSelect(null) }}
    >
      {/* 794px paper */}
      <div
        style={{
          width: 794,
          background: 'white',
          boxSizing: 'border-box',
          boxShadow: '0 0 0 1px #21262d, 0 8px 40px rgba(0,0,0,0.6)',
          borderRadius: 2,
          minHeight: 60,
          ...reactStyle,
        }}
        onClick={e => { if (e.target === e.currentTarget) onSelect(null) }}
      >
        {blocks.map((block, i) => {
          const isSelected = block.id === selectedId
          const isOver = overIdx === i && dragIdx !== i
          return (
            <div
              key={block.id}
              draggable
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
              onClick={e => { e.stopPropagation(); onSelect(block.id) }}
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
                cursor: 'default',
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
              {(hoverId === block.id || isSelected) && (
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

              {/* Selected toolbar: delete + duplicate */}
              {isSelected && (
                <BlockToolbar
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

              <div dangerouslySetInnerHTML={{ __html: block.html }} />
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

function BlockToolbar({ onDelete, onDuplicate }: { onDelete: () => void; onDuplicate: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: -30, right: 0, zIndex: 30,
      display: 'flex', gap: 2,
      background: '#161b22', border: '1px solid #30363d',
      borderRadius: 5, padding: '2px 4px',
    }}>
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
