import { useMemo, useState } from "react";
import {
	flattenBindingPaths,
	filterSuggestions,
} from "#/features/designer/bindings/paths";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { CheckboxNode, NodeId } from "@komnour/report/src/model/types";

export function CheckboxProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as CheckboxNode | undefined,
	);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const allPaths = useMemo(() => flattenBindingPaths(bindingData), [bindingData]);
	const [pathInputFocused, setPathInputFocused] = useState(false);

	if (!node || node.type !== "checkbox") return null;

	const isBound = Boolean(node.checkedBinding);
	const suggestions = filterSuggestions(allPaths, node.checkedBinding ?? "");
	const showSuggestions = pathInputFocused && allPaths.length > 0;

	return (
		<div className="flex flex-col gap-3">
			<label className="flex items-center gap-2 text-neutral-700 text-xs">
				<input
					type="checkbox"
					checked={node.checked}
					disabled={isBound}
					onChange={(event) =>
						updateNode(nodeId, { checked: event.target.checked })
					}
				/>
				Checked
				{isBound && (
					<span className="text-neutral-400">
						— bound to <span className="font-mono">{node.checkedBinding}</span>
						, showing live preview on canvas
					</span>
				)}
			</label>

			<div className="relative flex flex-col gap-1 text-neutral-500 text-xs">
				Bound to (data path, optional)
				<input
					type="text"
					value={node.checkedBinding ?? ""}
					placeholder="e.g. loan.rateType.fixed"
					onChange={(event) =>
						updateNode(nodeId, {
							checkedBinding: event.target.value || undefined,
						})
					}
					onFocus={() => setPathInputFocused(true)}
					// Delay so a mousedown on a suggestion row can fire first.
					onBlur={() => window.setTimeout(() => setPathInputFocused(false), 120)}
					className="rounded border border-neutral-300 px-2 py-1 font-mono text-neutral-900 text-sm"
				/>
				{showSuggestions && suggestions.length > 0 && (
					<ul className="absolute top-full left-0 z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
						{suggestions.map((suggestion) => (
							<li key={suggestion.path}>
								<button
									type="button"
									onMouseDown={(event) => {
										event.preventDefault();
										updateNode(nodeId, { checkedBinding: suggestion.path });
										setPathInputFocused(false);
									}}
									className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-blue-50 dark:hover:bg-blue-500/20"
								>
									<span className="truncate font-mono">{suggestion.path}</span>
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
				Label
				<input
					type="text"
					value={node.label ?? ""}
					placeholder="e.g. I agree to the terms"
					onChange={(event) =>
						updateNode(nodeId, { label: event.target.value || undefined })
					}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Box fill
				<input
					type="color"
					value={node.fill?.color ?? "#ffffff"}
					onChange={(event) =>
						updateNode(nodeId, { fill: { color: event.target.value } })
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Box border
				<input
					type="color"
					value={node.stroke?.color ?? "#999999"}
					onChange={(event) =>
						updateNode(nodeId, {
							stroke: { color: event.target.value, width: node.stroke?.width ?? 1 },
						})
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Check color
				<input
					type="color"
					value={node.checkColor}
					onChange={(event) =>
						updateNode(nodeId, { checkColor: event.target.value })
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
				{isBound && (
					<span className="text-neutral-400">
						Used in exported PDF/PNG. The canvas shows the editor's bound-field
						indicator color instead while bound (set in Data binding).
					</span>
				)}
			</label>
		</div>
	);
}
