# Komnour

HTML-to-PDF/PNG renderer with a live editor. Write HTML with inline CSS, preview it in real time, and export crisp PDF or PNG documents — with full Khmer script support.

## Packages

| Package | Description |
|---|---|
| `packages/core` | HTML parser, sanitizer, sone layout engine bridge, and renderer |
| `packages/server` | Fastify REST API that wraps core |
| `packages/editor` | Monaco-based live editor with Figma-like zoom/pan preview |

## Getting Started

**Requirements:** Node.js 20+, pnpm 8+

```bash
pnpm install
```

### Start the server

```bash
cd packages/server
pnpm dev
# → http://localhost:3001
```

### Start the editor

```bash
cd packages/editor
pnpm dev
# → http://localhost:5173
```

Open the editor in your browser. The server must be running for previews and exports to work.

## Editor

- **Left pane** — Monaco editor with HTML/CSS syntax highlighting, a custom dark theme, CSS property autocomplete inside `style="..."`, and HTML snippet completions
- **Right pane** — Live preview with Figma-like zoom/pan
  - `Ctrl + scroll` — zoom in/out centered on cursor
  - `Scroll` — pan
  - `Space + drag` or middle-click drag — pan
  - `+` / `−` buttons or zoom % display in the status bar
- **Format toggle** — switch between PDF (paginated) and PNG preview
- **Export PNG / Export PDF** — download the rendered file

Changes are persisted to `localStorage` so your work survives a page refresh.

## Server API

All endpoints accept and return `application/json` unless noted.

### `POST /render`

Render HTML to a PDF or PNG buffer.

**Body**
```json
{ "html": "<p>Hello</p>", "format": "pdf" }
```
`format` defaults to `"png"`.

**Response** — `image/png` or `application/pdf` binary

---

### `POST /preview-pages`

Render HTML as paginated PNG images (one per page, 2× DPR for crisp display).

**Body**
```json
{ "html": "<p>Hello</p>" }
```

**Response**
```json
{ "pages": ["<base64-png>", "..."] }
```

---

### `POST /sanitize`

Strip unsafe HTML and unsupported CSS before rendering.

**Body**
```json
{ "html": "<script>alert(1)</script><p>Safe</p>" }
```

**Response**
```json
{ "html": "<p>Safe</p>", "warnings": ["<script> was removed"] }
```

---

### `GET /health`

```json
{ "ok": true }
```

## Supported HTML

### Elements

| Element | Notes |
|---|---|
| `div`, `section`, `article`, `header`, `footer` | Block containers; `flex-direction: row` produces a Row layout |
| `p`, `h1`–`h6`, `label` | Text blocks; headings have preset sizes and bold weight |
| `span`, `strong`, `b`, `em`, `i` | Inline text with style inheritance |
| `ul`, `ol`, `li` | Lists with bullet / numbered markers |
| `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td` | Tables — see [Tables](#tables) below |
| `hr` | Horizontal rule (1 px grey line) |
| `input type="checkbox"` | Renders as an outlined checkbox; add `checked` attribute to show the checkmark |
| `page-break` | Forces a new page at that point — see [Page Break](#page-break) |
| `tab` | Fixed-width horizontal gap inside text — see [Tab](#tab) |

### CSS properties

`padding`, `margin`, `gap`, `width`, `height`, `min-width`, `flex`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `position`, `top`, `right`, `bottom`, `left`, `background`, `background-color`, `color`, `font-size`, `font-weight`, `font-family`, `line-height`, `text-align`, `border`, `border-top`, `border-bottom`, `border-radius`

Unsupported properties are stripped and reported as warnings.

### Fonts

- **Inter** — Latin characters (default)
- **Noto Sans Khmer** — Khmer script (auto-fallback, no `font-family` declaration needed)

## Tables

Tables map directly to sone's layout primitives: `table` → Column, `tr` → Row, `td`/`th` → flex Column cells.

### Basic table

```html
<table style="width: 100%">
  <thead>
    <tr>
      <th>Name</th>
      <th>Score</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alice</td>
      <td>95</td>
    </tr>
    <tr>
      <td>Bob</td>
      <td>88</td>
    </tr>
  </tbody>
</table>
```

### Borders

Apply `border` as an inline style on `<td>` and `<th>`. The engine simulates `border-collapse: collapse` automatically — shared edges between adjacent cells are drawn once (no double lines). The first column's left edge and first row's top edge are preserved so the outer table outline remains visible.

```html
<table style="width: 100%">
  <tr>
    <td style="border: 1px solid #333">Cell A</td>
    <td style="border: 1px solid #333">Cell B</td>
  </tr>
  <tr>
    <td style="border: 1px solid #333">Cell C</td>
    <td style="border: 1px solid #333">Cell D</td>
  </tr>
</table>
```

You can also apply individual sides: `border-top`, `border-right`, `border-bottom`, `border-left`.

### colspan — span multiple columns

`colspan="N"` makes a cell take the width of N columns:

```html
<table style="width: 100%">
  <tr>
    <td colspan="3" style="border: 1px solid #333">Full-width header cell</td>
  </tr>
  <tr>
    <td style="border: 1px solid #333">A</td>
    <td style="border: 1px solid #333">B</td>
    <td style="border: 1px solid #333">C</td>
  </tr>
</table>
```

### rowspan — span multiple rows

`rowspan="N"` makes a cell extend down N rows. The following rows must omit the cell in that column position:

```html
<table style="width: 100%">
  <tr>
    <td rowspan="3" style="border: 1px solid #333">Spans 3 rows</td>
    <td style="border: 1px solid #333">Row 1, Col 2</td>
  </tr>
  <tr>
    <td style="border: 1px solid #333">Row 2, Col 2</td>
  </tr>
  <tr>
    <td style="border: 1px solid #333">Row 3, Col 2</td>
  </tr>
</table>
```

Both attributes can be combined: `<td colspan="2" rowspan="2">` spans a 2×2 block.

### Header styling

`<th>` cells render text in **bold**. Apply background and text color via inline styles:

```html
<th style="background-color: #1a1a2e; color: white">Header</th>
```

### Known limitations

| Feature | Status |
|---|---|
| `colspan` | ✅ Supported |
| `rowspan` | ✅ Supported |
| `<caption>` | Tag removed, content preserved as a plain block above the table |
| `<col>` / `<colgroup>` | Tag removed, content discarded |
| `border-collapse: collapse` | Not needed — collapse is applied automatically; writing it produces a warning |
| Per-side border color | Only one color per element — last specified wins (`border-left: red; border-right: blue` → both blue) |

---

## Tab

Insert `<tab>` anywhere inside a text element (`<p>`, `<h1>`–`<h6>`, etc.) to create a fixed-width horizontal gap. Use the `width` attribute to set the gap in pixels (default: 32 px).

```html
<p>Item A<tab width="80"></tab>$120</p>
<p>Item B<tab width="80"></tab>$85</p>
```

The gap is rendered as an inline span with letter-spacing, so it scales with the surrounding text. It is not a tab-stop — all `<tab>` elements with the same `width` produce the same gap regardless of the text before them. For column-aligned layouts, prefer a table.

---

## Page Break

Insert `<page-break>` anywhere in your HTML to force a new page:

```html
<div style="padding: 40px">
  <h1>Page 1</h1>
  <p>First page content.</p>
</div>

<page-break></page-break>

<div style="padding: 40px">
  <h1>Page 2</h1>
  <p>Second page content.</p>
</div>
```

Page size is A4 (794 × 1123 pt).
