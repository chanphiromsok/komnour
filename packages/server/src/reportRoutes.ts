import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ReportDocumentSchema } from "@komnour/report/src/model/schema";

// The skia-canvas-backed report render modules are imported dynamically
// inside each handler, not at the top of this file: a static import here
// would make skia-canvas's native binary a hard dependency for the whole
// Fastify process (it fails to load if the binary isn't installed), not
// just these two export routes — confirmed by this exact failure mode
// crashing the server at boot before this fix.
const reportFontsDir = join(import.meta.dirname, "../../visual-editor/public");
let fontsRegistered = false;

async function ensureReportFontsRegistered() {
	if (fontsRegistered) return;
	const { registerServerFonts } = await import(
		"@komnour/report/src/fonts/registerServer"
	);
	registerServerFonts(reportFontsDir);
	fontsRegistered = true;
}

interface ExportRequest {
	document: unknown;
	data?: Record<string, unknown>;
	pageIndex?: number;
	scale?: number;
}

/**
 * Accepts either a wrapped request (`{ document, data?, pageIndex? }`) or a
 * bare document posted as the plain top-level JSON. The bare form is detected
 * by the absence of a `document` key — a ReportDocument's own top-level keys
 * are version/pages/nodes/assets/fonts, so there's no ambiguity.
 */
function extractExportRequest(body: unknown): ExportRequest {
	if (body && typeof body === "object" && "document" in body) {
		const wrapped = body as ExportRequest;
		return {
			document: wrapped.document,
			data: wrapped.data,
			pageIndex: wrapped.pageIndex,
			scale: wrapped.scale,
		};
	}
	return { document: body };
}

export function registerReportRoutes(app: FastifyInstance) {
	ensureReportFontsRegistered();
	// POST /report/export/pdf
	// body: { document, data? } OR a bare document as the plain JSON body → application/pdf
	// `data` is optional: a document posted with its own `bindingData` field
	// set is self-contained and needs nothing else, but an explicit `data`
	// here still overrides it (e.g. previewing the same document against
	// different sample data without mutating it).
	app.post("/report/export/pdf", { bodyLimit: 1024 * 2 }, async (req, reply) => {
		const { document, data } = extractExportRequest(req.body);
		const parsed = ReportDocumentSchema.safeParse(document);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid document", issues: parsed.error.issues });
		}
		const effectiveData = data ?? parsed.data.bindingData ?? undefined;
		try {
			const { renderDocumentToPdf } = await import(
				"@komnour/report/src/render/exportPdf.server"
			);
			const buffer = await renderDocumentToPdf(parsed.data, effectiveData);
			reply.header("Content-Type", "application/pdf");
			reply.header("Content-Disposition", 'attachment; filename="report.pdf"');
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});

	// POST /report/export/png
	// body: { document, data?, pageIndex?, scale? } OR a bare document as the plain JSON body → image/png
	// See the pdf route above for why `data` falls back to document.bindingData.
	app.post("/report/export/png", async (req, reply) => {
		const { document, data, pageIndex, scale } = extractExportRequest(req.body);
		const parsed = ReportDocumentSchema.safeParse(document);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid document", issues: parsed.error.issues });
		}
		const effectiveData = data ?? parsed.data.bindingData ?? undefined;
		const renderScale =
			typeof scale === "number" && Number.isFinite(scale)
				? Math.min(Math.max(scale, 0.1), 4)
				: 1;
		try {
			await ensureReportFontsRegistered();
			const { renderPageToPng } = await import(
				"@komnour/report/src/render/exportPng.server"
			);
			const buffer = await renderPageToPng(
				parsed.data,
				pageIndex ?? 0,
				effectiveData,
				{ scale: renderScale },
			);
			reply.header("Content-Type", "image/png");
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});
}
