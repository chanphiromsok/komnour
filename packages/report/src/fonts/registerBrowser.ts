import type { CanvasKit, FontMgr } from "canvaskit-wasm";
import { FONT_MANIFEST } from "./manifest";

let fontMgrPromise: Promise<FontMgr> | null = null;

/**
 * Fetches every font in FONT_MANIFEST and registers them with CanvasKit's
 * FontMgr. Memoized per CanvasKit instance (there is only ever one per tab)
 * so repeated calls (e.g. re-mounting the designer canvas) reuse the same
 * FontMgr instead of re-fetching font bytes.
 */
export function loadBrowserFontMgr(canvasKit: CanvasKit): Promise<FontMgr> {
	if (!fontMgrPromise) {
		fontMgrPromise = Promise.all(
			FONT_MANIFEST.map((font) =>
				fetch(font.source).then((res) => {
					if (!res.ok)
						throw new Error(
							`Failed to fetch font "${font.source}": ${res.status}`,
						);
					return res.arrayBuffer();
				}),
			),
		).then((buffers) => {
			const fontMgr = canvasKit.FontMgr.FromData(...buffers);
			if (!fontMgr) throw new Error("CanvasKit.FontMgr.FromData returned null");
			return fontMgr;
		});
	}
	return fontMgrPromise;
}
