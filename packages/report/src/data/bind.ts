import type { ReportDocument } from "../model/types";

// Phase 4: resolve `{{path}}` expressions in text nodes against `data`.
// No-op passthrough until then so the renderer's `data` param is already wired.
export function resolveBindings(
	doc: ReportDocument,
	_data: Record<string, unknown>,
): ReportDocument {
	return doc;
}
