/**
 * Splits text into wrap-safe tokens: literal "\n" for each hard newline,
 * and word/whitespace segments via Intl.Segmenter's word-boundary
 * detection — not a plain `\S+` whitespace split, which is only safe for
 * scripts that always put spaces between words. Khmer (and Thai, Lao,
 * Japanese, Chinese, ...) routinely don't: a whole clause can be one
 * unbroken run of characters, which a whitespace-only tokenizer treats as
 * a single unbreakable "word" — unable to wrap even when it doesn't fit
 * the available width, overflowing straight past the box's edge.
 * Intl.Segmenter's dictionary-based word segmentation finds correct break
 * points inside those runs regardless of the locale passed to it (Chrome's
 * and Node's ICU both auto-detect Khmer script and apply its dictionary
 * either way — verified empirically, not assumed).
 *
 * Falls back to the old whitespace-only split if Intl.Segmenter isn't
 * available (pre-2021 engines) — script correctness suffers there, but
 * text still renders instead of throwing.
 */
export function tokenizeText(text: string): string[] {
	const tokens: string[] = [];
	const lines = text.split("\n");
	const segmenter =
		typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
			? new Intl.Segmenter(undefined, { granularity: "word" })
			: null;
	lines.forEach((line, i) => {
		if (i > 0) tokens.push("\n");
		if (line === "") return;
		if (segmenter) {
			for (const { segment } of segmenter.segment(line)) tokens.push(segment);
		} else {
			for (const t of line.match(/[^\S\n]+|\S+/g) ?? []) tokens.push(t);
		}
	});
	return tokens;
}
