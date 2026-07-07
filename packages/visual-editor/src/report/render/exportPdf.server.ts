import { registerServerFonts } from "../fonts/registerServer";
import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";
import { SkiaAdapter } from "./skiaAdapter";

export async function renderDocumentToPdf(
	doc: ReportDocument,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	registerServerFonts();
	const adapter = new SkiaAdapter();
	const bytes = await renderDocument(doc, adapter, data);
	return Buffer.from(bytes ?? new Uint8Array());
}
