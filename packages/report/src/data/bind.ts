import type { ReportDocument } from "../model/types";

const BINDING_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

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
			const value = lookupPath(data, path.trim());
			if (value === undefined || value === null) return match;
			return typeof value === "object" ? JSON.stringify(value) : String(value);
		});

	for (const [id, node] of Object.entries(doc.nodes)) {
		if (node.type !== "text") continue;
		const text = substitute(node.text);
		// Inline runs carry their own text, so bindings inside a styled span must
		// be resolved there too — keeping node.text in sync as the concatenation.
		const runs = node.runs?.map((run) => {
			const runText = substitute(run.text);
			return runText === run.text ? run : { ...run, text: runText };
		});
		const runsChanged = runs?.some((run, i) => run !== node.runs?.[i]) ?? false;
		if (text !== node.text || runsChanged) {
			nodes[id] = runs ? { ...node, text, runs } : { ...node, text };
			changed = true;
		}
	}
	return changed ? { ...doc, nodes } : doc;
}
