import { useRef, useState } from "react";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { ReportDocumentSchema } from "@komnour/report/src/model/schema";
import type { ReportDocument } from "@komnour/report/src/model/types";
import { DialogShell } from "./DialogShell";

function parseDocumentJson(
	raw: string,
): { ok: true; document: ReportDocument } | { ok: false; error: string } {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (err) {
		return {
			ok: false,
			error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	const parsed = ReportDocumentSchema.safeParse(json);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return {
			ok: false,
			error: `Not a valid report document: ${first.path.join(".")} — ${first.message}`,
		};
	}
	if (parsed.data.pages.length === 0) {
		return { ok: false, error: "Document has no pages." };
	}
	for (const pageId of parsed.data.pages) {
		if (!parsed.data.nodes[pageId]) {
			return { ok: false, error: `Page id "${pageId}" is missing in nodes.` };
		}
	}
	return { ok: true, document: parsed.data as ReportDocument };
}

export function ImportJsonDialog({ onClose }: { onClose: () => void }) {
	const loadDocument = useDesignerStore((s) => s.loadDocument);
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function importFrom(raw: string) {
		const result = parseDocumentJson(raw);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		loadDocument(result.document);
		onClose();
	}

	async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		importFrom(await file.text());
		event.target.value = "";
	}

	return (
		<DialogShell title="Import document JSON" onClose={onClose}>
			<p className="text-neutral-500 text-xs">
				Pick a <code>.json</code> file or paste document JSON below. Importing
				replaces the current document.
			</p>
			<div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".json,application/json"
					className="hidden"
					onChange={handleFileChange}
				/>
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="rounded border border-neutral-300 px-3 py-1.5 text-neutral-700 text-sm hover:bg-neutral-50"
				>
					Choose file…
				</button>
			</div>
			<textarea
				value={text}
				onChange={(event) => {
					setText(event.target.value);
					setError(null);
				}}
				placeholder='{"version":1,"pages":[…],"nodes":{…},"assets":{},"fonts":{}}'
				spellCheck={false}
				className="h-48 w-full resize-none rounded border border-neutral-300 p-2 font-mono text-xs focus:border-blue-400 focus:outline-none"
			/>
			{error && <p className="text-red-600 text-xs">{error}</p>}
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded px-3 py-1.5 text-neutral-600 text-sm hover:bg-neutral-100"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={text.trim().length === 0}
					onClick={() => importFrom(text)}
					className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Import
				</button>
			</div>
		</DialogShell>
	);
}
