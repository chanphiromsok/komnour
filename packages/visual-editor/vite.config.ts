import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
const reportSchemaModule = fileURLToPath(
	new URL("../report/src/model/schema.ts", import.meta.url),
);
const registerFontsModule = fileURLToPath(
	new URL("../report/src/fonts/registerServer.ts", import.meta.url),
);
const exportPdfModule = fileURLToPath(
	new URL("../report/src/render/exportPdf.server.ts", import.meta.url),
);
const exportPngModule = fileURLToPath(
	new URL("../report/src/render/exportPng.server.ts", import.meta.url),
);

async function readJsonBody(req: NodeJS.ReadableStream): Promise<unknown> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const raw = Buffer.concat(chunks).toString("utf8");
	return raw ? JSON.parse(raw) : undefined;
}

function extractExportRequest(body: unknown) {
	if (body && typeof body === "object" && "document" in body) {
		const wrapped = body as {
			document: unknown;
			data?: Record<string, unknown>;
			pageIndex?: number;
			scale?: number;
		};
		return {
			document: wrapped.document,
			data: wrapped.data,
			pageIndex: wrapped.pageIndex,
			scale: wrapped.scale,
		};
	}
	return { document: body };
}

function normalizedScale(scale: unknown): number {
	return typeof scale === "number" && Number.isFinite(scale)
		? Math.min(Math.max(scale, 0.1), 4)
		: 1;
}

function komnourReportApiPlugin() {
	return {
		name: "komnour-report-api",
		configureServer(server: ViteDevServer) {
			server.middlewares.use("/api/report/export/png", async (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.end("Method Not Allowed");
					return;
				}
				try {
					const [{ ReportDocumentSchema }, { registerServerFonts }, { renderPageToPng }] =
						await Promise.all([
							server.ssrLoadModule(reportSchemaModule),
							server.ssrLoadModule(registerFontsModule),
							server.ssrLoadModule(exportPngModule),
						]);
					registerServerFonts(publicDir);
					const { document, data, pageIndex, scale } = extractExportRequest(
						await readJsonBody(req),
					);
					const parsed = ReportDocumentSchema.safeParse(document);
					if (!parsed.success) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Invalid document",
								issues: parsed.error.issues,
							}),
						);
						return;
					}
					const buffer = await renderPageToPng(
						parsed.data,
						pageIndex ?? 0,
						data ?? parsed.data.bindingData ?? undefined,
						{ scale: normalizedScale(scale) },
					);
					res.statusCode = 200;
					res.setHeader("Content-Type", "image/png");
					res.end(buffer);
				} catch (err) {
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: err instanceof Error ? err.message : String(err),
						}),
					);
				}
			});

			server.middlewares.use("/api/report/export/pdf", async (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.end("Method Not Allowed");
					return;
				}
				try {
					const [
						{ ReportDocumentSchema },
						{ registerServerFonts },
						{ renderDocumentToPdf },
					] = await Promise.all([
						server.ssrLoadModule(reportSchemaModule),
						server.ssrLoadModule(registerFontsModule),
						server.ssrLoadModule(exportPdfModule),
					]);
					registerServerFonts(publicDir);
					const { document, data } = extractExportRequest(await readJsonBody(req));
					const parsed = ReportDocumentSchema.safeParse(document);
					if (!parsed.success) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Invalid document",
								issues: parsed.error.issues,
							}),
						);
						return;
					}
					const buffer = await renderDocumentToPdf(
						parsed.data,
						data ?? parsed.data.bindingData ?? undefined,
					);
					res.statusCode = 200;
					res.setHeader("Content-Type", "application/pdf");
					res.setHeader("Content-Disposition", 'attachment; filename="report.pdf"');
					res.end(buffer);
				} catch (err) {
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: err instanceof Error ? err.message : String(err),
						}),
					);
				}
			});
		},
	};
}

export default defineConfig({
	plugins: [komnourReportApiPlugin(), tailwindcss(), react()],
	resolve: {
		alias: {
			"#": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 5174,
		fs: { allow: ["../.."] },
	},
	base: "/komnour/",
});
