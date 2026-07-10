import path from "node:path";
import { FontLibrary } from "skia-canvas";
import type { FontDefinition } from "../model/types";
import { FONT_MANIFEST } from "./manifest";

const registeredFamilies = new Set<string>();

/**
 * Registers fonts with skia-canvas's FontLibrary so they're available for
 * rendering, reading from the same physical font files the browser fetches
 * (via `publicDir`) — the mechanism that guarantees byte-identical fonts on
 * both sides. `publicDir` defaults to `process.cwd()/public` (matches this
 * package running standalone) but callers whose cwd differs from where the
 * font files live (e.g. a Fastify server in a sibling package) should pass
 * an explicit absolute path to that `public` directory.
 *
 * `fonts` defaults to this package's own FONT_MANIFEST (the fonts the
 * visual editor ships) but any font list can be passed instead — a
 * consumer of the published `@komnour/report/pdf` entry point isn't
 * limited to those; pass your own per-document/per-theme font selection
 * here, with `source` paths resolved against `publicDir` (or, for fonts
 * living somewhere else entirely, pass `publicDir: ""` and make `source`
 * itself absolute).
 *
 * Registration is tracked per font FAMILY, not as a single one-time flag —
 * calling this again with a different font list (a different theme, say)
 * still registers whatever's new; families already registered are skipped
 * so repeat calls with the same fonts (e.g. once per warm request in a
 * long-lived server process) stay cheap instead of re-registering.
 */
export function registerServerFonts(
	publicDir: string = path.join(process.cwd(), "public"),
	fonts: FontDefinition[] = FONT_MANIFEST,
): void {
	const pathsByFamily = new Map<string, string[]>();
	for (const font of fonts) {
		if (registeredFamilies.has(font.family)) continue;
		const absolutePath = path.join(publicDir, font.source);
		const paths = pathsByFamily.get(font.family) ?? [];
		paths.push(absolutePath);
		pathsByFamily.set(font.family, paths);
	}
	// Register every weight/style variant for a family together (in one call)
	// so skia-canvas can select the right file for a requested weight/style.
	for (const [family, paths] of pathsByFamily) {
		FontLibrary.use(family, paths);
		registeredFamilies.add(family);
	}
}
