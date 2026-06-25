import Fastify from 'fastify'
import React from 'react'
import { buildPdf } from '@komnour/pdf'
import { Invoice, TableReport } from '@komnour/templates'
import type { InvoiceData } from '@komnour/templates'
import type { TableReportData } from '@komnour/templates'
import type { Font } from '@komnour/renderer'

const app = Fastify({ logger: true })

// Load your fonts here — replace with real font ArrayBuffers
const fonts: Font[] = [
  // {
  //   name: 'Inter',
  //   data: fs.readFileSync('path/to/Inter-Regular.ttf').buffer,
  //   weight: 400,
  //   style: 'normal',
  // },
]

app.post<{ Body: InvoiceData }>('/report/invoice', async (req, reply) => {
  const pdf = await buildPdf(
    [{ node: React.createElement(Invoice, { data: req.body }) }],
    fonts
  )
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="invoice-${req.body.invoiceNumber}.pdf"`)
    .send(pdf)
})

app.post<{ Body: TableReportData }>('/report/table', async (req, reply) => {
  const pdf = await buildPdf(
    [{ node: React.createElement(TableReport, { data: req.body }) }],
    fonts
  )
  reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="report.pdf"`)
    .send(pdf)
})

app.get('/health', async () => ({ status: 'ok' }))

app.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
