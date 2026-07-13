import type { FontDefinition } from "../model/types";
import { FONT_MANIFEST } from "./manifest";

// A Worker's global scope exposes `self.fonts` per spec, but `Window` does
// NOT — only `Document` does (`document.fonts`). The two are separate
// FontFaceSet realms with nothing in common, so a font registered from a
// Worker is invisible to `document.fonts` on the main thread and vice
// versa. `targetFontFaceSet` below defaults to `self.fonts` for the render
// Worker's existing usage, but a main-thread caller (e.g. the editor
// measuring text outside the Worker, before committing a frame height) must
// pass `document.fonts` explicitly to register into the realm it can
// actually see.
declare const self: { fonts: FontFaceSet };

/** Keyed by FontDefinition.id, so a font is fetched/added at most once even across overlapping registerBrowserFonts() calls. */
const fontPromises = new Map<string, Promise<void>>();

/**
 * Registers fonts with the CSS Font Loading API (`FontFace` + a
 * `FontFaceSet`), fetching the exact same files registerServer.ts reads
 * from disk — same manifest, same bytes — so the live Worker preview and
 * the exported PDF/PNG use identical glyphs. `assetBaseUrl` should point at
 * wherever the `/fonts/*` files are served from (the visual editor's
 * `public/` dir), matching `publicDir` in registerServer.ts's role.
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
	targetFontFaceSet: FontFaceSet = self.fonts,
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
			targetFontFaceSet.add(face);
		})();
		fontPromises.set(font.id, promise);
		return promise;
	});
	return Promise.all(pending).then(() => undefined);
}
