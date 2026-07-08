import { useState } from "react";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { DialogShell } from "./DialogShell";

export function DataBindingDialog({ onClose }: { onClose: () => void }) {
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const setBindingData = useDesignerStore((s) => s.setBindingData);
	const [text, setText] = useState(() =>
		bindingData ? JSON.stringify(bindingData, null, 2) : "",
	);
	const [error, setError] = useState<string | null>(null);

	function handleApply() {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch (err) {
			setError(
				`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
			);
			return;
		}
		if (json === null || typeof json !== "object" || Array.isArray(json)) {
			setError("Binding data must be a JSON object.");
			return;
		}
		setBindingData(json as Record<string, unknown>);
		onClose();
	}

	return (
		<DialogShell title="Data binding" onClose={onClose}>
			<p className="text-neutral-500 text-xs">
				Text nodes can contain <code>{"{{path.to.value}}"}</code> placeholders.
				Paste a JSON object here and the canvas preview, verify render, and PDF
				export will replace them with the matching values. Unmatched
				placeholders are left visible.
			</p>
			<textarea
				value={text}
				onChange={(event) => {
					setText(event.target.value);
					setError(null);
				}}
				placeholder='{"customer":{"name":"Sok Dara"},"invoice":{"no":"INV-001"}}'
				spellCheck={false}
				className="h-48 w-full resize-none rounded border border-neutral-300 p-2 font-mono text-xs focus:border-blue-400 focus:outline-none"
			/>
			{error && <p className="text-red-600 text-xs">{error}</p>}
			<div className="flex items-center justify-between">
				<button
					type="button"
					disabled={bindingData === null}
					onClick={() => {
						setBindingData(null);
						onClose();
					}}
					className="rounded px-3 py-1.5 text-red-600 text-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Clear data
				</button>
				<div className="flex gap-2">
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
						onClick={handleApply}
						className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Apply
					</button>
				</div>
			</div>
		</DialogShell>
	);
}
