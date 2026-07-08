export interface BindingSuggestion {
	/** Dot path, e.g. "customer.address.city". */
	path: string;
	/** Short human-readable preview of the value at this path. */
	preview: string;
	/** True for object/array nodes (intermediate paths), false for scalar leaves. */
	isBranch: boolean;
}

function previewValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === "object") return "{…}";
	if (typeof value === "string")
		return value.length > 24 ? `"${value.slice(0, 24)}…"` : `"${value}"`;
	return String(value);
}

/**
 * Flattens a binding-data object into dot-paths (depth-first, parents before
 * children). Object and array nodes are included as branch paths so the user
 * can drill in; scalar leaves are the terminal values. Array elements use
 * their numeric index as a segment ("items.0.name").
 */
export function flattenBindingPaths(
	data: Record<string, unknown> | null,
): BindingSuggestion[] {
	if (!data) return [];
	const out: BindingSuggestion[] = [];
	const visit = (value: unknown, prefix: string) => {
		const entries: [string, unknown][] = Array.isArray(value)
			? value.map((v, i) => [String(i), v])
			: Object.entries(value as Record<string, unknown>);
		for (const [key, child] of entries) {
			const path = prefix ? `${prefix}.${key}` : key;
			const isBranch = child !== null && typeof child === "object";
			out.push({ path, preview: previewValue(child), isBranch });
			if (isBranch) visit(child, path);
		}
	};
	visit(data, "");
	return out;
}

export interface BindingContext {
	/** Index of the `{{` opener in the text. */
	openIndex: number;
	/** Optional binding namespace typed before the path, e.g. "checkbox:". */
	prefix: string;
	/** Text typed between the opener and the caret (already trimmed of a leading space). */
	query: string;
}

/**
 * If the caret sits inside an unclosed `{{ … }}` at `caret`, returns the
 * opener position and the partial path typed so far. Returns null when the
 * caret is not in a binding (no opener, or a `}}` closes it before the caret).
 */
export function bindingContextAt(
	text: string,
	caret: number,
): BindingContext | null {
	const before = text.slice(0, caret);
	const openIndex = before.lastIndexOf("{{");
	if (openIndex === -1) return null;
	const inner = before.slice(openIndex + 2);
	// A closed binding (contains "}}") means the caret is past it, not inside.
	if (inner.includes("}}")) return null;
	// Only offer completion for path-like partials — with the optional
	// `checkbox:` namespace used by inline checkbox tokens — so normal `{{`
	// text isn't hijacked.
	const match = inner.match(/^\s*(?:(checkbox:)?([\w.]*)?)$/);
	if (!match) return null;
	return { openIndex, prefix: match[1] ?? "", query: match[2] ?? "" };
}

export function filterSuggestions(
	suggestions: BindingSuggestion[],
	query: string,
): BindingSuggestion[] {
	if (!query) return suggestions;
	const lower = query.toLowerCase();
	return suggestions.filter((s) => s.path.toLowerCase().includes(lower));
}
