import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	registerCustomServerFonts,
	registerServerFonts,
} from "../../report/src/fonts/registerServer";
import { sampleReportDocument } from "../../report/src/model/sample";
import type { ReportDocument } from "../../report/src/model/types";
import { renderDocumentToPdf } from "../../report/src/render/exportPdf.server";

/**
 * Standalone CLI export, independent of the dev server/browser — for running
 * on a machine where skia-canvas's native binary is actually installed.
 * Reuses the exact same renderDocumentToPdf the web app's export button and
 * oRPC/HTTP routes call, so there is no second, divergent rendering path.
 *
 * renderDocumentToPdf does not register any fonts itself, so this script
 * registers the visual editor's own font manifest (from its `public/`
 * directory, the same fonts the browser preview fetches) plus any custom
 * fonts embedded on the document before rendering.
 *
 * Usage:
 *   npx tsx scripts/export-report.ts                       # sample doc -> report.pdf
 *   npx tsx scripts/export-report.ts my-document.json out.pdf
 */
async function main() {
	const [, , inputPath, outputPath = "report.pdf"] = process.argv;
	const doc: ReportDocument = inputPath
		? JSON.parse(await readFile(inputPath, "utf8"))
		: sampleReportDocument;

	registerServerFonts(join(import.meta.dirname, "../public"));
	registerCustomServerFonts(doc.fonts);

	const buffer = await renderDocumentToPdf(doc);
	await writeFile(outputPath, buffer);
	console.log(`Wrote ${outputPath} (${buffer.length} bytes)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
