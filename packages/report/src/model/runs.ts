import type { InlineTextStyle, TextNode, TextRun } from "./types";

/** The inline-overridable style keys, in a stable order (used for equality). */
const INLINE_KEYS: (keyof InlineTextStyle)[] = [
	"fontFamily",
	"fontSize",
	"fontWeight",
	"fontStyle",
	"color",
	"letterSpacing",
	"decoration",
];

/**
 * The runs to render for a text node: its own `runs` when present and
 * non-empty, otherwise a single run covering the whole `text` in the base
 * style. Every consumer (renderer, editor) goes through this so the
 * "no runs = one plain run" convention lives in exactly one place.
 */
export function resolveRuns(node: TextNode): TextRun[] {
	if (node.runs && node.runs.length > 0) return node.runs;
	return [{ text: node.text }];
}

/** Concatenated plain text of a run list — the value kept in `TextNode.text`. */
export function runsToText(runs: TextRun[]): string {
	let out = "";
	for (const run of runs) out += run.text;
	return out;
}

/** Do two (possibly undefined) inline-style overrides describe the same styling? */
function stylesEqual(
	a: Partial<InlineTextStyle> | undefined,
	b: Partial<InlineTextStyle> | undefined,
): boolean {
	for (const key of INLINE_KEYS) {
		if (a?.[key] !== b?.[key]) return false;
	}
	return true;
}

/** Drop empty overrides so a run with `style: {}` compares equal to no style. */
function cleanStyle(
	style: Partial<InlineTextStyle> | undefined,
): Partial<InlineTextStyle> | undefined {
	if (!style) return undefined;
	const entries = Object.entries(style).filter(([, v]) => v !== undefined);
	return entries.length > 0
		? (Object.fromEntries(entries) as Partial<InlineTextStyle>)
		: undefined;
}

/**
 * Canonical form of a run list: empty runs removed and adjacent runs with
 * identical styling merged. Keeps the model small after edits (splitting a
 * run then styling it, deleting text, etc.) and makes equality checks cheap.
 * Never returns an empty array for non-empty text — an all-empty input
 * collapses to a single empty run so callers always have something to render.
 */
export function normalizeRuns(runs: TextRun[]): TextRun[] {
	const out: TextRun[] = [];
	for (const run of runs) {
		if (run.text.length === 0) continue;
		const style = cleanStyle(run.style);
		const last = out[out.length - 1];
		if (last && stylesEqual(last.style, style)) {
			last.text += run.text;
		} else {
			out.push(style ? { text: run.text, style } : { text: run.text });
		}
	}
	return out.length > 0 ? out : [{ text: "" }];
}

/**
 * Applies an inline-style patch to the character range [start, end) of a run
 * list, splitting runs at the boundaries and merging the patch into every run
 * that falls inside. A patch value of `undefined` for a key clears that
 * override (reverting the span to the base style for that property). Returns a
 * normalized list. Out-of-order or out-of-bounds ranges are clamped; an empty
 * range is a no-op.
 */
export function applyInlineStyleToRuns(
	runs: TextRun[],
	start: number,
	end: number,
	patch: Partial<InlineTextStyle>,
): TextRun[] {
	const total = runsToText(runs).length;
	const from = Math.max(0, Math.min(start, end));
	const to = Math.min(total, Math.max(start, end));
	if (from >= to) return normalizeRuns(runs);

	const out: TextRun[] = [];
	let cursor = 0;
	for (const run of runs) {
		const runStart = cursor;
		const runEnd = cursor + run.text.length;
		cursor = runEnd;
		if (run.text.length === 0) continue;

		// The part of [from, to) that overlaps this run, in run-local offsets.
		const overlapStart = Math.max(from, runStart);
		const overlapEnd = Math.min(to, runEnd);
		if (overlapStart >= overlapEnd) {
			out.push(run);
			continue;
		}
		const localStart = overlapStart - runStart;
		const localEnd = overlapEnd - runStart;

		if (localStart > 0) {
			out.push({ text: run.text.slice(0, localStart), style: run.style });
		}
		out.push({
			text: run.text.slice(localStart, localEnd),
			style: mergeStyle(run.style, patch),
		});
		if (localEnd < run.text.length) {
			out.push({ text: run.text.slice(localEnd), style: run.style });
		}
	}
	return normalizeRuns(out);
}

/** Merge a patch onto an existing override; keys set to undefined are removed. */
function mergeStyle(
	base: Partial<InlineTextStyle> | undefined,
	patch: Partial<InlineTextStyle>,
): Partial<InlineTextStyle> {
	const merged: Partial<InlineTextStyle> = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete merged[key as keyof InlineTextStyle];
		else (merged as Record<string, unknown>)[key] = value;
	}
	return merged;
}

/**
 * The inline overrides shared by every run touching [start, end) — the value
 * for a key is returned only when all covered runs agree on it, otherwise the
 * key is omitted (a "mixed" selection). Drives the active state of the editor's
 * inline toolbar. An empty range reports the run at `start`.
 */
export function inlineStyleAt(
	runs: TextRun[],
	start: number,
	end: number,
): Partial<InlineTextStyle> {
	const total = runsToText(runs).length;
	const from = Math.max(0, Math.min(start, end));
	const to = Math.min(total, Math.max(start, end));

	const covered: (Partial<InlineTextStyle> | undefined)[] = [];
	let cursor = 0;
	for (const run of runs) {
		const runStart = cursor;
		const runEnd = cursor + run.text.length;
		cursor = runEnd;
		if (run.text.length === 0) continue;
		const touches = from === to ? runStart <= from && from < runEnd : runStart < to && runEnd > from;
		if (touches) covered.push(run.style);
	}
	if (covered.length === 0) return {};

	const result: Partial<InlineTextStyle> = {};
	for (const key of INLINE_KEYS) {
		const first = covered[0]?.[key];
		if (first !== undefined && covered.every((s) => s?.[key] === first)) {
			(result as Record<string, unknown>)[key] = first;
		}
	}
	return result;
}
