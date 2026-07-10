# @komnour/report

The document model, schema validation, layout, and renderer behind the [Komnour](../../README.md) visual editor. Most of this package is for internal use across the monorepo (the editor's live preview, the export server), but it also ships one small, standalone, **Node.js-only** entry point:

## `@komnour/report/pdf` — JSON in, PDF out

```bash
npm install @komnour/report
```

```ts
import { ReportDocumentSchema, renderDocumentToPdf } from "@komnour/report/pdf";
import { writeFile } from "node:fs/promises";

const parsed = ReportDocumentSchema.safeParse(await fetchYourDocumentJson());
if (!parsed.success) {
	throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

const pdf = await renderDocumentToPdf(parsed.data, { customer: { name: "Ada" } });
await writeFile("report.pdf", pdf);
```

Works identically with `require()`:

```js
const { renderDocumentToPdf, ReportDocumentSchema } = require("@komnour/report/pdf");
```

This entry point is deliberately narrow — it never imports the editor-facing model helpers, the browser (`Worker`/`OffscreenCanvas`) renderer, or PNG export. If you need those, see the [root README](../../README.md); this document is only about the minimal PDF-export surface.

### API

#### `ReportDocumentSchema.safeParse(value: unknown)`

Validates an untrusted JSON value against the report document schema (built on [TypeBox](https://github.com/sinclairzx81/typebox), compiled once at module load). Returns:

```ts
{ success: true; data: ReportDocument }
| { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } }
```

Always validate before rendering — `renderDocumentToPdf` assumes a well-formed `ReportDocument` and does not re-validate its input.

#### `renderDocumentToPdf(doc: ReportDocument, data?: Record<string, unknown>): Promise<Buffer>`

Renders every page of `doc` to a multi-page PDF. `data` resolves `{{dot.path}}` bindings in text and checkbox nodes; when omitted, falls back to `doc.bindingData` if the document carries its own.

Powered by real Skia (`skia-canvas`, a native addon) — see [Fonts](#fonts) and [Native dependency](#native-dependency-skia-canvas) below before deploying.

#### `registerServerFonts(publicDir?: string, fonts?: FontDefinition[]): Promise<void>`

Registers font files so `renderDocumentToPdf` can use them. **No font files ship in this package** — you provide them. `renderDocumentToPdf` calls this internally with the defaults, so most callers never need to call it directly; it's exposed for two reasons:

1. **Supplying your own fonts.** Pass a custom `fonts` list (a "theme," a per-tenant font set, whatever) instead of the built-in `FONT_MANIFEST`:

   ```ts
   import { registerServerFonts } from "@komnour/report/pdf";

   await registerServerFonts("/path/to/your/fonts", [
   	{ id: "brand-400", family: "Brand Sans", weight: 400, style: "normal", source: "/BrandSans.ttf" },
   ]);
   ```

   `source` is resolved as `path.join(publicDir, source)`; for a font living somewhere else entirely, pass `publicDir: ""` and make `source` an absolute path.

2. **Registering more fonts later.** Registration is tracked per font *family*, not as a single one-time flag — calling this again with a font list that includes new families registers just those; families already registered are skipped, so calling it repeatedly with overlapping lists (e.g. once per request in a long-lived server) stays cheap. This means you can register a base set at startup and add more (a different theme's fonts, loaded on demand) later in the process's lifetime — nothing after the first call was silently a no-op.

#### `FONT_MANIFEST`

The built-in font list `registerServerFonts`/`renderDocumentToPdf` use by default — Inter, Roboto, Battambang, Noto Sans Khmer, Khmer OS Moul, and Wingdings 2. Exported as a reference for the shape `registerServerFonts`'s `fonts` parameter expects; none of these files are included in this package (see below).

### Fonts

Font *files* are not part of this npm package — only the `FONT_MANIFEST` metadata (family/weight/style/relative path) is. If you use the default manifest, you need to supply your own copies of those files (see `FONT_MANIFEST` for exactly which family/weight/style/filename each entry expects) under whatever `publicDir` you pass to `registerServerFonts`, or pass your own `fonts` list pointing at fonts you already have. If you never call `registerServerFonts` yourself and never trigger it (you always will, indirectly, via `renderDocumentToPdf`) with valid paths, `skia-canvas` falls back to whatever fonts are installed on the host system — which will not visually match the Komnour editor's output.

### Native dependency: skia-canvas

`renderDocumentToPdf` is backed by [`skia-canvas`](https://github.com/samizdatco/skia-canvas), a native addon with a prebuilt binary fetched at install time. Two things worth knowing:

- It supports Node back to **v12.22+/14.17+/15.12+/16+** — matching this package's own `engines.node: ">=16"`.
- If its prebuilt binary can't be fetched for your platform at install time (a restricted network, an unsupported target), the module fails to load. This package protects against that failing *unnecessarily*: importing `@komnour/report/pdf` — e.g. just to use `ReportDocumentSchema` for validation — never touches skia-canvas at all; only actually calling `renderDocumentToPdf` or `registerServerFonts` does.

### Requirements

- Node.js **16+**
- Works with both `import` (ESM) and `require()` (CJS) — dual-published, see `exports["./pdf"]` in `package.json`.
