# @komnour/report

The document model, schema validation, layout, and renderer behind the [Komnour](../../README.md) visual editor. Most of this package is for internal use across the monorepo (the editor's live preview, the export server), but it also ships one small, standalone, **Node.js-only** entry point:

## `@komnour/report/pdf` — JSON in, PDF out

```bash
npm install @komnour/report
```

```ts
import {
	registerServerFonts,
	registerCustomServerFonts,
	ReportDocumentSchema,
	renderDocumentToPdf,
} from "@komnour/report/pdf";
import { writeFile } from "node:fs/promises";

const parsed = ReportDocumentSchema.safeParse(await fetchYourDocumentJson());
if (!parsed.success) {
	throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
}

// renderDocumentToPdf does not register any fonts itself — do it once
// (e.g. at server startup) with whatever fonts your documents need.
await registerServerFonts("/path/to/your/fonts");
// If the document carries its own custom (per-document) fonts, register
// those too — see `registerCustomServerFonts` below.
await registerCustomServerFonts(parsed.data.fonts);

const pdf = await renderDocumentToPdf(parsed.data, { customer: { name: "Ada" } });
await writeFile("report.pdf", pdf);
```

Works identically with `require()`:

```js
const { renderDocumentToPdf, ReportDocumentSchema } = require("@komnour/report/pdf");
```

This entry point is deliberately narrow — it never imports the editor-facing model helpers, the browser (`Worker`/`OffscreenCanvas`) renderer, or PNG export. If you need those, see the [root README](../../README.md); this document is only about the minimal PDF-export surface.

### Using it with Express

Register fonts once at startup, then validate + render inside the route
handler — the same shape this monorepo's own Fastify server uses in
`packages/server/src/reportRoutes.ts`:

```ts
import express from "express";
import {
	registerServerFonts,
	registerCustomServerFonts,
	ReportDocumentSchema,
	renderDocumentToPdf,
} from "@komnour/report/pdf";

const app = express();
// Documents can embed data: URL images/fonts, which routinely exceed
// Express's default 100kb JSON body limit well before the document is
// otherwise unusual.
app.use(express.json({ limit: "20mb" }));

// Register your font manifest once, before the server starts accepting
// requests — renderDocumentToPdf does not register any fonts itself.
await registerServerFonts("/path/to/your/fonts");

app.post("/report/export/pdf", async (req, res) => {
	const parsed = ReportDocumentSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: "Invalid document", issues: parsed.error.issues });
	}

	try {
		// Register any custom fonts embedded on this particular document —
		// cheap to call per-request, registration is tracked per font id.
		await registerCustomServerFonts(parsed.data.fonts);

		const pdf = await renderDocumentToPdf(parsed.data, req.body.data);
		res.set({
			"Content-Type": "application/pdf",
			"Content-Disposition": 'attachment; filename="report.pdf"',
			"Cache-Control": "no-store",
		});
		res.send(pdf);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

app.listen(3000);
```

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

**Does not register any fonts.** Font registration is entirely the caller's responsibility — see [Fonts](#fonts) below — since font sources and registration policy (which fonts, where they live, when to register them) vary per deployment and can't be guessed by this package.

Powered by real Skia (`skia-canvas`, a native addon) — see [Native dependency](#native-dependency-skia-canvas) below before deploying.

#### `registerServerFonts(publicDir?: string, fonts?: FontDefinition[]): Promise<void>`

Registers font files so `renderDocumentToPdf` can use them. **No font files ship in this package** — you provide them. You must call this yourself (typically once, at process startup) before calling `renderDocumentToPdf` on any document that needs these fonts:

1. **Supplying your own fonts.** Pass a custom `fonts` list (a "theme," a per-tenant font set, whatever) instead of the built-in `FONT_MANIFEST`:

   ```ts
   import { registerServerFonts } from "@komnour/report/pdf";

   await registerServerFonts("/path/to/your/fonts", [
   	{ id: "brand-400", family: "Brand Sans", weight: 400, style: "normal", source: "/BrandSans.ttf" },
   ]);
   ```

   `source` is resolved as `path.join(publicDir, source)`; for a font living somewhere else entirely, pass `publicDir: ""` and make `source` an absolute path.

2. **Registering more fonts later.** Registration is tracked per font *family*, not as a single one-time flag — calling this again with a font list that includes new families registers just those; families already registered are skipped, so calling it repeatedly with overlapping lists (e.g. once per request in a long-lived server) stays cheap. This means you can register a base set at startup and add more (a different theme's fonts, loaded on demand) later in the process's lifetime — nothing after the first call was silently a no-op.

#### `registerCustomServerFonts(fonts: Record<string, FontDefinition> | FontDefinition[]): Promise<void>`

Registers fonts embedded directly on a document as `data:` URLs — e.g. custom fonts a user imported into the Komnour visual editor and saved onto `doc.fonts` — as opposed to `registerServerFonts`' fixed, on-disk `FONT_MANIFEST`. Call this with `doc.fonts` before rendering any document that carries its own custom fonts:

```ts
import { registerCustomServerFonts } from "@komnour/report/pdf";

await registerCustomServerFonts(parsed.data.fonts);
```

Registration is tracked per font *id* (not family — two different custom fonts could coincidentally share a family name), so calling this again with the same document's fonts (e.g. once per request) stays cheap. A font that fails to decode or register is skipped rather than failing the whole call.

#### `FONT_MANIFEST`

The built-in font list `registerServerFonts` uses by default — Inter, Roboto, Battambang, Noto Sans Khmer, Khmer OS Moul, and Wingdings 2. Exported as a reference for the shape `registerServerFonts`'s `fonts` parameter expects; none of these files are included in this package (see below).

### Fonts

Font *files* are not part of this npm package — only the `FONT_MANIFEST` metadata (family/weight/style/relative path) is. `renderDocumentToPdf` never registers fonts on its own — call `registerServerFonts`/`registerCustomServerFonts` yourself before rendering. If you use the default manifest, you need to supply your own copies of those files (see `FONT_MANIFEST` for exactly which family/weight/style/filename each entry expects) under whatever `publicDir` you pass to `registerServerFonts`, or pass your own `fonts` list pointing at fonts you already have. If you never call `registerServerFonts` with valid paths, `skia-canvas` falls back to whatever fonts are installed on the host system — which will not visually match the Komnour editor's output.

### Native dependency: skia-canvas

`renderDocumentToPdf` is backed by [`skia-canvas`](https://github.com/samizdatco/skia-canvas), a native addon with a prebuilt binary fetched at install time. Two things worth knowing:

- It supports Node back to **v12.22+/14.17+/15.12+/16+** — matching this package's own `engines.node: ">=16"`.
- If its prebuilt binary can't be fetched for your platform at install time (a restricted network, an unsupported target), the module fails to load. This package protects against that failing *unnecessarily*: importing `@komnour/report/pdf` — e.g. just to use `ReportDocumentSchema` for validation — never touches skia-canvas at all; only actually calling `renderDocumentToPdf`, `registerServerFonts`, or `registerCustomServerFonts` does.

### Requirements

- Node.js **16+**
- Works with both `import` (ESM) and `require()` (CJS) — dual-published, see `exports["./pdf"]` in `package.json`.
