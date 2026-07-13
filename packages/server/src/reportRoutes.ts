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

/**
 * Peak memory under load is driven by how many exports render at once —
 * each in-flight render holds its own canvas pages, decoded image assets,
 * and the finished PDF/PNG buffer simultaneously, so N concurrent requests
 * cost N times the peak of one. This gate caps concurrent renders (FIFO for
 * the rest), trading a little latency under burst for a flat memory
 * ceiling. Tune with REPORT_RENDER_CONCURRENCY (default 2).
 */
function createRenderGate(limit: number) {
	let active = 0;
	const waiting: (() => void)[] = [];
	return async function gated<T>(task: () => Promise<T>): Promise<T> {
		if (active >= limit) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		active++;
		try {
			return await task();
		} finally {
			active--;
			waiting.shift()?.();
		}
	};
}

const renderGate = createRenderGate(
	Math.max(1, Number(process.env.REPORT_RENDER_CONCURRENCY) || 2),
);

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

export async function registerReportRoutes(app: FastifyInstance) {
	await ensureReportFontsRegistered();
	// POST /report/export/pdf
	// body: { document, data? } OR a bare document as the plain JSON body → application/pdf
	// `data` is optional: a document posted with its own `bindingData` field
	// set is self-contained and needs nothing else, but an explicit `data`
	// here still overrides it (e.g. previewing the same document against
	// different sample data without mutating it).
	// 20MB body limit — documents can embed data: URL images and now custom
	// fonts (see ImportFontDialog), either of which routinely exceeds
	// Fastify's 1MB default well before the document is otherwise unusual.
	app.post("/report/export/pdf", { bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
		const { document, data } = extractExportRequest(req.body);
		const parsed = ReportDocumentSchema.safeParse(document);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid document", issues: parsed.error.issues });
		}
		const effectiveData = data ?? parsed.data.bindingData ?? undefined;
		try {
			await ensureReportFontsRegistered();
			const { registerCustomServerFonts } = await import(
				"@komnour/report/src/fonts/registerServer"
			);
			registerCustomServerFonts(parsed.data.fonts);
			const { renderDocumentToPdf } = await import(
				"@komnour/report/src/render/exportPdf.server"
			);
			const buffer = await renderGate(() =>
				renderDocumentToPdf(parsed.data, effectiveData),
			);
			reply.header("Content-Type", "application/pdf");
			reply.header("Content-Disposition", 'attachment; filename="report.pdf"');
			reply.header("Cache-Control", "no-store");
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});

	// POST /report/export/png
	// body: { document, data?, pageIndex?, scale? } OR a bare document as the plain JSON body → image/png
	// See the pdf route above for why `data` falls back to document.bindingData,
	// and for the body limit, why it's raised from Fastify's 1MB default.
	app.post("/report/export/png", { bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
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
			const { registerCustomServerFonts } = await import(
				"@komnour/report/src/fonts/registerServer"
			);
			registerCustomServerFonts(parsed.data.fonts);
			const { renderPageToPng } = await import(
				"@komnour/report/src/render/exportPng.server"
			);
			const buffer = await renderGate(() =>
				renderPageToPng(parsed.data, pageIndex ?? 0, effectiveData, {
					scale: renderScale,
				}),
			);
			reply.header("Content-Type", "image/png");
			reply.header("Cache-Control", "no-store");
			return reply.send(buffer);
		} catch (err: any) {
			return reply.status(500).send({ error: err.message });
		}
	});
}
