import { registerServerFonts } from "../fonts/registerServer";
import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";
import { resolveAssetServer } from "./resolveAssetServer";
import { SkiaAdapter } from "./skiaAdapter";

export async function renderDocumentToPdf(
	doc: ReportDocument,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	registerServerFonts();
	const adapter = new SkiaAdapter();
	const bytes = await renderDocument(doc, adapter, data, {
		resolveAsset: resolveAssetServer,
	});
	return Buffer.from(bytes ?? new Uint8Array());
}
