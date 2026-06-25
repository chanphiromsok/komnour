import React from 'react'

export interface TableColumn<T = Record<string, unknown>> {
  key: keyof T
  label: string
  width?: number
  align?: 'left' | 'center' | 'right'
  format?: (val: T[keyof T], row: T) => string
}

export interface TableReportData<T = Record<string, unknown>> {
  title: string
  subtitle?: string
  columns: TableColumn<T>[]
  rows: T[]
  generatedAt?: string
}

export function TableReport<T = Record<string, unknown>>({
  data,
}: {
  data: TableReportData<T>
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 48,
        fontFamily: 'sans-serif',
        fontSize: 13,
        color: '#111',
        backgroundColor: '#fff',
        width: '100%',
        height: '100%',
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
        <span style={{ fontSize: 22, fontWeight: 700 }}>{data.title}</span>
        {data.subtitle && (
          <span style={{ color: '#666', marginTop: 4 }}>{data.subtitle}</span>
        )}
        {data.generatedAt && (
          <span style={{ color: '#999', fontSize: 11, marginTop: 8 }}>
            Generated: {data.generatedAt}
          </span>
        )}
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          padding: '10px 16px',
          fontWeight: 600,
          fontSize: 12,
          borderRadius: 4,
          marginBottom: 2,
        }}
      >
        {data.columns.map((col, i) => (
          <span
            key={i}
            style={{
              flex: col.width ?? 1,
              textAlign: col.align ?? 'left',
            }}
          >
            {col.label}
          </span>
        ))}
      </div>

      {/* Data rows */}
      {data.rows.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            padding: '9px 16px',
            backgroundColor: ri % 2 === 0 ? '#fff' : '#f8f9fa',
            borderBottom: '1px solid #eee',
          }}
        >
          {data.columns.map((col, ci) => {
            const val = row[col.key]
            const display = col.format ? col.format(val, row) : String(val ?? '')
            return (
              <span
                key={ci}
                style={{ flex: col.width ?? 1, textAlign: col.align ?? 'left' }}
              >
                {display}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
