import { type Block, type ParsedDoc } from '../types'
import { getBlockStyles, setBlockStyle, getBlockAttr, setBlockAttr, getRootStyles, setRootStyle } from '../lib/blocks'
import { toHexColor, getSide } from '../lib/style-utils'

const FONT_FAMILIES = ['Noto Sans Khmer', 'Inter', 'KhmerOSsiemreap', 'Kh-Siemreap', 'Khmer-OS-Muol-Light', 'Calibri', 'KhmerBursa', 'Arial', 'Times New Roman']

// ── PropertyPanel (block selected) ───────────────────────────────────────────

interface Props {
  block: Block | null
  onChange: (updated: Block) => void
}

export default function PropertyPanel({ block, onChange }: Props) {
  if (!block) {
    return (
      <div style={{ padding: 24, color: '#484f58', fontSize: 12, textAlign: 'center', lineHeight: '20px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, marginBottom: 8 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <br />
        Click an element<br />to edit its properties
      </div>
    )
  }

  const styles = getBlockStyles(block)
  const set = (prop: string, value: string) => onChange(setBlockStyle(block, prop, value))
  const setAttr = (attr: string, value: string) => onChange(setBlockAttr(block, attr, value))

  const isHr  = block.tagName === 'hr'
  const isImg = block.tagName === 'img'
  const isPageBreak = block.tagName === 'page-break'

  return (
    <div style={{ overflowY: 'auto', height: '100%', fontSize: 12, color: '#c9d1d9' }}>

      {/* Element info */}
      <Section title="ELEMENT">
        <Row label="Tag">
          <div style={{
            background: '#161b22', border: '1px solid #30363d', borderRadius: 4,
            padding: '3px 8px', fontFamily: 'monospace', fontSize: 11, color: '#7d8590',
          }}>
            &lt;{block.tagName}&gt;
          </div>
        </Row>
      </Section>

      {/* Image properties */}
      {isImg && (
        <Section title="IMAGE">
          <Row label="Src">
            <input
              type="text"
              value={getBlockAttr(block, 'src')}
              onChange={e => setAttr('src', e.target.value)}
              placeholder="https://…"
              style={inputStyle}
            />
          </Row>
          <Row label="Alt">
            <input
              type="text"
              value={getBlockAttr(block, 'alt')}
              onChange={e => setAttr('alt', e.target.value)}
              placeholder="Description"
              style={inputStyle}
            />
          </Row>
          <Row label="Fit">
            <Select
              value={styles['object-fit'] ?? ''}
              onChange={v => set('object-fit', v)}
              options={[
                { value: '', label: 'default' },
                { value: 'contain', label: 'contain' },
                { value: 'cover', label: 'cover' },
                { value: 'fill', label: 'fill' },
              ]}
            />
          </Row>
          <Row label="Width">
            <NumUnit value={styles['width'] ?? ''} onChange={v => set('width', v)} />
          </Row>
          <Row label="Height">
            <NumUnit value={styles['height'] ?? ''} onChange={v => set('height', v)} />
          </Row>
        </Section>
      )}

      {/* HR / Line properties */}
      {isHr && (
        <Section title="LINE">
          <Row label="Color">
            <ColorPicker
              value={styles['border-top-color'] ?? styles['border-color'] ?? '#e1e4e8'}
              onChange={v => set('border-top-color', v)}
            />
          </Row>
          <Row label="Thick">
            <NumUnit
              value={styles['border-top-width'] ?? styles['border-width'] ?? '1px'}
              onChange={v => set('border-top-width', v)}
            />
          </Row>
          <Row label="Style">
            <Select
              value={styles['border-top-style'] ?? styles['border-style'] ?? 'solid'}
              onChange={v => set('border-top-style', v)}
              options={[
                { value: 'solid',  label: 'solid' },
                { value: 'dashed', label: 'dashed' },
                { value: 'dotted', label: 'dotted' },
                { value: 'double', label: 'double' },
              ]}
            />
          </Row>
        </Section>
      )}

      {/* Typography — hidden for hr, img, page-break */}
      {!isHr && !isImg && !isPageBreak && (
        <Section title="TYPOGRAPHY">
          <Row label="Family">
            <Select
              value={styles['font-family']?.replace(/['"]/g, '') ?? ''}
              onChange={v => set('font-family', v ? `'${v}'` : '')}
              options={[{ value: '', label: '—' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]}
            />
          </Row>
          <Row label="Size">
            <NumUnit value={styles['font-size'] ?? ''} onChange={v => set('font-size', v)} />
          </Row>
          <Row label="Weight">
            <div style={{ display: 'flex', gap: 2 }}>
              {(['400', '600', '700', '900'] as const).map(w => (
                <ToggleBtn
                  key={w}
                  active={styles['font-weight'] === w}
                  onClick={() => set('font-weight', styles['font-weight'] === w ? '' : w)}
                >
                  {w === '400' ? 'Reg' : w === '600' ? 'Sem' : w === '700' ? 'Bld' : '900'}
                </ToggleBtn>
              ))}
            </div>
          </Row>
          <Row label="Color">
            <ColorPicker value={styles['color'] ?? ''} onChange={v => set('color', v)} />
          </Row>
          <Row label="Align">
            <div style={{ display: 'flex', gap: 2 }}>
              {(['left', 'center', 'right', 'justify'] as const).map(a => (
                <ToggleBtn
                  key={a}
                  active={styles['text-align'] === a}
                  onClick={() => set('text-align', styles['text-align'] === a ? '' : a)}
                >
                  <AlignIcon align={a} />
                </ToggleBtn>
              ))}
            </div>
          </Row>
          <Row label="Line-h">
            <NumUnit value={styles['line-height'] ?? ''} onChange={v => set('line-height', v)} defaultUnit="" />
          </Row>
        </Section>
      )}

      {/* Spacing */}
      <Section title="SPACING">
        <SpacingGroup label="Padding" prop="padding" styles={styles} set={set} />
        <SpacingGroup label="Margin"  prop="margin"  styles={styles} set={set} />
      </Section>

      {/* Fill */}
      {!isHr && !isPageBreak && (
        <Section title="FILL">
          <Row label="Background">
            <ColorPicker
              value={styles['background-color'] ?? styles['background'] ?? ''}
              onChange={v => set('background-color', v)}
            />
          </Row>
        </Section>
      )}

      {/* Border */}
      {!isHr && !isPageBreak && (
        <Section title="BORDER">
          <Row label="Radius">
            <NumUnit value={styles['border-radius'] ?? ''} onChange={v => set('border-radius', v)} />
          </Row>
          <Row label="Width">
            <NumUnit value={styles['border-width'] ?? ''} onChange={v => set('border-width', v)} />
          </Row>
          <Row label="Color">
            <ColorPicker value={styles['border-color'] ?? ''} onChange={v => set('border-color', v)} />
          </Row>
          <Row label="Style">
            <Select
              value={styles['border-style'] ?? ''}
              onChange={v => set('border-style', v)}
              options={[
                { value: '', label: 'none' },
                { value: 'solid', label: 'solid' },
                { value: 'dashed', label: 'dashed' },
                { value: 'dotted', label: 'dotted' },
              ]}
            />
          </Row>
        </Section>
      )}

    </div>
  )
}

// ── PagePanel (no block selected) ─────────────────────────────────────────────

interface PagePanelProps {
  doc: ParsedDoc
  onDocChange: (doc: ParsedDoc) => void
  paperWidth: number
  onPaperWidthChange: (w: number) => void
}

export function PagePanel({ doc, onDocChange, paperWidth, onPaperWidthChange }: PagePanelProps) {
  const styles = getRootStyles(doc.openTag)
  const set = (prop: string, value: string) => onDocChange(setRootStyle(doc, prop, value))

  return (
    <div style={{ overflowY: 'auto', height: '100%', fontSize: 12, color: '#c9d1d9' }}>
      <Section title="PAGE">
        <Row label="Size">
          <Select
            value={String(paperWidth)}
            onChange={v => onPaperWidthChange(Number(v))}
            options={[
              { value: '794',  label: 'A4 (794px)' },
              { value: '816',  label: 'Letter (816px)' },
              { value: '559',  label: 'A5 (559px)' },
              { value: '1122', label: 'A3 (1122px)' },
            ]}
          />
        </Row>
        <Row label="Bg">
          <ColorPicker
            value={styles['background-color'] ?? styles['background'] ?? '#ffffff'}
            onChange={v => set('background-color', v)}
          />
        </Row>
        <Row label="Font">
          <Select
            value={styles['font-family']?.replace(/['"]/g, '') ?? ''}
            onChange={v => set('font-family', v ? `'${v}'` : '')}
            options={[{ value: '', label: '—' }, ...FONT_FAMILIES.map(f => ({ value: f, label: f }))]}
          />
        </Row>
      </Section>
      <Section title="SPACING">
        <SpacingGroup label="Padding" prop="padding" styles={styles} set={set} />
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

function NumUnit({ value, onChange, defaultUnit = 'px' }: {
  value: string
  onChange: (v: string) => void
  defaultUnit?: string
}) {
  const num = parseFloat(value) || 0
  const unit = value?.replace(/[\d.\s-]+/, '') || defaultUnit
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <input
        type="number"
        value={num}
        onChange={e => onChange(e.target.value + unit)}
        style={{
          width: 56, background: '#161b22', border: '1px solid #30363d',
          borderRadius: 4, color: '#c9d1d9', fontSize: 11, padding: '3px 6px', outline: 'none',
        }}
      />
      {defaultUnit !== '' && (
        <select
          value={unit}
          onChange={e => onChange(String(num) + e.target.value)}
          style={{
            width: 42, background: '#161b22', border: '1px solid #30363d',
            borderRadius: 4, color: '#7d8590', fontSize: 10, padding: '3px 2px',
            cursor: 'pointer', outline: 'none',
          }}
        >
          {['px', 'em', 'rem', '%'].map(u => <option key={u}>{u}</option>)}
        </select>
      )}
    </div>
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

function SpacingGroup({ label, prop, styles, set }: {
  label: string
  prop: string
  styles: Record<string, string>
  set: (prop: string, value: string) => void
}) {
  const sides = ['top', 'right', 'bottom', 'left'] as const
  return (
    <div>
      <div style={{ fontSize: 10, color: '#3d444d', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
        {sides.map(side => {
          const longhand = `${prop}-${side}`
          const val = styles[longhand] ?? getSide(styles, prop, side)
          return (
            <div key={side}>
              <div style={{ fontSize: 9, color: '#484f58', textAlign: 'center', marginBottom: 2 }}>{side[0].toUpperCase()}</div>
              <input
                type="number"
                value={parseFloat(val) || 0}
                onChange={e => {
                  const unit = val?.replace(/[\d.\s-]+/, '') || 'px'
                  set(longhand, e.target.value + unit)
                }}
                style={{
                  width: '100%', background: '#161b22', border: '1px solid #30363d',
                  borderRadius: 4, color: '#c9d1d9', fontSize: 11,
                  padding: '3px 4px', outline: 'none', textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
