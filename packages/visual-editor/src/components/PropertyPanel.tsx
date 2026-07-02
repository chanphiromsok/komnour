import { useState } from 'react'
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Plus, Minus } from 'lucide-react'
import type {
  SoneBlock, VeDoc, TextProps, RectProps, LineProps, PhotoProps, ListProps,
  TableProps, TableCell, DashStyle,
} from '../types'
import { toHexColor } from '../lib/style-utils'
import { spansText } from '../lib/block-model'

const FONT_FAMILIES = ['Noto Sans Khmer', 'Inter', 'KhmerOSsiemreap', 'Kh-Siemreap', 'Khmer-OS-Muol-Light', 'Calibri', 'KhmerBursa']

interface Props {
  block: SoneBlock
  onChange: (updated: SoneBlock) => void
}

export default function PropertyPanel({ block, onChange }: Props) {
  const setProp = (patch: Record<string, unknown>) =>
    onChange({ ...block, props: { ...block.props, ...patch } as SoneBlock['props'] })

  return (
    <div style={{ overflowY: 'auto', height: '100%', fontSize: 12, color: '#c9d1d9' }}>

      <Section title="ELEMENT">
        <Row label="Type">
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '3px 8px', fontFamily: 'monospace', fontSize: 11, color: '#7d8590' }}>
            {block.type}
          </div>
        </Row>
      </Section>

      <Section title="TRANSFORM">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { lbl: 'X', val: Math.round(block.x), onChg: (v: number) => onChange({ ...block, x: v }), ph: undefined as string | undefined },
            { lbl: 'Y', val: Math.round(block.y), onChg: (v: number) => onChange({ ...block, y: v }), ph: undefined },
            { lbl: 'W', val: block.w || undefined, onChg: (v: number) => onChange({ ...block, w: v }), ph: 'auto' },
            { lbl: 'H', val: block.h || undefined, onChg: (v: number) => onChange({ ...block, h: v }), ph: 'auto' },
          ].map(({ lbl, val, onChg, ph }) => (
            <div key={lbl}>
              <div style={{ fontSize: 9, color: '#484f58', textAlign: 'center', marginBottom: 2 }}>{lbl}</div>
              <input type="number" value={val ?? ''} placeholder={ph}
                onChange={e => onChg(Number(e.target.value) || 0)}
                style={{ ...numInputStyle, width: '100%', textAlign: 'center', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        <Row label="Rotate">
          <input type="number" value={block.rotation || 0} step={1}
            onChange={e => onChange({ ...block, rotation: Number(e.target.value) || 0 })} style={numInputStyle} />
        </Row>
        <Row label="Repeat">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#7d8590', fontSize: 11 }}>
            <input type="checkbox" checked={!!block.repeat}
              onChange={e => onChange({ ...block, repeat: e.target.checked })} />
            on every page (header/footer)
          </label>
        </Row>
      </Section>

      {block.type === 'text' && <TextPanel p={block.props as TextProps} set={setProp} />}
      {block.type === 'rect' && <RectPanel p={block.props as RectProps} set={setProp} />}
      {(block.type === 'hline' || block.type === 'vline') && <LinePanel p={block.props as LineProps} set={setProp} />}
      {block.type === 'photo' && <PhotoPanel p={block.props as PhotoProps} set={setProp} />}
      {block.type === 'list' && <ListPanel p={block.props as ListProps} set={setProp} />}
      {block.type === 'table' && <TablePanel block={block} onChange={onChange} />}

    </div>
  )
}

// ── Text ────────────────────────────────────────────────────────────────────

function TextPanel({ p, set }: { p: TextProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="TYPOGRAPHY">
      <div style={{ fontSize: 10, color: '#3d444d', marginBottom: 2, lineHeight: '14px' }}>
        Double-click the block, then select text to style runs (bold / italic / underline / strike / color).
        Use <code>{'{page}'}</code>/<code>{'{pages}'}</code> for page numbers.
      </div>
      <Row label="Default"><span style={{ fontSize: 10, color: '#484f58' }}>{spansText(p.spans).slice(0, 24) || '(empty)'}</span></Row>
      <Row label="Family">
        <Select value={p.font} onChange={v => set({ font: v })}
          options={[{ value: '', label: 'page font' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]} />
      </Row>
      <Row label="Size">
        <input type="number" value={p.size} min={6} onChange={e => set({ size: Number(e.target.value) || 13 })} style={numInputStyle} />
      </Row>
      <Row label="Color"><ColorPicker value={p.color} onChange={v => set({ color: v })} /></Row>
      <Row label="Align">
        <AlignToggle value={p.align} onChange={v => set({ align: v })} withJustify />
      </Row>
      <Row label="Line-h">
        <input type="number" value={p.lineHeight || ''} placeholder="auto" step={0.1} min={0}
          onChange={e => set({ lineHeight: Number(e.target.value) || 0 })} style={numInputStyle} />
      </Row>
    </Section>
  )
}

// ── Rect / Line ───────────────────────────────────────────────────────────────

const DASH_OPTS = [
  { value: 'solid', label: 'solid' },
  { value: 'dashed', label: 'dashed' },
  { value: 'dotted', label: 'dotted' },
]

function RectPanel({ p, set }: { p: RectProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="SHAPE">
      <Row label="Fill"><ColorPicker value={p.fill} onChange={v => set({ fill: v })} /></Row>
      <Row label="Stroke"><ColorPicker value={p.stroke} onChange={v => set({ stroke: v })} /></Row>
      <Row label="Thick">
        <input type="number" value={p.strokeWidth} min={0} step={0.5} onChange={e => set({ strokeWidth: Number(e.target.value) || 0 })} style={numInputStyle} />
      </Row>
      <Row label="Dash"><Select value={p.dash} onChange={v => set({ dash: v as DashStyle })} options={DASH_OPTS} /></Row>
      <Row label="Radius">
        <input type="number" value={p.radius} min={0} onChange={e => set({ radius: Number(e.target.value) || 0 })} style={numInputStyle} />
      </Row>
    </Section>
  )
}

function LinePanel({ p, set }: { p: LineProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="LINE">
      <Row label="Color"><ColorPicker value={p.stroke} onChange={v => set({ stroke: v })} /></Row>
      <Row label="Thick">
        <input type="number" value={p.strokeWidth} min={0.5} step={0.5} onChange={e => set({ strokeWidth: Number(e.target.value) || 1 })} style={numInputStyle} />
      </Row>
      <Row label="Dash"><Select value={p.dash} onChange={v => set({ dash: v as DashStyle })} options={DASH_OPTS} /></Row>
    </Section>
  )
}

function PhotoPanel({ p, set }: { p: PhotoProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="IMAGE">
      <Row label="Src"><input type="text" value={p.src} placeholder="https://…" onChange={e => set({ src: e.target.value })} style={inputStyle} /></Row>
      <Row label="Fit">
        <Select value={p.fit} onChange={v => set({ fit: v })}
          options={[{ value: '', label: 'default' }, { value: 'cover', label: 'cover' }, { value: 'contain', label: 'contain' }, { value: 'fill', label: 'fill' }]} />
      </Row>
    </Section>
  )
}

// ── List ────────────────────────────────────────────────────────────────────

function ListPanel({ p, set }: { p: ListProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Section title="ITEMS">
        <textarea value={p.items.join('\n')}
          onChange={e => set({ items: e.target.value.split('\n') })}
          onBlur={e => set({ items: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
          rows={4} placeholder="One item per line"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '18px' }} />
      </Section>
      <Section title="STYLE">
        <Row label="Marker">
          <Select value={p.listStyle} onChange={v => set({ listStyle: v })}
            options={[
              { value: 'disc', label: '• disc' }, { value: 'circle', label: '◦ circle' },
              { value: 'square', label: '▪ square' }, { value: 'dash', label: '– dash' },
              { value: 'decimal', label: '1. decimal' }, { value: 'none', label: 'none' },
            ]} />
        </Row>
        <Row label="Gap"><input type="number" value={p.gap} min={0} onChange={e => set({ gap: Number(e.target.value) || 0 })} style={numInputStyle} /></Row>
        <Row label="Family">
          <Select value={p.font} onChange={v => set({ font: v })} options={[{ value: '', label: 'page font' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]} />
        </Row>
        <Row label="Size"><input type="number" value={p.size} min={6} onChange={e => set({ size: Number(e.target.value) || 13 })} style={numInputStyle} /></Row>
        <Row label="Color"><ColorPicker value={p.color} onChange={v => set({ color: v })} /></Row>
      </Section>
    </>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

const emptyCell = (): TableCell => ({ text: '', colspan: 1, rowspan: 1, bg: '', align: 'left', bold: false })

function setCellSpan(p: TableProps, r: number, c: number, colspan: number, rowspan: number): TableProps['rows'] {
  const rows = p.rows.map(row => row.map(cell => cell ? { ...cell } : null))
  const cell = rows[r][c]
  if (!cell) return rows
  const rowCount = rows.length, colCount = p.colWidths.length
  // Clear previous coverage back to empty cells
  for (let dr = 0; dr < cell.rowspan; dr++)
    for (let dc = 0; dc < cell.colspan; dc++)
      if ((dr || dc) && rows[r + dr]) rows[r + dr][c + dc] = emptyCell()
  const nc = Math.max(1, Math.min(colspan, colCount - c))
  const nr = Math.max(1, Math.min(rowspan, rowCount - r))
  cell.colspan = nc; cell.rowspan = nr
  for (let dr = 0; dr < nr; dr++)
    for (let dc = 0; dc < nc; dc++)
      if ((dr || dc) && rows[r + dr]) rows[r + dr][c + dc] = null
  return rows
}

function TablePanel({ block, onChange }: { block: SoneBlock; onChange: (u: SoneBlock) => void }) {
  const p = block.props as TableProps
  const [sel, setSel] = useState<[number, number] | null>(null)
  const set = (patch: Partial<TableProps>) => onChange({ ...block, props: { ...p, ...patch } as TableProps })

  const colCount = p.colWidths.length
  const setCellText = (r: number, c: number, text: string) => {
    const rows = p.rows.map(row => row.map(cell => cell ? { ...cell } : null))
    if (rows[r][c]) rows[r][c]!.text = text
    set({ rows })
  }
  const setCell = (r: number, c: number, patch: Partial<TableCell>) => {
    const rows = p.rows.map(row => row.map(cell => cell ? { ...cell } : null))
    if (rows[r][c]) rows[r][c] = { ...rows[r][c]!, ...patch }
    set({ rows })
  }
  const addRow = () => {
    const rows = [...p.rows.map(r => [...r]), Array.from({ length: colCount }, emptyCell)]
    set({ rows, rowHeights: [...p.rowHeights, 28] })
  }
  const removeRow = () => {
    if (p.rows.length <= 1) return
    set({ rows: p.rows.slice(0, -1), rowHeights: p.rowHeights.slice(0, -1) })
  }
  const addCol = () => {
    const rows = p.rows.map(r => [...r, emptyCell()])
    set({ rows, colWidths: [...p.colWidths, 100] })
  }
  const removeCol = () => {
    if (colCount <= 1) return
    const rows = p.rows.map(r => r.slice(0, -1))
    set({ rows, colWidths: p.colWidths.slice(0, -1) })
  }

  const selCell = sel && p.rows[sel[0]]?.[sel[1]]

  return (
    <>
      <Section title="TABLE">
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <Stepper label="Rows" value={p.rows.length} onAdd={addRow} onSub={removeRow} />
          <Stepper label="Cols" value={colCount} onAdd={addCol} onSub={removeCol} />
        </div>
        <Row label="Header">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#7d8590' }}>
            <input type="checkbox" checked={p.headerRow} onChange={e => set({ headerRow: e.target.checked })} /> bold first row
          </label>
        </Row>
        {p.headerRow && <Row label="Head bg"><ColorPicker value={p.headerBg} onChange={v => set({ headerBg: v })} /></Row>}
        <Row label="Border"><ColorPicker value={p.borderColor} onChange={v => set({ borderColor: v })} /></Row>
        <Row label="B.Width"><input type="number" value={p.borderWidth} min={0} step={0.5} onChange={e => set({ borderWidth: Number(e.target.value) || 0 })} style={numInputStyle} /></Row>
        <Row label="Size"><input type="number" value={p.size} min={6} onChange={e => set({ size: Number(e.target.value) || 12 })} style={numInputStyle} /></Row>
        <Row label="Color"><ColorPicker value={p.color} onChange={v => set({ color: v })} /></Row>
      </Section>

      <Section title="CELLS">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {p.rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 3 }}>
              {row.map((cell, c) => cell ? (
                <input key={c} value={cell.text}
                  onFocus={() => setSel([r, c])}
                  onChange={e => setCellText(r, c, e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, borderColor: sel && sel[0] === r && sel[1] === c ? '#58a6ff' : '#30363d' }} />
              ) : (
                <div key={c} style={{ flex: 1, minWidth: 0, background: '#0d1117', borderRadius: 4 }} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      {sel && selCell && (
        <Section title={`CELL ${sel[0] + 1},${sel[1] + 1}`}>
          <Row label="Colspan">
            <input type="number" min={1} value={selCell.colspan}
              onChange={e => set({ rows: setCellSpan(p, sel[0], sel[1], Number(e.target.value) || 1, selCell.rowspan) })} style={numInputStyle} />
          </Row>
          <Row label="Rowspan">
            <input type="number" min={1} value={selCell.rowspan}
              onChange={e => set({ rows: setCellSpan(p, sel[0], sel[1], selCell.colspan, Number(e.target.value) || 1) })} style={numInputStyle} />
          </Row>
          <Row label="Align"><AlignToggle value={selCell.align} onChange={v => setCell(sel[0], sel[1], { align: v as TableCell['align'] })} /></Row>
          <Row label="Bold">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: '#7d8590' }}>
              <input type="checkbox" checked={selCell.bold} onChange={e => setCell(sel[0], sel[1], { bold: e.target.checked })} /> bold
            </label>
          </Row>
          <Row label="Bg"><ColorPicker value={selCell.bg} onChange={v => setCell(sel[0], sel[1], { bg: v })} /></Row>
        </Section>
      )}
    </>
  )
}

// ── PagePanel ─────────────────────────────────────────────────────────────────

const PAPER_SIZES = [
  { w: 794,  h: 1123, label: 'A4 (794×1123)' },
  { w: 816,  h: 1056, label: 'Letter (816×1056)' },
  { w: 559,  h: 794,  label: 'A5 (559×794)' },
  { w: 1122, h: 1587, label: 'A3 (1122×1587)' },
]

interface PagePanelProps {
  doc: VeDoc
  onDocChange: (patch: Partial<VeDoc>) => void
}

export function PagePanel({ doc, onDocChange }: PagePanelProps) {
  return (
    <div style={{ overflowY: 'auto', height: '100%', fontSize: 12, color: '#c9d1d9' }}>
      <Section title="PAGE">
        <Row label="Size">
          <Select value={String(doc.paperWidth)}
            onChange={v => { const s = PAPER_SIZES.find(s => s.w === Number(v)); if (s) onDocChange({ paperWidth: s.w, paperHeight: s.h }) }}
            options={PAPER_SIZES.map(s => ({ value: String(s.w), label: s.label }))} />
        </Row>
        <Row label="Pages">
          <Stepper label="" value={doc.pages}
            onAdd={() => onDocChange({ pages: doc.pages + 1 })}
            onSub={() => onDocChange({ pages: Math.max(1, doc.pages - 1) })} />
        </Row>
        <Row label="Bg"><ColorPicker value={doc.bg} onChange={v => onDocChange({ bg: v })} /></Row>
        <Row label="Font"><Select value={doc.font} onChange={v => onDocChange({ font: v })} options={FONT_FAMILIES.map(f => ({ value: f, label: f }))} /></Row>
      </Section>
      <div style={{ padding: '10px 14px', fontSize: 10, color: '#3d444d', lineHeight: '15px' }}>
        Tip: mark a block “repeat on every page” to turn it into a header or footer.
        Text tokens <code>{'{page}'}</code> and <code>{'{pages}'}</code> fill in the page number.
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#161b22', border: '1px solid #30363d',
  borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', outline: 'none',
  fontFamily: 'monospace', boxSizing: 'border-box',
}
const numInputStyle: React.CSSProperties = {
  width: 72, background: '#161b22', border: '1px solid #30363d',
  borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', outline: 'none',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: '1px solid #21262d' }}>
      <div style={{ fontSize: 10, color: '#484f58', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px 6px' }}>{title}</div>
      <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
      <span style={{ color: '#484f58', fontSize: 11, width: 52, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', cursor: 'pointer', outline: 'none' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Stepper({ label, value, onAdd, onSub }: { label: string; value: number; onAdd: () => void; onSub: () => void }) {
  const btn: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {label && <span style={{ fontSize: 10, color: '#484f58' }}>{label}</span>}
      <button style={btn} onClick={onSub}><Minus size={12} /></button>
      <span style={{ minWidth: 16, textAlign: 'center', fontSize: 11 }}>{value}</span>
      <button style={btn} onClick={onAdd}><Plus size={12} /></button>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = value ? toHexColor(value) : '#000000'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 20, height: 20, borderRadius: 3, border: '1px solid #30363d', background: value || 'transparent' }} />
        <input type="color" value={hex} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      </label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="—"
        style={{ flex: 1, minWidth: 0, background: '#161b22', border: '1px solid #30363d', borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: 'monospace' }} />
    </div>
  )
}

function AlignToggle({ value, onChange, withJustify }: {
  value: string; onChange: (v: 'left' | 'center' | 'right' | 'justify') => void; withJustify?: boolean
}) {
  const opts: Array<{ v: 'left' | 'center' | 'right' | 'justify'; Icon: typeof AlignLeft }> = [
    { v: 'left', Icon: AlignLeft }, { v: 'center', Icon: AlignCenter }, { v: 'right', Icon: AlignRight },
    ...(withJustify ? [{ v: 'justify' as const, Icon: AlignJustify }] : []),
  ]
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {opts.map(({ v, Icon }) => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            background: value === v ? '#1f6feb' : '#161b22',
            border: '1px solid ' + (value === v ? '#388bfd40' : '#30363d'),
            borderRadius: 4, color: value === v ? '#fff' : '#7d8590', padding: '4px 6px', cursor: 'pointer', display: 'flex' }}>
          <Icon size={12} />
        </button>
      ))}
    </div>
  )
}
