import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";

/**
 * resolveAssetServer and SkiaAdapter both statically import skia-canvas — a
 * native addon that fails to even load its module if the platform-specific
 * prebuilt binary isn't installed. Importing them dynamically here (rather
 * than at this module's top level) means simply importing
 * `renderDocumentToPdf` — or anything else re-exported alongside it from
 * ./pdf.ts, like the schema for validating a document without rendering it
 * at all — never touches skia-canvas until this function is actually
 * called.
 *
 * This function does NOT register any fonts. Callers must register
 * whatever fonts `doc` needs — e.g. `registerServerFonts()` for the built-in
 * manifest and/or `registerCustomServerFonts(doc.fonts)` for per-document
 * custom fonts — before calling this, since font sources and registration
 * policy are entirely up to the host server/process, not this package.
 */
export async function renderDocumentToPdf(
	doc: ReportDocument,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	const [{ resolveAssetServer }, { SkiaAdapter }] = await Promise.all([
		import("./resolveAssetServer"),
		import("./skiaAdapter"),
	]);
	const adapter = new SkiaAdapter();
	const bytes = await renderDocument(doc, adapter, data, {
		resolveAsset: resolveAssetServer,
	});
	if (!bytes) return Buffer.alloc(0);
	// Wrap the rendered bytes without copying — Buffer.from(bytes) would
	// duplicate the entire PDF just to change its type.
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
