/**
 * Memory/CPU benchmark for the server-side PDF pipeline. Run it on any
 * commit to get comparable numbers — nothing here depends on the
 * optimizations it exists to measure.
 *
 *   pnpm --filter @komnour/report build
 *   node --expose-gc packages/report/scripts/bench-pdf.mjs --pages 30 --runs 6
 *   node --expose-gc packages/report/scripts/bench-pdf.mjs --runs 8 --concurrency 8
 *   node --expose-gc packages/report/scripts/bench-pdf.mjs --doc path/to/document.json
 *   node --expose-gc packages/report/scripts/bench-pdf.mjs --snapshot
 *
 * IMPORTANT when reading the numbers: skia-canvas's canvases and the
 * finished PDF bytes live in NATIVE memory, outside the V8 heap — a heap
 * snapshot/heapdump will barely show them. "rss" is the ground truth;
 * "external"/"arrayBuffers" show the Buffer-visible slice of it. That's
 * also why --max-old-space-size never bounds this kind of memory.
 *
 * Flags:
 *   --pages N        synthetic document page count (default 30; ignored with --doc)
 *   --runs N         how many exports to render (default 5)
 *   --concurrency N  how many render at once (default 1)
 *   --image-mb N     embed an ~N MB incompressible image in the synthetic doc.
 *                    The default image is 1x1 px, which makes the PDFs tiny —
 *                    fine for CPU numbers, but buffer-copy effects scale with
 *                    PDF size and only become measurable with real weight.
 *   --doc PATH       benchmark a real document JSON instead of the synthetic one
 *   --snapshot       write V8 .heapsnapshot files before/after (see caveat above)
 *   --out PATH       also write the last rendered PDF here, to eyeball correctness
 */
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// 1x1 PNG. Tiny on purpose: the point is exercising the image node path
// (decode + per-render asset memo), not measuring image payload size —
// pass --doc with a real document to measure that.
const TINY_PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const TEXT_STYLE = {
	fontFamily: "Inter",
	fontSize: 11,
	fontWeight: 400,
	fontStyle: "normal",
	color: "#111111",
	lineHeight: 1.4,
	letterSpacing: 0,
	align: "left",
	verticalAlign: "top",
	decoration: "none",
	wrap: true,
};

/**
 * A deterministic multi-page document exercising every node type the
 * renderer draws (text with bindings, rects, lines, checkbox, QR code, and
 * an image asset shared by every page). Exported so tests can validate it
 * against the schema without loading skia-canvas.
 */
export function buildSyntheticDocument(pageCount, imageDataUrl = TINY_PNG_DATA_URL) {
	const nodes = {};
	const pages = [];
	const paragraph =
		"This paragraph exists to give the text shaper something realistic to " +
		"wrap: several sentences of plain prose, long enough to span multiple " +
		"lines at eleven points, repeated on every page of the benchmark " +
		"document so text layout cost shows up proportionally in the totals. ";

	for (let i = 0; i < pageCount; i++) {
		const pageId = `page-${i}`;
		pages.push(pageId);
		const childIds = [];
		const child = (suffix, node) => {
			const id = `${suffix}-${i}`;
			childIds.push(id);
			nodes[id] = {
				id,
				parentId: pageId,
				children: [],
				name: suffix,
				visible: true,
				locked: false,
				opacity: 1,
				...node,
			};
		};

		child("title", {
			type: "text",
			text: `Benchmark page ${i + 1} — customer {{customer.name}}`,
			frame: { x: 48, y: 48, width: 499, height: 24, rotation: 0 },
			style: { ...TEXT_STYLE, fontSize: 16, fontWeight: 700 },
		});
		child("body-a", {
			type: "text",
			text: paragraph.repeat(3),
			frame: { x: 48, y: 84, width: 499, height: 120, rotation: 0 },
			style: TEXT_STYLE,
		});
		child("body-b", {
			type: "text",
			text: paragraph.repeat(3),
			frame: { x: 48, y: 216, width: 499, height: 120, rotation: 0 },
			style: TEXT_STYLE,
		});
		child("panel", {
			type: "rect",
			frame: { x: 48, y: 348, width: 240, height: 120, rotation: 0 },
			fill: { color: "#f3f4f6" },
			stroke: { color: "#999999", width: 1 },
		});
		child("logo", {
			type: "image",
			frame: { x: 307, y: 348, width: 120, height: 120, rotation: 0 },
			assetId: "img-1",
			fit: "contain",
		});
		child("qr", {
			type: "qrcode",
			frame: { x: 447, y: 348, width: 100, height: 100, rotation: 0 },
			value: `https://example.com/doc/${i}`,
			color: "#000000",
		});
		child("approved", {
			type: "checkbox",
			frame: { x: 48, y: 490, width: 180, height: 18, rotation: 0 },
			checked: false,
			checkedBinding: "approved",
			fill: { color: "#ffffff" },
			stroke: { color: "#999999", width: 1 },
			checkColor: "#111111",
			label: "Approved",
			labelStyle: { ...TEXT_STYLE, verticalAlign: "middle", wrap: false },
		});
		child("divider", {
			type: "line",
			frame: { x: 48, y: 520, width: 499, height: 0, rotation: 0 },
			x1: 0,
			y1: 0,
			x2: 499,
			y2: 0,
			stroke: { color: "#333333", width: 1 },
		});

		nodes[pageId] = {
			id: pageId,
			parentId: null,
			children: childIds,
			name: `Page ${i + 1}`,
			visible: true,
			locked: false,
			opacity: 1,
			type: "page",
			frame: { x: 0, y: 0, width: 595, height: 842, rotation: 0 },
			paper: { preset: "A4", orientation: "portrait" },
			margin: { top: 48, right: 48, bottom: 48, left: 48 },
			background: "#ffffff",
		};
	}

	return {
		version: 1,
		pages,
		nodes,
		assets: {
			"img-1": { id: "img-1", kind: "image", url: imageDataUrl },
		},
		fonts: {},
		bindingData: { customer: { name: "Ada Lovelace" }, approved: true },
	};
}

function parseCliArgs(argv) {
	const opts = {
		pages: 30,
		runs: 5,
		concurrency: 1,
		imageMb: 0,
		docPath: null,
		snapshot: false,
		out: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => argv[++i];
		if (arg === "--pages") opts.pages = Number(next());
		else if (arg === "--runs") opts.runs = Number(next());
		else if (arg === "--concurrency") opts.concurrency = Number(next());
		else if (arg === "--image-mb") opts.imageMb = Number(next());
		else if (arg === "--doc") opts.docPath = resolve(next());
		else if (arg === "--snapshot") opts.snapshot = true;
		else if (arg === "--out") opts.out = resolve(next());
		else {
			console.error(`Unknown flag: ${arg}`);
			process.exit(1);
		}
	}
	for (const key of ["pages", "runs", "concurrency"]) {
		if (!Number.isFinite(opts[key]) || opts[key] < 1) {
			console.error(`--${key} must be a positive number`);
			process.exit(1);
		}
	}
	if (!Number.isFinite(opts.imageMb) || opts.imageMb < 0) {
		console.error("--image-mb must be a non-negative number");
		process.exit(1);
	}
	return opts;
}

/**
 * Builds an ~sizeMb data: URL PNG of random noise. Noise defeats PNG (and
 * the PDF backend's) compression, so the bytes keep their full weight all
 * the way into the finished PDF — which is the point: buffer-copy effects
 * scale with output size and are invisible on tiny PDFs. Rendered through
 * skia-canvas itself, which is already a dependency of the render path.
 */
async function makeNoiseImageDataUrl(sizeMb) {
	const { randomFillSync } = await import("node:crypto");
	const { Canvas } = await import("skia-canvas");
	const side = Math.max(64, Math.round(Math.sqrt((sizeMb * MB) / 4)));
	const canvas = new Canvas(side, side);
	canvas.gpu = false;
	const ctx = canvas.getContext("2d");
	const image = ctx.createImageData(side, side);
	randomFillSync(image.data);
	ctx.putImageData(image, 0, 0);
	const png = await canvas.png;
	return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

const MB = 1024 * 1024;
const fmt = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

function printUsage(label, usage) {
	console.log(
		`${label.padEnd(22)} rss ${fmt(usage.rss).padStart(10)}   heapUsed ${fmt(
			usage.heapUsed,
		).padStart(9)}   external ${fmt(usage.external).padStart(9)}   arrayBuffers ${fmt(
			usage.arrayBuffers,
		).padStart(9)}`,
	);
}

/** Samples process.memoryUsage() every 25ms and keeps the per-field peaks. */
function startSampler() {
	let peak = process.memoryUsage();
	const timer = setInterval(() => {
		const now = process.memoryUsage();
		for (const key of Object.keys(peak)) {
			if (now[key] > peak[key]) peak[key] = now[key];
		}
	}, 25);
	timer.unref();
	return {
		reset() {
			peak = process.memoryUsage();
		},
		peak: () => peak,
		stop: () => clearInterval(timer),
	};
}

function createLimiter(limit) {
	let active = 0;
	const waiting = [];
	return async (task) => {
		if (active >= limit) await new Promise((r) => waiting.push(r));
		active++;
		try {
			return await task();
		} finally {
			active--;
			waiting.shift()?.();
		}
	};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(gc) {
	// Two GC passes with a pause between: the first often only queues
	// finalizers whose memory the second actually returns.
	gc?.();
	await sleep(60);
	gc?.();
	await sleep(60);
}

async function main() {
	const opts = parseCliArgs(process.argv.slice(2));

	let api;
	try {
		api = await import(pathToFileURL(join(here, "../dist/pdf.mjs")).href);
	} catch (err) {
		console.error(
			"Could not load dist/pdf.mjs — build it first:\n" +
				"  pnpm --filter @komnour/report build\n" +
				`(${err.message})`,
		);
		process.exit(1);
	}
	const {
		renderDocument,
		SkiaAdapter,
		resolveAssetServer,
		ReportDocumentSchema,
		FontLibrary,
	} = api;

	// Register Inter if the editor's font files are around; a missing font
	// only changes which glyphs render, not the memory story.
	const fontsDir = join(here, "../../visual-editor/public/fonts");
	if (existsSync(fontsDir)) {
		const inter = readdirSync(fontsDir)
			.filter((f) => f.startsWith("Inter") && /\.(ttf|otf)$/i.test(f))
			.map((f) => join(fontsDir, f));
		if (inter.length > 0) {
			try {
				FontLibrary.use("Inter", inter);
			} catch {
				console.warn("Font registration failed; continuing with fallbacks.");
			}
		}
	}

	let imageDataUrl = TINY_PNG_DATA_URL;
	if (opts.imageMb > 0 && !opts.docPath) {
		imageDataUrl = await makeNoiseImageDataUrl(opts.imageMb);
		console.log(
			`synthetic image: ~${opts.imageMb} MB noise PNG (${fmt(imageDataUrl.length)} as a data URL)\n`,
		);
	}
	const rawDoc = opts.docPath
		? JSON.parse(await readFile(opts.docPath, "utf8"))
		: buildSyntheticDocument(opts.pages, imageDataUrl);
	const parsed = ReportDocumentSchema.safeParse(rawDoc);
	if (!parsed.success) {
		console.error("Document failed schema validation:");
		for (const issue of parsed.error.issues.slice(0, 10)) {
			console.error(`  ${issue.path.join(".")}: ${issue.message}`);
		}
		process.exit(1);
	}
	const doc = parsed.data;

	const gc = globalThis.gc;
	if (!gc) {
		console.warn(
			"Tip: run with --expose-gc for stable baseline/settled numbers.\n",
		);
	}

	console.log(
		`node ${process.version} · ${doc.pages.length} pages · ${opts.runs} runs · concurrency ${opts.concurrency}\n`,
	);

	const durations = [];
	let lastPdf = null;
	const renderOnce = async () => {
		const t0 = performance.now();
		const adapter = new SkiaAdapter();
		const bytes = await renderDocument(doc, adapter, undefined, {
			resolveAsset: resolveAssetServer,
		});
		durations.push(performance.now() - t0);
		lastPdf = bytes ?? null;
	};

	const sampler = startSampler();
	await settle(gc);
	printUsage("baseline", process.memoryUsage());

	if (opts.snapshot) {
		const { writeHeapSnapshot } = await import("node:v8");
		const file = writeHeapSnapshot();
		console.log(`\nheap snapshot (before): ${file}`);
		console.log(
			"NOTE: canvases and PDF bytes are native memory — they will NOT show" +
				" up in this snapshot. Compare the rss lines for the real footprint.\n",
		);
	}

	// Warmup: first render pays one-time costs (font load, lazy inits)
	// that would otherwise pollute the per-run numbers.
	await renderOnce();
	durations.length = 0;
	await settle(gc);
	printUsage("after warmup", process.memoryUsage());

	sampler.reset();
	const limiter = createLimiter(opts.concurrency);
	const wallStart = performance.now();
	await Promise.all(
		Array.from({ length: opts.runs }, () => limiter(renderOnce)),
	);
	const wallTotal = performance.now() - wallStart;

	printUsage("PEAK during runs", sampler.peak());
	await settle(gc);
	printUsage("settled after gc", process.memoryUsage());
	sampler.stop();

	const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
	console.log(
		`\nper-export wall time: avg ${avg.toFixed(0)} ms (min ${Math.min(
			...durations,
		).toFixed(0)}, max ${Math.max(...durations).toFixed(0)}) · total ${wallTotal.toFixed(0)} ms`,
	);
	if (lastPdf) console.log(`pdf size: ${fmt(lastPdf.byteLength)}`);

	if (opts.snapshot) {
		const { writeHeapSnapshot } = await import("node:v8");
		const file = writeHeapSnapshot();
		console.log(`heap snapshot (after): ${file}`);
	}
	if (opts.out && lastPdf) {
		await writeFile(opts.out, lastPdf);
		console.log(`wrote last pdf to ${opts.out}`);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
