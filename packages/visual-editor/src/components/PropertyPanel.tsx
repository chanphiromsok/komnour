import type { SoneBlock, VeDoc, TextProps, RectProps, LineProps, PhotoProps, ListProps } from '../types'
import { toHexColor } from '../lib/style-utils'

const FONT_FAMILIES = ['Noto Sans Khmer', 'Inter', 'KhmerOSsiemreap', 'Kh-Siemreap', 'Khmer-OS-Muol-Light', 'Calibri', 'KhmerBursa']

// ── PropertyPanel (block selected) ───────────────────────────────────────────

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
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
            padding: '3px 8px', fontFamily: 'monospace', fontSize: 11, color: '#7d8590',
          }}>
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
              <input
                type="number"
                value={val ?? ''}
                placeholder={ph}
                onChange={e => onChg(Number(e.target.value) || 0)}
                style={{ ...numInputStyle, width: '100%', textAlign: 'center', boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      </Section>

      {block.type === 'text' && <TextPanel p={block.props as TextProps} set={setProp} />}
      {block.type === 'rect' && <RectPanel p={block.props as RectProps} set={setProp} />}
      {(block.type === 'hline' || block.type === 'vline') && (
        <LinePanel p={block.props as LineProps} set={setProp} />
      )}
      {block.type === 'photo' && <PhotoPanel p={block.props as PhotoProps} set={setProp} />}
      {block.type === 'list' && <ListPanel p={block.props as ListProps} set={setProp} />}

    </div>
  )
}

// ── Per-type panels ───────────────────────────────────────────────────────────

function TextPanel({ p, set }: { p: TextProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Section title="CONTENT">
        <textarea
          value={p.text}
          onChange={e => set({ text: e.target.value })}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '18px' }}
        />
      </Section>
      <Section title="TYPOGRAPHY">
        <Row label="Family">
          <Select
            value={p.font}
            onChange={v => set({ font: v })}
            options={[{ value: '', label: 'page font' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]}
          />
        </Row>
        <Row label="Size">
          <input type="number" value={p.size} min={6}
            onChange={e => set({ size: Number(e.target.value) || 13 })} style={numInputStyle} />
        </Row>
        <Row label="Weight">
          <div style={{ display: 'flex', gap: 2 }}>
            <ToggleBtn active={p.weight === 'normal'} onClick={() => set({ weight: 'normal' })}>Reg</ToggleBtn>
            <ToggleBtn active={p.weight === 'bold'}   onClick={() => set({ weight: 'bold' })}>Bold</ToggleBtn>
          </div>
        </Row>
        <Row label="Color">
          <ColorPicker value={p.color} onChange={v => set({ color: v })} />
        </Row>
        <Row label="Align">
          <div style={{ display: 'flex', gap: 2 }}>
            {(['left', 'center', 'right', 'justify'] as const).map(a => (
              <ToggleBtn key={a} active={p.align === a} onClick={() => set({ align: a })}>
                <AlignIcon align={a} />
              </ToggleBtn>
            ))}
          </div>
        </Row>
        <Row label="Line-h">
          <input type="number" value={p.lineHeight || ''} placeholder="auto" step={0.1} min={0}
            onChange={e => set({ lineHeight: Number(e.target.value) || 0 })} style={numInputStyle} />
        </Row>
      </Section>
    </>
  )
}

function RectPanel({ p, set }: { p: RectProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="SHAPE">
      <Row label="Fill">
        <ColorPicker value={p.fill} onChange={v => set({ fill: v })} />
      </Row>
      <Row label="Stroke">
        <ColorPicker value={p.stroke} onChange={v => set({ stroke: v })} />
      </Row>
      <Row label="Thick">
        <input type="number" value={p.strokeWidth} min={0} step={0.5}
          onChange={e => set({ strokeWidth: Number(e.target.value) || 0 })} style={numInputStyle} />
      </Row>
      <Row label="Radius">
        <input type="number" value={p.radius} min={0}
          onChange={e => set({ radius: Number(e.target.value) || 0 })} style={numInputStyle} />
      </Row>
    </Section>
  )
}

function LinePanel({ p, set }: { p: LineProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="LINE">
      <Row label="Color">
        <ColorPicker value={p.stroke} onChange={v => set({ stroke: v })} />
      </Row>
      <Row label="Thick">
        <input type="number" value={p.strokeWidth} min={0.5} step={0.5}
          onChange={e => set({ strokeWidth: Number(e.target.value) || 1 })} style={numInputStyle} />
      </Row>
      <Row label="Dash">
        <Select
          value={p.dash}
          onChange={v => set({ dash: v })}
          options={[
            { value: 'solid',  label: 'solid' },
            { value: 'dashed', label: 'dashed' },
            { value: 'dotted', label: 'dotted' },
          ]}
        />
      </Row>
    </Section>
  )
}

function PhotoPanel({ p, set }: { p: PhotoProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <Section title="IMAGE">
      <Row label="Src">
        <input type="text" value={p.src} placeholder="https://…"
          onChange={e => set({ src: e.target.value })} style={inputStyle} />
      </Row>
      <Row label="Fit">
        <Select
          value={p.fit}
          onChange={v => set({ fit: v })}
          options={[
            { value: '',        label: 'default' },
            { value: 'cover',   label: 'cover' },
            { value: 'contain', label: 'contain' },
            { value: 'fill',    label: 'fill' },
          ]}
        />
      </Row>
    </Section>
  )
}

function ListPanel({ p, set }: { p: ListProps; set: (patch: Record<string, unknown>) => void }) {
  return (
    <>
      <Section title="ITEMS">
        <textarea
          value={p.items.join('\n')}
          onChange={e => set({ items: e.target.value.split('\n') })}
          onBlur={e => set({ items: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
          rows={4}
          placeholder="One item per line"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '18px' }}
        />
      </Section>
      <Section title="TYPOGRAPHY">
        <Row label="Family">
          <Select
            value={p.font}
            onChange={v => set({ font: v })}
            options={[{ value: '', label: 'page font' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]}
          />
        </Row>
        <Row label="Size">
          <input type="number" value={p.size} min={6}
            onChange={e => set({ size: Number(e.target.value) || 13 })} style={numInputStyle} />
        </Row>
        <Row label="Color">
          <ColorPicker value={p.color} onChange={v => set({ color: v })} />
        </Row>
      </Section>
    </>
  )
}

// ── PagePanel (no block selected) ─────────────────────────────────────────────

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
          <Select
            value={String(doc.paperWidth)}
            onChange={v => {
              const size = PAPER_SIZES.find(s => s.w === Number(v))
              if (size) onDocChange({ paperWidth: size.w, paperHeight: size.h })
            }}
            options={PAPER_SIZES.map(s => ({ value: String(s.w), label: s.label }))}
          />
        </Row>
        <Row label="Pages">
          <input type="number" value={doc.pages} min={1} max={50}
            onChange={e => onDocChange({ pages: Math.max(1, Number(e.target.value) || 1) })}
            style={numInputStyle} />
        </Row>
        <Row label="Bg">
          <ColorPicker value={doc.bg} onChange={v => onDocChange({ bg: v })} />
        </Row>
        <Row label="Font">
          <Select
            value={doc.font}
            onChange={v => onDocChange({ font: v })}
            options={FONT_FAMILIES.map(f => ({ value: f, label: f }))}
          />
        </Row>
      </Section>
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
      <div style={{
        fontSize: 10, color: '#484f58', letterSpacing: '0.08em', textTransform: 'uppercase',
        padding: '10px 14px 6px',
      }}>
        {title}
      </div>
      <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
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

function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', background: '#161b22', border: '1px solid #30363d',
        borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px',
        cursor: 'pointer', outline: 'none',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex = value ? toHexColor(value) : '#000000'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 3, border: '1px solid #30363d',
          background: value || 'transparent',
        }} />
        <input
          type="color"
          value={hex}
          onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        style={{
          flex: 1, minWidth: 0, background: '#161b22', border: '1px solid #30363d',
          borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', outline: 'none',
          fontFamily: 'monospace',
        }}
      />
    </div>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1f6feb' : '#161b22',
        border: '1px solid ' + (active ? '#388bfd40' : '#30363d'),
        borderRadius: 4, color: active ? '#fff' : '#7d8590',
        fontSize: 10, padding: '3px 7px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28,
      }}
    >
      {children}
    </button>
  )
}

function AlignIcon({ align }: { align: 'left' | 'center' | 'right' | 'justify' }) {
  const lines = {
    left:    [[0,10],[0,6],[0,8]],
    center:  [[1,9],[2,8],[1,9]],
    right:   [[2,10],[2,6],[2,8]],
    justify: [[0,10],[0,10],[0,10]],
  }[align]
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="currentColor">
      <rect y="0" x={lines[0][0]} width={lines[0][1]} height="1.5" rx="0.5"/>
      <rect y="3.5" x={lines[1][0]} width={lines[1][1]} height="1.5" rx="0.5"/>
      <rect y="7" x={lines[2][0]} width={lines[2][1]} height="1.5" rx="0.5"/>
    </svg>
  )
}
