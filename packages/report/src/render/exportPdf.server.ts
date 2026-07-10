import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";

/**
 * registerServerFonts, resolveAssetServer, and SkiaAdapter all statically
 * import skia-canvas — a native addon that fails to even load its module if
 * the platform-specific prebuilt binary isn't installed. Importing them
 * dynamically here (rather than at this module's top level) means simply
 * importing `renderDocumentToPdf` — or anything else re-exported alongside
 * it from ./pdf.ts, like the schema for validating a document without
 * rendering it at all — never touches skia-canvas until this function is
 * actually called.
 */
export async function renderDocumentToPdf(
	doc: ReportDocument,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	const [
		{ registerServerFonts, registerCustomServerFonts },
		{ resolveAssetServer },
		{ SkiaAdapter },
	] = await Promise.all([
		import("../fonts/registerServer"),
		import("./resolveAssetServer"),
		import("./skiaAdapter"),
	]);
	registerServerFonts();
	registerCustomServerFonts(doc.fonts);
	const adapter = new SkiaAdapter();
	const bytes = await renderDocument(doc, adapter, data, {
		resolveAsset: resolveAssetServer,
	});
	return Buffer.from(bytes ?? new Uint8Array());
}
