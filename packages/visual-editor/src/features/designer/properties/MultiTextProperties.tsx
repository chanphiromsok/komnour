import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { NodeId, TextNode, TextStyle } from "@komnour/report/src/model/types";
import { NumberField } from "./NumberField";

const FONT_FAMILIES = [
	"Inter",
	"Roboto",
	"Battambang",
	"Noto Sans Khmer",
	"Khmer OS Moul",
	"Wingdings 2",
];
const ALIGNS: TextStyle["align"][] = ["left", "center", "right"];

/**
 * Bulk style editor for a multi-selection containing text nodes — Figma-style:
 * every field applies to all selected text nodes at once rather than editing
 * one node's properties. Fields are seeded from the first selected text
 * node's style (a starting point, not a "this is what they all share"
 * indicator), since the selection may mix differing values.
 */
export function MultiTextProperties({ nodeIds }: { nodeIds: NodeId[] }) {
	const firstNode = useDesignerStore((s) => {
		for (const id of nodeIds) {
			const node = s.document.nodes[id];
			if (node?.type === "text") return node as TextNode;
		}
		return undefined;
	});
	const updateNodesStyle = useDesignerStore((s) => s.updateNodesStyle);
	if (!firstNode) return null;

	function apply(style: Partial<TextStyle>) {
		updateNodesStyle(nodeIds, style);
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[10px] text-neutral-400">
				Applies to every selected text element.
			</p>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Font family
				<select
					value={firstNode.style.fontFamily}
					onChange={(event) => apply({ fontFamily: event.target.value })}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				>
					{FONT_FAMILIES.map((family) => (
						<option key={family} value={family}>
							{family}
						</option>
					))}
				</select>
			</label>

			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Size"
					value={firstNode.style.fontSize}
					onChange={(fontSize) => apply({ fontSize })}
				/>
				<NumberField
					label="Weight"
					value={firstNode.style.fontWeight}
					onChange={(fontWeight) => apply({ fontWeight })}
				/>
				<NumberField
					label="Line height"
					value={firstNode.style.lineHeight}
					min={0.5}
					max={4}
					step={0.1}
					onChange={(lineHeight) => apply({ lineHeight })}
				/>
				<NumberField
					label="Letter spacing"
					value={firstNode.style.letterSpacing}
					min={-10}
					max={50}
					step={0.5}
					onChange={(letterSpacing) => apply({ letterSpacing })}
				/>
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Color
				<input
					type="color"
					value={firstNode.style.color}
					onChange={(event) => apply({ color: event.target.value })}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<div className="flex flex-col gap-1 text-neutral-500 text-xs">
				Align
				<div className="flex gap-1">
					{ALIGNS.map((align) => (
						<button
							key={align}
							type="button"
							onClick={() => apply({ align })}
							className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
								firstNode.style.align === align
									? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-300"
									: "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
							}`}
						>
							{align}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
