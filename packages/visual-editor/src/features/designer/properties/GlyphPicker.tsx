/**
 * A grid of characters rendered in a symbol font (e.g. Wingdings 2), where each
 * Latin character maps to a symbol. Clicking a cell inserts that character into
 * the text node; the canvas then renders it as the corresponding symbol because
 * the node uses the same font family. Covers the printable ASCII range, which
 * is where dingbat fonts place their glyphs.
 */
const GLYPH_CODES = Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => 0x21 + i);

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
				{GLYPH_CODES.map((code) => {
					const char = String.fromCharCode(code);
					return (
						<button
							key={code}
							type="button"
							title={`Insert '${char}' (U+${code.toString(16).toUpperCase().padStart(4, "0")})`}
							onClick={() => onInsert(char)}
							style={{ fontFamily }}
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
