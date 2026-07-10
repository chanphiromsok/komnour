import { useState } from "react";
import { useFontFamilies } from "#/features/designer/fonts/useFontFamilies";
import { NumberField } from "#/features/designer/properties/NumberField";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { DialogShell } from "./DialogShell";

export function DataBindingDialog({ onClose }: { onClose: () => void }) {
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const setBindingData = useDesignerStore((s) => s.setBindingData);
	const boundFieldIndicatorColor = useDesignerStore(
		(s) => s.boundFieldIndicatorColor,
	);
	const setBoundFieldIndicatorColor = useDesignerStore(
		(s) => s.setBoundFieldIndicatorColor,
	);
	const defaultFontFamily = useDesignerStore((s) => s.defaultFontFamily);
	const setDefaultFontFamily = useDesignerStore((s) => s.setDefaultFontFamily);
	const defaultFontSize = useDesignerStore((s) => s.defaultFontSize);
	const setDefaultFontSize = useDesignerStore((s) => s.setDefaultFontSize);
	const fontFamilies = useFontFamilies();
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

			<label className="flex items-center justify-between gap-2 border-neutral-200 border-t pt-3 text-neutral-500 text-xs dark:border-neutral-700">
				<span>
					Bound-field tick color (editor only)
					<br />
					<span className="text-neutral-400">
						Marks data-driven checkboxes on the canvas — applies across every
						document, and never appears in exported PDF/PNG.
					</span>
				</span>
				<input
					type="color"
					value={boundFieldIndicatorColor}
					onChange={(event) => setBoundFieldIndicatorColor(event.target.value)}
					className="h-8 w-8 shrink-0 rounded border border-neutral-300"
				/>
			</label>

			<div className="flex flex-col gap-2 border-neutral-200 border-t pt-3 text-neutral-500 text-xs dark:border-neutral-700">
				<span>
					Default text style (editor only)
					<br />
					<span className="text-neutral-400">
						Used for every new text node and checkbox label from now on —
						existing nodes are unaffected.
					</span>
				</span>
				<div className="grid grid-cols-2 gap-2">
					<label className="flex flex-col gap-1">
						Font family
						<select
							value={defaultFontFamily}
							onChange={(event) => setDefaultFontFamily(event.target.value)}
							className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
						>
							{fontFamilies.map((family) => (
								<option key={family} value={family}>
									{family}
								</option>
							))}
						</select>
					</label>
					<NumberField
						label="Font size"
						value={defaultFontSize}
						min={1}
						onChange={setDefaultFontSize}
					/>
				</div>
			</div>

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
