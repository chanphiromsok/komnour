import { runsToText } from "../model/runs";
import type { ReportDocument, TextRun } from "../model/types";

const BINDING_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const INLINE_CHECKBOX_PREFIX = "checkbox:";
const CHECKED_BOX_RUN: TextRun = {
	text: "R",
	style: { fontFamily: "Wingdings 2" },
};
const UNCHECKED_BOX_RUN: TextRun = {
	text: "□",
	style: { fontFamily: "Inter" },
};

/** Parses a literal `true`/`false` token (case-insensitive); anything else is not a literal. */
function parseLiteralBoolean(token: string): boolean | null {
	const lower = token.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	return null;
}

/** Walks `data` along a dot path like "customer.address.city". Array indices work as plain segments ("items.0.name"). */
function lookupPath(data: Record<string, unknown>, path: string): unknown {
	let current: unknown = data;
	for (const segment of path.split(".")) {
		if (current === null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Resolves `{{path}}` expressions in text nodes against `data`. Unresolved
 * paths (undefined/null) are left as-is so missing bindings stay visible
 * in the output instead of silently disappearing. Returns the same document
 * instance when nothing matched.
 */
export function resolveBindings(
	doc: ReportDocument,
	data: Record<string, unknown>,
): ReportDocument {
	let changed = false;
	const nodes: ReportDocument["nodes"] = { ...doc.nodes };
	const substitute = (input: string) =>
		input.replace(BINDING_PATTERN, (match, path: string) => {
			const expression = path.trim();
			if (isInlineCheckboxExpression(expression)) return match;
			const value = lookupPath(data, expression);
			if (value === undefined || value === null) return match;
			return typeof value === "object" ? JSON.stringify(value) : String(value);
		});
	const substituteRun = (run: TextRun): TextRun[] => {
		const out: TextRun[] = [];
		let cursor = 0;
		run.text.replace(BINDING_PATTERN, (match, path: string, offset: number) => {
			if (offset > cursor) {
				out.push({ text: run.text.slice(cursor, offset), style: run.style });
			}
			const expression = path.trim();
			if (isInlineCheckboxExpression(expression)) {
				const checkboxPath = expression.slice(INLINE_CHECKBOX_PREFIX.length).trim();
				// `{{checkbox: true}}`/`{{checkbox: false}}` is a hardcoded mark,
				// not a data binding — resolves the same with or without `data`.
				// Anything else is a dot path, looked up and coerced as before.
				const literal = parseLiteralBoolean(checkboxPath);
				const isChecked =
					literal !== null ? literal : Boolean(lookupPath(data, checkboxPath));
				const checkboxRun = isChecked ? CHECKED_BOX_RUN : UNCHECKED_BOX_RUN;
				out.push({
					text: checkboxRun.text,
					style: { ...run.style, ...checkboxRun.style },
				});
			} else {
				const value = lookupPath(data, expression);
				out.push({
					text:
						value === undefined || value === null
							? match
							: typeof value === "object"
								? JSON.stringify(value)
								: String(value),
					style: run.style,
				});
			}
			cursor = offset + match.length;
			return match;
		});
		if (cursor < run.text.length) {
			out.push({ text: run.text.slice(cursor), style: run.style });
		}
		return out.length > 0 ? out : [run];
	};

	for (const [id, node] of Object.entries(doc.nodes)) {
		if (node.type === "text") {
			// Inline runs carry their own text, so bindings inside a styled span must
			// be resolved there too — keeping node.text in sync as the concatenation.
			const sourceRuns = node.runs ?? [{ text: node.text }];
			const runs = sourceRuns.flatMap(substituteRun);
			const text = runsToText(runs);
			const runsChanged =
				runs.length !== sourceRuns.length ||
				runs.some(
					(run, i) =>
						run.text !== sourceRuns[i]?.text ||
						JSON.stringify(run.style ?? {}) !==
							JSON.stringify(sourceRuns[i]?.style ?? {}),
				);
			if (text !== node.text || runsChanged) {
				nodes[id] = { ...node, text, runs };
				changed = true;
			}
		} else if (node.type === "checkbox") {
			let next = node;
			// A plain dot path (not `{{}}`-wrapped) since this drives a boolean,
			// not text substitution — see CheckboxNode's doc comment.
			if (node.checkedBinding) {
				const boundValue = lookupPath(data, node.checkedBinding);
				// Falls back to the design-time `checked` default when the path
				// doesn't resolve (undefined) rather than coercing that to
				// `false` — matches CheckboxNode.checkedBinding's own doc
				// comment, and matters now that this runs even without `data`.
				const resolvedChecked =
					boundValue === undefined ? node.checked : Boolean(boundValue);
				if (resolvedChecked !== node.checked) {
					next = { ...next, checked: resolvedChecked };
				}
			}
			if (node.label) {
				const label = substitute(node.label);
				if (label !== node.label) next = { ...next, label };
			}
			if (next !== node) {
				nodes[id] = next;
				changed = true;
			}
		}
	}
	return changed ? { ...doc, nodes } : doc;
}

function isInlineCheckboxExpression(expression: string): boolean {
	return expression.toLowerCase().startsWith(INLINE_CHECKBOX_PREFIX);
}
