import CanvasKitInit, { type CanvasKit } from "canvaskit-wasm";

let canvasKitPromise: Promise<CanvasKit> | null = null;

/**
 * Loads the CanvasKit WASM module exactly once per browser tab. Self-hosted
 * from `public/canvaskit/` rather than a CDN (see plan notes: this session's
 * sandbox network policy blocks both GitHub releases and unpkg, and
 * self-hosting avoids a third-party runtime dependency in production too).
 */
export function loadCanvasKit(): Promise<CanvasKit> {
	if (typeof window === "undefined") {
		return Promise.reject(new Error("loadCanvasKit() is browser-only"));
	}
	if (!canvasKitPromise) {
		canvasKitPromise = CanvasKitInit({
			locateFile: (file: string) => `/canvaskit/${file}`,
		});
	}
	return canvasKitPromise;
}
