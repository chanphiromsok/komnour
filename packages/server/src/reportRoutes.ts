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

interface ExportPdfBody {
	document: unknown;
	data?: Record<string, unknown>;
}

interface ExportPngBody extends ExportPdfBody {
	pageIndex?: number;
}

export function registerReportRoutes(app: FastifyInstance) {
	// POST /report/export/pdf  body: { document, data? }  → application/pdf
	app.post<{ Body: ExportPdfBody }>("/report/export/pdf", async (req, reply) => {
		const parsed = ReportDocumentSchema.safeParse(req.body?.document);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid document", issues: parsed.error.issues });
		}
		try {
			await ensureReportFontsRegistered();
			const { renderDocumentToPdf } = await import(
				"@komnour/report/src/render/exportPdf.server"
			);
			const buffer = await renderDocumentToPdf(parsed.data, req.body.data);
			reply.header("Content-Type", "application/pdf");
			reply.header("Content-Disposition", 'attachment; filename="report.pdf"');
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});

	// POST /report/export/png  body: { document, data?, pageIndex? }  → image/png
	app.post<{ Body: ExportPngBody }>("/report/export/png", async (req, reply) => {
		const parsed = ReportDocumentSchema.safeParse(req.body?.document);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid document", issues: parsed.error.issues });
		}
		try {
			await ensureReportFontsRegistered();
			const { renderPageToPng } = await import(
				"@komnour/report/src/render/exportPng.server"
			);
			const buffer = await renderPageToPng(
				parsed.data,
				req.body.pageIndex ?? 0,
				req.body.data,
			);
			reply.header("Content-Type", "image/png");
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});
}
