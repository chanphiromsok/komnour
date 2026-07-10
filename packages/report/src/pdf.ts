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
export { renderDocumentToPdf } from "./render/exportPdf.server";
export {
	ReportDocumentSchema,
	ReportDocumentTypeBoxSchema,
	type SafeParseResult,
	type SchemaIssue,
} from "./model/schema";
export type { ReportDocument } from "./model/types";

/** Lazy wrapper — see this module's doc comment for why it isn't a plain re-export. */
export async function registerServerFonts(publicDir?: string): Promise<void> {
	const { registerServerFonts: register } = await import("./fonts/registerServer");
	register(publicDir);
}
