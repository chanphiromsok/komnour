import { registerBrowserFonts } from "@komnour/report/src/fonts/registerBrowser";
import { resolveRuns } from "@komnour/report/src/model/runs";
import type { FontDefinition, TextNode } from "@komnour/report/src/model/types";
import { BrowserCanvasAdapter } from "@komnour/report/src/render/browserCanvasAdapter";

// A dedicated offscreen canvas purely for text measurement — never attached
// to the DOM, never drawn from. Reused across calls instead of allocating a
// new one per node edit.
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
	if (measureCtx) return measureCtx;
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	measureCtx = canvas.getContext("2d");
	return measureCtx;
}

let builtinFontsPromise: Promise<void> | null = null;

/**
 * The render Worker registers fonts into ITS OWN FontFaceSet realm
 * (self.fonts), which the main thread's `document.fonts` can't see — so
 * measuring text here, before it's ever handed to the Worker, would
 * silently fall back to a generic system font and undercount how many
 * lines the real content wraps into. This mirrors the Worker's own
 * registration but targets `document.fonts` instead, and returns a promise
 * so a caller that can afford to wait (e.g. healing a just-imported
 * document) gets an accurate measurement instead of racing font loading.
 * Built-ins are fetched once per session; `customFonts` (a document's own
 * imported fonts, see ImportFontDialog) are re-passed on every call since
 * registerBrowserFonts already dedupes by id internally.
 */
function ensureMainThreadFontsRegistered(
	customFonts: FontDefinition[],
): Promise<void> {
	if (typeof document === "undefined") return Promise.resolve();
	if (!builtinFontsPromise) {
		builtinFontsPromise = registerBrowserFonts(
			"",
			undefined,
			document.fonts,
		).catch(() => {
			builtinFontsPromise = null;
		});
	}
	const customPromise =
		customFonts.length > 0
			? registerBrowserFonts("", customFonts, document.fonts).catch(() => {})
			: Promise.resolve();
	return Promise.all([builtinFontsPromise, customPromise]).then(() => undefined);
}

/**
 * Resolves once the given fonts are loaded into the main thread's
 * document.fonts (or as loaded as they're going to get — a failure doesn't
 * reject, since a caller measuring text should still get its best-effort
 * answer rather than being blocked forever by one bad font).
 */
export function waitForFontsReady(
	customFonts: FontDefinition[] = [],
): Promise<void> {
	return ensureMainThreadFontsRegistered(customFonts);
}

/**
 * For a plain (uniform, single-run) text node, the PDF export's SkiaAdapter
 * doesn't use this same layout code at all — it hands the whole string to
 * skia-canvas's own native word-wrap instead (kept deliberately, since it's
 * what gives complex scripts like Khmer correct text shaping; a hand-rolled
 * whitespace tokenizer can't be trusted with that). That's a second,
 * independent layout engine that generally agrees with this one but isn't
 * guaranteed to break at exactly the same words, so this measurement is
 * padded rather than trusted as an exact number: 15% scales with paragraph
 * length (covers a handful of lines coming out longer), and one full extra
 * line-height covers a short block landing just one line over.
 */
const SAFETY_MARGIN_FACTOR = 1.15;

/**
 * The minimum frame.height a text node's box needs to render its current
 * content without visually overflowing into whatever sits below it — the
 * exact bug class behind a text box authored (or resized) shorter than its
 * wrapped content, which the renderer never clips, so the overflow just
 * silently bleeds into the next node down. Padded above the browser's own
 * measurement (see SAFETY_MARGIN_FACTOR) since the PDF export's text engine
 * can land on a slightly different line count for the same content.
 *
 * Synchronous and best-effort: if a font hasn't finished loading yet, the
 * measurement may undercount for that one call. Fine for a live edit (the
 * next keystroke/commit re-measures once the font's promise has resolved);
 * callers that need a guaranteed-accurate one-shot answer (e.g. healing a
 * just-imported document) should `await waitForFontsReady(...)` first.
 */
export function measureMinTextHeight(
	node: TextNode,
	customFonts: FontDefinition[] = [],
): number {
	// Kicks off loading if it hasn't started yet; intentionally not awaited
	// here so this stays usable from synchronous Immer producers.
	void ensureMainThreadFontsRegistered(customFonts);
	const ctx = getMeasureContext();
	if (!ctx) return node.frame.height;
	const adapter = new BrowserCanvasAdapter(ctx);
	const metrics = adapter.measureTextBlock(
		resolveRuns(node),
		node.style,
		node.frame.width,
	);
	if (metrics.height === 0) return 0;
	const oneLineHeight = node.style.fontSize * node.style.lineHeight;
	return metrics.height * SAFETY_MARGIN_FACTOR + oneLineHeight;
}
