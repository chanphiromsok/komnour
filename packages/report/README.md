# @komnour/report

The document model, schema validation, layout, and renderer behind the [Komnour](../../README.md) visual editor. Most of this package is for internal use across the monorepo (the editor's live preview, the export server), but it also ships one small, standalone, **Node.js-only** entry point:

## `@komnour/report/pdf` — JSON in, PDF out

```bash
npm install @komnour/report
```

This entry point is deliberately low-level: it hands you the render function, the Skia-backed adapter, and skia-canvas's own `FontLibrary` directly, rather than a single opinionated `renderDocumentToPdf` call — that way font registration, image resolution, and validation are entirely up to you and your deployment, not baked into this package.

```ts
import { renderDocument, SkiaAdapter, FontLibrary } from "@komnour/report/pdf";
import type { ReportDocument } from "@komnour/report/pdf";
import { writeFile } from "node:fs/promises";

// Register whatever fonts your documents need — once, e.g. at process
// startup. renderDocument does not register any fonts itself.
FontLibrary.use("Inter", ["/path/to/fonts/Inter-Regular.ttf"]);

async function renderDocumentToPdf(
	doc: ReportDocument,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	const adapter = new SkiaAdapter();
	const bytes = await renderDocument(doc, adapter, data);
	return Buffer.from(bytes ?? new Uint8Array());
}

const doc: ReportDocument = await fetchYourDocumentJson();
const pdf = await renderDocumentToPdf(doc, { customer: { name: "Ada" } });
await writeFile("report.pdf", pdf);
```

Works identically with `require()`:

```js
const { renderDocument, SkiaAdapter, FontLibrary } = require("@komnour/report/pdf");
```

This entry point never imports the editor-facing model helpers, the browser (`Worker`/`OffscreenCanvas`) renderer, or PNG export. If you need those, see the [root README](../../README.md); this document is only about the minimal PDF-export surface.

### Using it with Express

Register fonts once at startup, then render inside the route handler:

```ts
import express from "express";
import {
	renderDocument,
	resolveAssetServer,
	ReportDocumentSchema,
	SkiaAdapter,
	FontLibrary,
} from "@komnour/report/pdf";

const app = express();
// Documents can embed data: URL images/fonts, which routinely exceed
// Express's default 100kb JSON body limit well before the document is
// otherwise unusual.
app.use(express.json({ limit: "20mb" }));

// Register your fonts once, before the server starts accepting requests —
// renderDocument does not register any fonts itself.
FontLibrary.use("Inter", ["/path/to/fonts/Inter-Regular.ttf"]);

app.post("/report/export/pdf", async (req, res) => {
	const parsed = ReportDocumentSchema.safeParse(req.body.document);
	if (!parsed.success) {
		res.status(400).json({ error: "Invalid document", issues: parsed.error.issues });
		return;
	}
	const data = req.body.data as Record<string, unknown> | undefined;

	try {
		const adapter = new SkiaAdapter();
		const bytes = await renderDocument(parsed.data, adapter, data, {
			resolveAsset: resolveAssetServer, // only needed if documents contain image nodes
		});
		res.set({
			"Content-Type": "application/pdf",
			"Content-Disposition": 'attachment; filename="report.pdf"',
			"Cache-Control": "no-store",
		});
		res.send(Buffer.from(bytes ?? new Uint8Array()));
	} catch (err) {
		res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
	}
});

app.listen(3000);
```

### API

#### `renderDocument(doc: ReportDocument, adapter: RendererAdapter, data?: Record<string, unknown>, options?: RenderOptions): Promise<Uint8Array | undefined>`

Renders every page of `doc` through `adapter` and returns the finished document's bytes (for `SkiaAdapter`, a PDF). `data` resolves `{{dot.path}}` bindings in text nodes and the bound state of checkbox (`checkedBinding`) and QR code (`valueBinding`) nodes; when omitted, falls back to `doc.bindingData` if the document carries its own.

**Does not register any fonts and does not validate `doc`.** Both are entirely the caller's responsibility — font sources/policy and input trust boundaries vary per deployment and can't be guessed by this package. For validation, `ReportDocumentSchema` (below) is exported ready to use.

`options.resolveAsset` is only required if `doc` contains `image` nodes — it resolves an `Asset` to its decoded bytes/dimensions; without it, image nodes are silently skipped. Pass the exported `resolveAssetServer` (reads `data:`/`file:`/`http(s):`/local-path asset URLs), or supply your own if your assets live somewhere it can't reach.

#### `ReportDocumentSchema`

`ReportDocumentSchema.safeParse(value)` validates an untrusted JSON payload against the document model and returns `{ success: true, data }` or `{ success: false, error: { issues } }` (each issue has `path` and `message`). Use it before rendering anything that arrives over the network.

#### `resolveAssetServer`

The Node-side `options.resolveAsset` implementation used by the Komnour export server: decodes `data:` URLs, reads `file:` URLs and plain paths from disk, and fetches `http(s):` URLs.

> **Security note:** because it reads local files and fetches arbitrary URLs named *inside the document*, only pass it for documents you trust. If untrusted users can submit documents to your endpoint, supply your own `resolveAsset` that restricts asset URLs to sources you control (e.g. `data:` only, or an allowlisted host).

#### `SkiaAdapter`

The `RendererAdapter` implementation `renderDocument` needs for server-side rendering, backed by real Skia (`skia-canvas`, a native addon — see [Native dependency](#native-dependency-skia-canvas) below). Construct one per render: `new SkiaAdapter(pixelRatio?)`.

#### `FontLibrary`

Re-exported directly from `skia-canvas` — call `FontLibrary.use(family, paths)` to register font files before rendering any document that needs them. See [skia-canvas's own docs](https://github.com/samizdatco/skia-canvas#fontlibrary) for the full API (weight/style variants, listing installed fonts, etc.).

### Fonts

Font *files* are not part of this npm package. Register whatever fonts your documents need via `FontLibrary.use(family, paths)` before calling `renderDocument` — if you never register a font a document references, `skia-canvas` falls back to whatever fonts are installed on the host system.

### Native dependency: skia-canvas

`SkiaAdapter` is backed by [`skia-canvas`](https://github.com/samizdatco/skia-canvas), a native addon with a prebuilt binary fetched at install time. Two things worth knowing:

- It supports Node back to **v12.22+/14.17+/15.12+/16+** — matching this package's own `engines.node: ">=16"`.
- If its prebuilt binary can't be fetched for your platform at install time (a restricted network, an unsupported target), the module fails to load. Unlike this package's earlier PDF-export helper, `@komnour/report/pdf` now re-exports `SkiaAdapter`/`FontLibrary` directly (not behind a dynamic import), so simply `import`-ing `@komnour/report/pdf` loads skia-canvas immediately — there's no way to import this entry point without it.

### Requirements

- Node.js **16+**
- Works with both `import` (ESM) and `require()` (CJS) — dual-published, see `exports["./pdf"]` in `package.json`.
