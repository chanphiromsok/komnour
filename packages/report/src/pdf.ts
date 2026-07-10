/**
 * Minimal Node.js-only entry point: validate a JSON report document and
 * render it to a PDF buffer. Nothing here touches browser-only code
 * (browserCanvasAdapter.ts, registerBrowser.ts, resolveAssetBrowser.ts),
 * the PNG export path, or the visual editor's tree-manipulation helpers —
 * see this package's README for the full (editor-facing) API surface if
 * you need more than "JSON in, PDF out".
 *
 * Nothing at this module's own top level imports skia-canvas (a native
 * addon that fails to load at all if its platform-specific prebuilt binary
 * isn't installed) — `renderDocumentToPdf` only reaches it via a dynamic
 * import inside the function body, and `registerServerFonts` below is a
 * thin lazy wrapper for the same reason. That means `import "@komnour/
 * report/pdf"` — e.g. just to use `ReportDocumentSchema` for validation —
 * can never fail on skia-canvas alone; only actually calling
 * `renderDocumentToPdf`/`registerServerFonts` can.
 */
import type { FontDefinition } from "./model/types";

export { renderDocumentToPdf } from "./render/exportPdf.server";
export {
	ReportDocumentSchema,
	ReportDocumentTypeBoxSchema,
	type SafeParseResult,
	type SchemaIssue,
} from "./model/schema";
export type { FontDefinition, ReportDocument } from "./model/types";
// No font files ship in this package — registerServerFonts() expects a
// directory laid out per FONT_MANIFEST's `source` paths (e.g.
// "<publicDir>/fonts/Inter[opsz,wght].ttf") by default. Exported so
// consumers can see exactly which families/files it looks for without
// reading the source, or use it as a template for a custom font list.
export { FONT_MANIFEST } from "./fonts/manifest";

/**
 * Lazy wrapper — see this module's doc comment for why it isn't a plain
 * re-export. `fonts` defaults to FONT_MANIFEST but any font list can be
 * passed instead (e.g. your own per-document/per-theme font selection);
 * registration is tracked per font family, not as a one-time flag, so
 * calling this again with a *different* list still registers what's new.
 */
export async function registerServerFonts(
	publicDir?: string,
	fonts?: FontDefinition[],
): Promise<void> {
	const { registerServerFonts: register } = await import("./fonts/registerServer");
	register(publicDir, fonts);
}
