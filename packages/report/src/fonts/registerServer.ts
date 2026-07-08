import path from "node:path";
import { FontLibrary } from "skia-canvas";
import { FONT_MANIFEST } from "./manifest";

let registered = false;

/**
 * Registers every font in FONT_MANIFEST with skia-canvas's FontLibrary,
 * reading from the same physical font files the browser fetches (via
 * `publicDir`) — the mechanism that guarantees byte-identical fonts on both
 * sides. `publicDir` defaults to `process.cwd()/public` (matches this
 * package running standalone) but callers whose cwd differs from where the
 * font files live (e.g. a Fastify server in a sibling package) should pass
 * an explicit absolute path to that `public` directory. Guarded by a
 * module-level flag so repeated calls within the same warm server process
 * (e.g. multiple requests to a Lambda container) don't re-register.
 */
export function registerServerFonts(
	publicDir: string = path.join(process.cwd(), "public"),
): void {
	if (registered) return;
	const pathsByFamily = new Map<string, string[]>();
	for (const font of FONT_MANIFEST) {
		const absolutePath = path.join(publicDir, font.source);
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
