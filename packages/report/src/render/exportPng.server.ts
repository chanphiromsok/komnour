import { extractPageDocument } from "../model/tree";
import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";
import { resolveAssetServer } from "./resolveAssetServer";
import { SkiaAdapter } from "./skiaAdapter";

/**
 * This function does NOT register any fonts. Callers must register whatever
 * fonts `doc` needs — e.g. `registerServerFonts()` for the built-in manifest
 * and/or `registerCustomServerFonts(doc.fonts)` for per-document custom
 * fonts — before calling this, since font sources and registration policy
 * are entirely up to the host server/process, not this package.
 */
export async function renderPageToPng(
	doc: ReportDocument,
	pageIndex: number,
	data?: Record<string, unknown>,
	options: { scale?: number } = {},
): Promise<Buffer> {
	const pageId = doc.pages[pageIndex];
	if (!pageId) throw new Error(`Page index out of range: ${pageIndex}`);

	const adapter = new SkiaAdapter(options.scale ?? 1);
	await renderDocument(extractPageDocument(doc, pageId), adapter, data, {
		resolveAsset: resolveAssetServer,
	});
	const bytes = await adapter.currentPageToPng();
	// Wrap without copying, same as renderDocumentToPdf.
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
