import { registerServerFonts } from "../fonts/registerServer";
import { extractPageDocument } from "../model/tree";
import type { ReportDocument } from "../model/types";
import { renderDocument } from "./renderer";
import { SkiaAdapter } from "./skiaAdapter";

export async function renderPageToPng(
	doc: ReportDocument,
	pageIndex: number,
	data?: Record<string, unknown>,
): Promise<Buffer> {
	const pageId = doc.pages[pageIndex];
	if (!pageId) throw new Error(`Page index out of range: ${pageIndex}`);

	registerServerFonts();
	const adapter = new SkiaAdapter();
	await renderDocument(extractPageDocument(doc, pageId), adapter, data);
	return Buffer.from(await adapter.currentPageToPng());
}
