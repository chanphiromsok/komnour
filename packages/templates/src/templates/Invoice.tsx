import React from 'react'

export interface InvoiceItem {
  description: string
  qty: number
  price: number
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  from: { name: string; address: string }
  to: { name: string; address: string }
  items: InvoiceItem[]
  currency?: string
}

export function Invoice({ data }: { data: InvoiceData }) {
  const currency = data.currency ?? 'USD'
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
  const total = data.items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 48,
        fontFamily: 'sans-serif',
        fontSize: 14,
        color: '#111',
        backgroundColor: '#fff',
        width: '100%',
        height: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 48 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>INVOICE</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontWeight: 600 }}>#{data.invoiceNumber}</span>
          <span style={{ color: '#666', marginTop: 4 }}>{data.date}</span>
        </div>
      </div>

      {/* Parties */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>
            From
          </span>
          <span style={{ fontWeight: 600, marginBottom: 2 }}>{data.from.name}</span>
          <span style={{ color: '#555' }}>{data.from.address}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, color: '#999', marginBottom: 6, textTransform: 'uppercase' }}>
            Bill To
          </span>
          <span style={{ fontWeight: 600, marginBottom: 2 }}>{data.to.name}</span>
          <span style={{ color: '#555' }}>{data.to.address}</span>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#f8f9fa',
          padding: '10px 16px',
          fontWeight: 600,
          fontSize: 12,
          color: '#555',
          borderRadius: 4,
          marginBottom: 4,
        }}
      >
        <span style={{ flex: 4 }}>Description</span>
        <span style={{ flex: 1, textAlign: 'center' }}>Qty</span>
        <span style={{ flex: 2, textAlign: 'right' }}>Unit Price</span>
        <span style={{ flex: 2, textAlign: 'right' }}>Amount</span>
      </div>

      {data.items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            padding: '10px 16px',
            borderBottom: '1px solid #eee',
          }}
        >
          <span style={{ flex: 4 }}>{item.description}</span>
          <span style={{ flex: 1, textAlign: 'center' }}>{item.qty}</span>
          <span style={{ flex: 2, textAlign: 'right' }}>{fmt(item.price)}</span>
          <span style={{ flex: 2, textAlign: 'right' }}>{fmt(item.qty * item.price)}</span>
        </div>
      ))}

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 32 }}>
            <span style={{ color: '#555' }}>Subtotal</span>
            <span>{fmt(total)}</span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 32,
              fontWeight: 700,
              fontSize: 18,
              marginTop: 8,
              paddingTop: 8,
              borderTop: '2px solid #111',
            }}
          >
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
