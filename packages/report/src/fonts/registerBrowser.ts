import type { FontDefinition } from "../model/types";
import { FONT_MANIFEST } from "./manifest";

// `self.fonts` (a FontFaceSet) exists on both Window and a Worker's global
// scope per spec, but lib.dom.d.ts only types it on `document.fonts` — the
// WorkerGlobalScope typings that declare `self.fonts` live in a separate,
// mutually-exclusive `lib` flavor from "DOM" (which this package's
// tsconfig uses, since browserCanvasAdapter.ts also needs DOM's
// CanvasRenderingContext2D). This is intended to run inside the render
// Worker specifically, so the ambient `self` is narrowed locally here rather
// than changing the package's lib config.
declare const self: { fonts: FontFaceSet };

/** Keyed by FontDefinition.id, so a font is fetched/added at most once even across overlapping registerBrowserFonts() calls. */
const fontPromises = new Map<string, Promise<void>>();

/**
 * Registers fonts with the CSS Font Loading API (`FontFace` + `self.fonts`),
 * fetching the exact same files registerServer.ts reads from disk — same
 * manifest, same bytes — so the live Worker preview and the exported
 * PDF/PNG use identical glyphs. `fonts` exists on both `Window` and a
 * Worker's global scope, so this runs unchanged whether it's called from
 * the main thread or (as intended) from inside the render Worker.
 * `assetBaseUrl` should point at wherever the `/fonts/*` files are served
 * from (the visual editor's `public/` dir), matching `publicDir` in
 * registerServer.ts's role.
 *
 * `fonts` defaults to this package's own FONT_MANIFEST but any font list
 * can be passed instead — a per-document/per-theme font selection, say.
 * Each font is tracked (and skipped on repeat calls) individually by its
 * `id`, so calling this again with a different list only fetches what's
 * actually new — unlike a single one-shot flag, which would silently do
 * nothing for every call after the first regardless of what it was asked
 * to register.
 */
export function registerBrowserFonts(
	assetBaseUrl = "",
	fonts: FontDefinition[] = FONT_MANIFEST,
): Promise<void> {
	const pending = fonts.map((font) => {
		const existing = fontPromises.get(font.id);
		if (existing) return existing;
		const promise = (async () => {
			const face = new FontFace(font.family, `url("${assetBaseUrl}${font.source}")`, {
				weight: String(font.weight),
				style: font.style,
			});
			await face.load();
			self.fonts.add(face);
		})();
		fontPromises.set(font.id, promise);
		return promise;
	});
	return Promise.all(pending).then(() => undefined);
}
