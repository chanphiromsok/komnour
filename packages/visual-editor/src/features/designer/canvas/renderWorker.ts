import { registerBrowserFonts } from "@komnour/report/src/fonts/registerBrowser";
import { extractPageDocument } from "@komnour/report/src/model/tree";
import { BrowserCanvasAdapter } from "@komnour/report/src/render/browserCanvasAdapter";
import { renderDocument } from "@komnour/report/src/render/renderer";
import { resolveAssetBrowser } from "@komnour/report/src/render/resolveAssetBrowser";
import type { NodeId, ReportDocument } from "@komnour/report/src/model/types";

/**
 * Dedicated render Worker for one PageCanvas: owns the page's OffscreenCanvas
 * (transferred once from the main thread, which can never get a 2D context
 * from that element again) and renders every preview frame here instead of
 * round-tripping to the server — this is what lets the live editor preview
 * work with no backend running at all. Final PDF/PNG export is unaffected;
 * that still goes through the server (skia-canvas is Node-only).
 */

type InitMessage = { type: "init"; canvas: OffscreenCanvas; fontBaseUrl: string };
type RenderMessage = {
	type: "render";
	requestId: number;
	document: ReportDocument;
	pageId: NodeId;
	bindingData: Record<string, unknown> | null;
	width: number;
	height: number;
	scale: number;
};
type InMessage = InitMessage | RenderMessage;

type OutMessage =
	| { type: "rendered"; requestId: number }
	| { type: "error"; requestId: number; message: string };

// This file only ever runs as a dedicated Worker's entry module, never on
// the main thread, but the visual-editor package's tsconfig uses the "DOM"
// lib (for the rest of the app) rather than "WebWorker" — those two ambient
// globals aren't mutually compatible in one TS program, so `self`/
// `postMessage` are narrowed locally here to just the shape actually used,
// same approach as registerBrowser.ts's `self.fonts`.
declare const self: { onmessage: ((event: MessageEvent<InMessage>) => void) | null };
declare function postMessage(message: OutMessage): void;

let canvas: OffscreenCanvas | null = null;
let fontsReady: Promise<void> | null = null;
/** Only the most recently requested render should ever draw — an in-flight
 * older request (e.g. still awaiting an image fetch) aborts as soon as a
 * newer one arrives, so two overlapping renders never paint over each other
 * out of order on the shared canvas. */
let latestRequestId = 0;

self.onmessage = async (event: MessageEvent<InMessage>) => {
	const msg = event.data;
	if (msg.type === "init") {
		canvas = msg.canvas;
		fontsReady = registerBrowserFonts(msg.fontBaseUrl);
		return;
	}
	if (msg.type === "render") {
		latestRequestId = msg.requestId;
		await handleRender(msg);
	}
};

async function handleRender(msg: RenderMessage): Promise<void> {
	const { requestId } = msg;
	try {
		await fontsReady;
		if (requestId !== latestRequestId || !canvas) return;

		canvas.width = msg.width * msg.scale;
		canvas.height = msg.height * msg.scale;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get OffscreenCanvas 2D context");

		const adapter = new BrowserCanvasAdapter(ctx, msg.scale);
		const pageDocument = extractPageDocument(msg.document, msg.pageId);

		await renderDocument(pageDocument, adapter, msg.bindingData ?? undefined, {
			resolveAsset: resolveAssetBrowser,
			shouldAbort: () => requestId !== latestRequestId,
		});

		if (requestId !== latestRequestId) return;
		postMessage({ type: "rendered", requestId } satisfies OutMessage);
	} catch (err) {
		if (requestId !== latestRequestId) return;
		postMessage({
			type: "error",
			requestId,
			message: err instanceof Error ? err.message : String(err),
		} satisfies OutMessage);
	}
}
