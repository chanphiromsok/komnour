import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

const DATA_URL_EXTENSION_BY_MIME: Record<string, string> = {
	"font/ttf": ".ttf",
	"application/x-font-ttf": ".ttf",
	"application/font-sfnt": ".ttf",
	"font/otf": ".otf",
	"application/x-font-otf": ".otf",
	"font/woff": ".woff",
	"application/font-woff": ".woff",
	"font/woff2": ".woff2",
	"application/font-woff2": ".woff2",
};

const registeredCustomFontIds = new Set<string>();

/**
 * Registers fonts a user imported into the visual editor (see
 * ImportFontDialog) — unlike registerServerFonts' fixed FONT_MANIFEST, these
 * are embedded as `data:` URLs directly on the posted document (the same
 * "self-contained JSON" approach already used for dropped images), so they
 * arrive per-request rather than living on disk. skia-canvas's FontLibrary
 * only accepts file paths, not raw bytes, so each one is decoded to a temp
 * file first. Tracked per font id (not family — two different custom fonts
 * could coincidentally share a family name) so re-exporting the same
 * document within one server process doesn't rewrite the temp file every
 * time. A font that fails to decode or register is skipped rather than
 * failing the whole export — falling back to whatever default font
 * substitution the renderer already does for an unknown family.
 */
export function registerCustomServerFonts(
	fonts: Record<string, FontDefinition> | FontDefinition[],
): void {
	const list = Array.isArray(fonts) ? fonts : Object.values(fonts);
	const pathsByFamily = new Map<string, string[]>();
	for (const font of list) {
		if (registeredCustomFontIds.has(font.id)) continue;
		const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(font.source);
		if (!match) continue;
		const [, mime, isBase64, payload] = match;
		let bytes: Buffer;
		try {
			bytes = isBase64
				? Buffer.from(payload, "base64")
				: Buffer.from(decodeURIComponent(payload), "utf8");
		} catch {
			continue;
		}
		const ext = DATA_URL_EXTENSION_BY_MIME[mime] ?? ".ttf";
		const tempPath = path.join(
			os.tmpdir(),
			`komnour-custom-font-${font.id}-${randomBytes(4).toString("hex")}${ext}`,
		);
		try {
			fs.writeFileSync(tempPath, bytes);
		} catch {
			continue;
		}
		const paths = pathsByFamily.get(font.family) ?? [];
		paths.push(tempPath);
		pathsByFamily.set(font.family, paths);
		registeredCustomFontIds.add(font.id);
	}
	for (const [family, paths] of pathsByFamily) {
		try {
			FontLibrary.use(family, paths);
		} catch {
			// Unsupported font format (e.g. WOFF2 on a skia-canvas build without
			// brotli support) — the export still proceeds with a substituted font.
		}
	}
}
