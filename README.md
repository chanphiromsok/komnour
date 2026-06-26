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
| `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td` | Tables; `th` gets dark header styling |
| `hr` | Horizontal rule (1 px grey line) |
| `input type="checkbox"` | Renders as an outlined checkbox; add `checked` attribute to show the checkmark |
| `page-break` | Forces a new page at that point |

### CSS properties

`padding`, `margin`, `gap`, `width`, `height`, `min-width`, `flex`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `position`, `top`, `right`, `bottom`, `left`, `background`, `background-color`, `color`, `font-size`, `font-weight`, `font-family`, `line-height`, `text-align`, `border`, `border-top`, `border-bottom`, `border-radius`

Unsupported properties are stripped and reported as warnings.

### Fonts

- **Inter** — Latin characters (default)
- **Noto Sans Khmer** — Khmer script (auto-fallback, no `font-family` declaration needed)

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
