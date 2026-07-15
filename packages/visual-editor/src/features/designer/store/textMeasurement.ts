import { registerBrowserFonts } from "@komnour/report/src/fonts/registerBrowser";
import type { FontDefinition, TextNode, TextRun } from "@komnour/report/src/model/types";
import { BrowserCanvasAdapter } from "@komnour/report/src/render/browserCanvasAdapter";

/**
 * Just the slice of a TextNode this module actually reads — lets a caller
 * that doesn't have (or doesn't want to fabricate) a full TextNode, like
 * TextEditOverlay measuring in-progress edits before there's a committed
 * node to point at, pass a minimal object instead.
 */
export interface MeasurableText extends Pick<TextNode, "text" | "runs" | "style"> {
	frame: { width: number };
}

/** Local copy of runs.ts's resolveRuns, over the narrower MeasurableText shape. */
function resolveMeasurableRuns(node: MeasurableText): TextRun[] {
	if (node.runs && node.runs.length > 0) return node.runs;
	return [{ text: node.text }];
}

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
 * guaranteed to break at exactly the same words, so when a box has to GROW,
 * the target is padded rather than trusted as an exact number: 15% scales
 * with paragraph length (covers a handful of lines coming out longer), and
 * one full extra line-height covers a short block landing just one line
 * over. The padding is applied only when growing — it is never a reason to
 * override a user-chosen height that already fits the content.
 */
const SAFETY_MARGIN_FACTOR = 1.15;

/**
 * Float tolerance when comparing a measured content height against a stored
 * frame height, so a height that was previously baked from this very
 * measurement (e.g. 27.089999999999996) never reads as "overflowing" by a
 * rounding hair and triggers a pointless grow.
 */
const FIT_EPSILON = 0.5;

/** The browser's own measured height for the node's content — unpadded. */
function measureTextContentHeight(
	node: MeasurableText,
	customFonts: FontDefinition[],
): number {
	// Kicks off loading if it hasn't started yet; intentionally not awaited
	// here so this stays usable from synchronous Immer producers.
	void ensureMainThreadFontsRegistered(customFonts);
	const ctx = getMeasureContext();
	if (!ctx) return 0;
	const adapter = new BrowserCanvasAdapter(ctx);
	const metrics = adapter.measureTextBlock(
		resolveMeasurableRuns(node),
		node.style,
		node.frame.width,
	);
	return metrics.height;
}

/**
 * The frame.height a text node's box should end up at, given the height it
 * currently has: `currentHeight` unchanged whenever the content fits inside
 * it, or the padded grow target (see SAFETY_MARGIN_FACTOR) when the content
 * genuinely overflows. Neither renderer clips overflowing text — a too-short
 * box silently bleeds into whatever sits below it — which is why overflow
 * forces a grow; but a height the user chose that DOES fit its content is
 * always respected, so editing text inside a comfortably-sized box never
 * inflates it.
 *
 * Synchronous and best-effort: if a font hasn't finished loading yet, the
 * measurement may undercount for that one call. Fine for a live edit (the
 * next keystroke/commit re-measures once the font's promise has resolved);
 * callers that need a guaranteed-accurate one-shot answer (e.g. healing a
 * just-imported document) should `await waitForFontsReady(...)` first.
 */
export function requiredTextHeight(
	node: MeasurableText,
	currentHeight: number,
	customFonts: FontDefinition[] = [],
): number {
	const contentHeight = measureTextContentHeight(node, customFonts);
	if (contentHeight === 0 || contentHeight <= currentHeight + FIT_EPSILON) {
		return currentHeight;
	}
	const oneLineHeight = node.style.fontSize * node.style.lineHeight;
	return contentHeight * SAFETY_MARGIN_FACTOR + oneLineHeight;
}
