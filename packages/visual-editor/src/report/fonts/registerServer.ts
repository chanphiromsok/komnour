import path from "node:path";
import { FontLibrary } from "skia-canvas";
import { FONT_MANIFEST } from "./manifest";

let registered = false;

/**
 * Registers every font in FONT_MANIFEST with skia-canvas's FontLibrary,
 * reading from the same `public/fonts/*` files the browser fetches — the
 * mechanism that guarantees byte-identical fonts on both sides. Guarded by
 * a module-level flag so repeated calls within the same warm server
 * process (e.g. multiple requests to a Lambda container) don't re-register.
 */
export function registerServerFonts(): void {
	if (registered) return;
	const pathsByFamily = new Map<string, string[]>();
	for (const font of FONT_MANIFEST) {
		const absolutePath = path.join(process.cwd(), "public", font.source);
		const paths = pathsByFamily.get(font.family) ?? [];
		paths.push(absolutePath);
		pathsByFamily.set(font.family, paths);
	}
	// Register every weight/style variant for a family together (in one call)
	// so skia-canvas can select the right file for a requested weight/style.
	for (const [family, paths] of pathsByFamily) {
		FontLibrary.use(family, paths);
	}
	registered = true;
}
