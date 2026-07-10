# Komnour

A Figma-like visual document editor for building PDF/PNG report templates — drag-and-drop shapes, text, images, and checkboxes onto a page, bind fields to live JSON data with `{{path}}` syntax, and export the result as a crisp PDF or PNG. Built with first-class Khmer script support.

## Packages

| Package | Description |
|---|---|
| `packages/report` | The document model, schema validation, layout, and renderer (shared by the editor and the server) — also published standalone as `@komnour/report` for Node-only "JSON in, PDF out" use, see [its README](packages/report/README.md) |
| `packages/visual-editor` | The design tool itself — a Vite/React canvas editor, deployed as a static site |
| `packages/server` | A small Fastify API that renders a `ReportDocument` to PDF/PNG using real Skia (`skia-canvas`) |

## Architecture

The editor's live preview renders **entirely client-side**, in a dedicated Web Worker, using the browser's native Canvas2D API — no backend is needed just to use the editor. The server is only needed for two things that require real server-side Skia:

- **Exporting the final PDF** (`Toolbar` → "Export PDF")
- **"Verify render"** — a PNG diff used to sanity-check that the client-side preview matches the real exported output

## Getting Started

**Requirements:** Node.js 18+ (the visual editor and server; `@komnour/report/pdf` itself supports Node 16+ standalone), pnpm 9+

```bash
pnpm install
```

### Local development

```bash
pnpm --filter @komnour/visual-editor dev
# → http://localhost:5174
```

That's it — one command. `vite dev` auto-starts `@komnour/server` as a child process (skipping itself if something's already listening on its port, e.g. if you're running it separately) and proxies `/api` to it, so PDF export and verify-render work without a second terminal. If you'd rather run them separately:

```bash
pnpm --filter @komnour/server dev        # → http://localhost:3001
pnpm --filter @komnour/visual-editor dev  # → http://localhost:5174
```

Override the server's port with `PORT`, and the editor's proxy target with `VITE_DEV_API_PROXY_TARGET` if they don't agree.

### Production build

The visual editor is a static site (deployed to GitHub Pages under `/komnour/`); the server is a normal Node process deployed separately. Because GitHub Pages can't run a backend, the built editor needs to know where the real server lives at **build time**:

```bash
cd packages/visual-editor
cp .env.production.example .env.production   # then edit VITE_API_BASE_URL
pnpm run build     # → dist/
pnpm run deploy    # → gh-pages -d dist
```

`VITE_API_BASE_URL` must point at the deployed `@komnour/server`'s `/api` path (e.g. `https://your-api-domain.com/api`). The server's CORS allowlist (`packages/server/src/index.ts`) includes `https://chanphiromsok.github.io` by default; add more origins via the comma-separated `CORS_ORIGINS` env var.

## The editor

- **Canvas** — drag, resize, and rotate shapes; multi-select with marquee or shift-click; undo/redo
- **Smart alignment** — Figma-style magnetic snapping to sibling edges/centers (all nine start/center/end combinations per axis), with alignment guides shown exactly where snapping occurs. Hold **Alt**/**Option** to temporarily disable it and fall back to grid snapping
- **Node types** — page, view (a plain container), text (rich inline styling — bold/italic/underline/color per span), image, rectangle, circle, line, path, and checkbox
- **Checkboxes** — configurable box fill/border/corner-radius and tick color, an optional label, and an optional data binding (see below)
- **Data binding** — any text node or checkbox's `checked` state can reference the document's own `bindingData` JSON via `{{dot.path.here}}` (text) or a plain dot path (checkbox). The editor shows bound checkbox ticks in a distinct color (configurable, editor-only — never affects the exported file) so it's obvious which fields are template-driven while you're building
- **Import/export** — copy or download the document as JSON, re-import it, export the current state to PDF
- **Keyboard shortcuts** — the usual (delete, duplicate, undo/redo, space-drag to pan, scroll-wheel zoom); press a tool's first letter (`t` for text, `r` for rectangle, `c` for checkbox, etc.) to add that node type

## Fonts

Registered identically on both the browser (`registerBrowser.ts`, CSS Font Loading API) and the server (`registerServer.ts`, `skia-canvas`'s `FontLibrary`) from one shared manifest (`packages/report/src/fonts/manifest.ts`), so the live preview and the exported PDF use byte-identical glyphs:

- **Inter**, **Roboto** — Latin text
- **Battambang**, **Noto Sans Khmer**, **Khmer OS Moul** — Khmer script
- **Wingdings 2** — symbol/dingbat glyphs, picked via the glyph picker in the properties panel

## Using `@komnour/report` standalone

If you just need "take a JSON document, produce a PDF" in a plain Node.js service — no editor, no browser — see [`packages/report/README.md`](packages/report/README.md) for the `@komnour/report/pdf` entry point.
