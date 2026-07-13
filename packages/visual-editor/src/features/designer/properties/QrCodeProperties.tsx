import { useLayoutEffect, useMemo, useState } from "react";
import {
	flattenBindingPaths,
	filterSuggestions,
} from "#/features/designer/bindings/paths";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { NodeId, QrCodeNode } from "@komnour/report/src/model/types";

const ERROR_CORRECTION_LEVELS: NonNullable<QrCodeNode["errorCorrection"]>[] = [
	"L",
	"M",
	"Q",
	"H",
];

export function QrCodeProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as QrCodeNode | undefined,
	);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const allPaths = useMemo(() => flattenBindingPaths(bindingData), [bindingData]);
	const [pathInputFocused, setPathInputFocused] = useState(false);
	const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
	const suggestions = filterSuggestions(allPaths, node?.valueBinding ?? "");
	useLayoutEffect(() => {
		if (activeSuggestionIndex >= suggestions.length) setActiveSuggestionIndex(0);
	}, [activeSuggestionIndex, suggestions.length]);

	if (!node || node.type !== "qrcode") return null;

	const isBound = Boolean(node.valueBinding);
	const showSuggestions = pathInputFocused && allPaths.length > 0;

	function applySuggestion(path: string) {
		updateNode(nodeId, { valueBinding: path });
		setPathInputFocused(false);
	}

	return (
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Value
				<input
					type="text"
					value={node.value}
					disabled={isBound}
					placeholder="e.g. https://example.com"
					onChange={(event) => updateNode(nodeId, { value: event.target.value })}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
				/>
				{isBound && (
					<span className="text-neutral-400">
						— bound to <span className="font-mono">{node.valueBinding}</span>,
						showing live preview on canvas
					</span>
				)}
			</label>

			<div className="relative flex flex-col gap-1 text-neutral-500 text-xs">
				Bound to (data path, optional)
				<input
					type="text"
					value={node.valueBinding ?? ""}
					placeholder="e.g. customer.trackingUrl"
					onChange={(event) => {
						updateNode(nodeId, {
							valueBinding: event.target.value || undefined,
						});
						setActiveSuggestionIndex(0);
					}}
					onFocus={() => setPathInputFocused(true)}
					// Delay so a mousedown on a suggestion row can fire first.
					onBlur={() => window.setTimeout(() => setPathInputFocused(false), 120)}
					onKeyDown={(event) => {
						if (!showSuggestions || suggestions.length === 0) return;
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActiveSuggestionIndex((i) => (i + 1) % suggestions.length);
						} else if (event.key === "ArrowUp") {
							event.preventDefault();
							setActiveSuggestionIndex(
								(i) => (i - 1 + suggestions.length) % suggestions.length,
							);
						} else if (event.key === "Enter" || event.key === "Tab") {
							event.preventDefault();
							applySuggestion(suggestions[activeSuggestionIndex].path);
						} else if (event.key === "Escape") {
							event.preventDefault();
							setPathInputFocused(false);
						}
					}}
					className="rounded border border-neutral-300 px-2 py-1 font-mono text-neutral-900 text-sm"
				/>
				{showSuggestions && suggestions.length > 0 && (
					<ul className="absolute top-full left-0 z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
						{suggestions.map((suggestion, index) => (
							<li key={suggestion.path}>
								<button
									type="button"
									onMouseDown={(event) => {
										event.preventDefault();
										applySuggestion(suggestion.path);
									}}
									onMouseEnter={() => setActiveSuggestionIndex(index)}
									className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs ${
										index === activeSuggestionIndex
											? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
											: "text-neutral-700 hover:bg-blue-50 dark:text-neutral-300 dark:hover:bg-blue-500/20"
									}`}
								>
									<span className="truncate font-mono">
										{suggestion.path}
										{suggestion.isBranch && (
											<span className="text-neutral-400">.</span>
										)}
									</span>
									<span className="shrink-0 truncate text-neutral-400">
										{suggestion.preview}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Module color
				<input
					type="color"
					value={node.color}
					onChange={(event) => updateNode(nodeId, { color: event.target.value })}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Background
				<input
					type="color"
					value={node.background ?? "#ffffff"}
					onChange={(event) =>
						updateNode(nodeId, { background: event.target.value })
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Error correction
				<select
					value={node.errorCorrection ?? "M"}
					onChange={(event) =>
						updateNode(nodeId, {
							errorCorrection: event.target
								.value as QrCodeNode["errorCorrection"],
						})
					}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				>
					{ERROR_CORRECTION_LEVELS.map((level) => (
						<option key={level} value={level}>
							{level}
						</option>
					))}
				</select>
			</label>
		</div>
	);
}
