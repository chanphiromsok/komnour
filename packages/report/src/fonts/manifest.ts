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
