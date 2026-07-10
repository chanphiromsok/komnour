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

let registered: Promise<void> | null = null;

/**
 * Registers every font in FONT_MANIFEST with the CSS Font Loading API
 * (`FontFace` + `self.fonts`), fetching the exact same files
 * registerServer.ts reads from disk — same manifest, same bytes — so the
 * live Worker preview and the exported PDF/PNG use identical glyphs. `fonts`
 * exists on both `Window` and a Worker's global scope, so this runs
 * unchanged whether it's called from the main thread or (as intended) from
 * inside the render Worker. `assetBaseUrl` should point at wherever the
 * `/fonts/*` files are served from (the visual editor's `public/` dir),
 * matching `publicDir` in registerServer.ts's role.
 *
 * Memoized (not per-call) since `FontFace.load()` is itself idempotent-ish
 * but re-fetching and re-adding every font on every render would be wasted
 * work for a Worker that renders many times over its lifetime.
 */
export function registerBrowserFonts(assetBaseUrl = ""): Promise<void> {
	if (registered) return registered;
	registered = Promise.all(
		FONT_MANIFEST.map(async (font) => {
			const face = new FontFace(font.family, `url("${assetBaseUrl}${font.source}")`, {
				weight: String(font.weight),
				style: font.style,
			});
			await face.load();
			self.fonts.add(face);
		}),
	).then(() => undefined);
	return registered;
}
