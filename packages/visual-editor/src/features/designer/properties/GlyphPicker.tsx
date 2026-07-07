import { SYMBOL_GLYPH_RANGE } from "@komnour/report/src/fonts/manifest";

/**
 * A grid of the symbols in a symbol font (e.g. Wingdings 2). Each cell is a
 * Private Use Area code point (see SYMBOL_GLYPH_RANGE); clicking inserts that
 * code point into the text node — not the legacy ASCII alias — so the stored
 * content is the symbol itself. The canvas and PDF/PNG export shape it through
 * the font's symbol cmap, matching the preview here.
 */
const GLYPH_CODEPOINTS = Array.from(
	{ length: SYMBOL_GLYPH_RANGE.end - SYMBOL_GLYPH_RANGE.start + 1 },
	(_, i) => SYMBOL_GLYPH_RANGE.start + i,
);

export function GlyphPicker({
	fontFamily,
	onInsert,
}: {
	fontFamily: string;
	onInsert: (char: string) => void;
}) {
	return (
		<div className="flex flex-col gap-1 text-neutral-500 text-xs dark:text-neutral-400">
			Glyphs
			<div className="grid max-h-48 grid-cols-6 gap-1 overflow-auto rounded border border-neutral-200 p-1 dark:border-neutral-700">
				{GLYPH_CODEPOINTS.map((code) => {
					const char = String.fromCodePoint(code);
					const hex = code.toString(16).toUpperCase().padStart(4, "0");
					return (
						<button
							key={code}
							type="button"
							title={`Insert U+${hex}`}
							onClick={() => onInsert(char)}
							// Quote the family: an unquoted CSS family token can't start
							// with a digit (e.g. "Wingdings 2"), so it must be quoted.
							style={{ fontFamily: `"${fontFamily}"` }}
							className="flex h-8 items-center justify-center rounded text-lg text-neutral-800 hover:bg-blue-50 dark:text-neutral-100 dark:hover:bg-blue-500/20"
						>
							{char}
						</button>
					);
				})}
			</div>
		</div>
	);
}
