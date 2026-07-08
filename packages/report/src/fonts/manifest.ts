import type { FontDefinition } from "../model/types";

/**
 * Single source of truth for font registration, imported identically by
 * registerBrowser.ts (fetch) and registerServer.ts (fs.readFile) so both
 * environments load the exact same font bytes.
 *
 * Inter, Roboto and Noto Sans Khmer are variable fonts (a single file covers
 * their full weight range via the `wght` axis) — one manifest entry per
 * family/style is enough; the requested TextStyle.fontWeight is resolved
 * against the variable axis at draw time by the underlying Skia font
 * matching in both CanvasKit and skia-canvas. Battambang ships only static
 * Regular/Bold instances, so it gets one entry per weight.
 */
export const FONT_MANIFEST: FontDefinition[] = [
	{
		id: "inter-400",
		family: "Inter",
		weight: 400,
		style: "normal",
		source: "/fonts/Inter[opsz,wght].ttf",
	},
	{
		id: "inter-400-italic",
		family: "Inter",
		weight: 400,
		style: "italic",
		source: "/fonts/Inter-Italic[opsz,wght].ttf",
	},
	{
		id: "roboto-400",
		family: "Roboto",
		weight: 400,
		style: "normal",
		source: "/fonts/Roboto[wdth,wght].ttf",
	},
	{
		id: "roboto-400-italic",
		family: "Roboto",
		weight: 400,
		style: "italic",
		source: "/fonts/Roboto-Italic[wdth,wght].ttf",
	},
	{
		id: "battambang-400",
		family: "Battambang",
		weight: 400,
		style: "normal",
		source: "/fonts/Battambang-Regular.ttf",
	},
	{
		id: "battambang-700",
		family: "Battambang",
		weight: 700,
		style: "normal",
		source: "/fonts/Battambang-Bold.ttf",
	},
	{
		id: "noto-khmer-400",
		family: "Noto Sans Khmer",
		weight: 400,
		style: "normal",
		source: "/fonts/NotoSansKhmer[wdth,wght].ttf",
	},
	// Ships (and is named internally) as "Khmer OS Moul" — the "Muol Light"
	// filename is this font's common name in the wild, but `family` has to
	// match the name baked into the font file's own name table, since that's
	// what both CanvasKit (browser) and skia-canvas (server) key their font
	// matching on.
	{
		id: "khmer-os-moul-400",
		family: "Khmer OS Moul",
		weight: 400,
		style: "normal",
		source: "/fonts/KhmerOSMuolLight.ttf",
	},
	// Symbol/dingbat font: each Latin character renders as a symbol. Pick glyphs
	// via the properties-panel glyph picker (shown when this family is selected).
	{
		id: "wingdings2-400",
		family: "Wingdings 2",
		weight: 400,
		style: "normal",
		source: "/fonts/Wingdings2.ttf",
	},
];

/** Font families whose characters are symbols/dingbats — the glyph picker is offered for these. */
export const SYMBOL_FONT_FAMILIES: readonly string[] = ["Wingdings 2"];

/**
 * Legacy symbol fonts (Wingdings/Webdings families) expose their glyphs through
 * a Windows "Symbol" cmap in the Private Use Area at U+F020–U+F0FF, in parallel
 * with a raw-ASCII cmap. The glyph picker inserts these PUA code points rather
 * than the ASCII aliases so the stored text is unambiguously a symbol (it
 * survives font changes as tofu instead of decoding to Latin letters), and both
 * skia-canvas and CanvasKit shape it via the symbol cmap. U+F020 is space.
 */
export const SYMBOL_GLYPH_RANGE = { start: 0xf021, end: 0xf0ff } as const;
