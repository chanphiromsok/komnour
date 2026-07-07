import { readFile, writeFile } from "node:fs/promises";
import { sampleReportDocument } from "../src/report/model/sample";
import type { ReportDocument } from "../src/report/model/types";
import { renderDocumentToPdf } from "../src/report/render/exportPdf.server";

/**
 * Standalone CLI export, independent of the dev server/browser — for running
 * on a machine where skia-canvas's native binary is actually installed.
 * Reuses the exact same renderDocumentToPdf the web app's export button and
 * oRPC/HTTP routes call, so there is no second, divergent rendering path.
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

	const buffer = await renderDocumentToPdf(doc);
	await writeFile(outputPath, buffer);
	console.log(`Wrote ${outputPath} (${buffer.length} bytes)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
