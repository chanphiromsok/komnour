import { BindingTextarea } from "#/features/designer/bindings/BindingTextarea";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { SYMBOL_FONT_FAMILIES } from "@komnour/report/src/fonts/manifest";
import type { NodeId, TextNode } from "@komnour/report/src/model/types";
import { GlyphPicker } from "./GlyphPicker";
import { NumberField } from "./NumberField";

const FONT_FAMILIES = [
	"Inter",
	"Roboto",
	"Battambang",
	"Noto Sans Khmer",
	"Wingdings 2",
];
const ALIGNS: TextNode["style"]["align"][] = ["left", "center", "right"];

export function TextProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as TextNode | undefined,
	);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const updateNodeStyle = useDesignerStore((s) => s.updateNodeStyle);
	if (!node || node.type !== "text") return null;

	return (
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Content
				<BindingTextarea
					value={node.text}
					onValueChange={(text) => updateNode(nodeId, { text })}
					rows={3}
					className="w-full rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				/>
			</label>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Font family
				<select
					value={node.style.fontFamily}
					onChange={(event) =>
						updateNodeStyle(nodeId, { fontFamily: event.target.value })
					}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				>
					{FONT_FAMILIES.map((family) => (
						<option key={family} value={family}>
							{family}
						</option>
					))}
				</select>
			</label>

			{SYMBOL_FONT_FAMILIES.includes(node.style.fontFamily) && (
				<GlyphPicker
					fontFamily={node.style.fontFamily}
					onInsert={(char) =>
						updateNode(nodeId, { text: `${node.text}${char}` })
					}
				/>
			)}

			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Size"
					value={node.style.fontSize}
					onChange={(fontSize) => updateNodeStyle(nodeId, { fontSize })}
				/>
				<NumberField
					label="Weight"
					value={node.style.fontWeight}
					onChange={(fontWeight) => updateNodeStyle(nodeId, { fontWeight })}
				/>
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Color
				<input
					type="color"
					value={node.style.color}
					onChange={(event) =>
						updateNodeStyle(nodeId, { color: event.target.value })
					}
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
							onClick={() => updateNodeStyle(nodeId, { align })}
							className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
								node.style.align === align
									? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-300"
									: "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
							}`}
						>
							{align}
						</button>
					))}
				</div>
			</div>

			<label className="flex items-center gap-2 text-neutral-700 text-xs">
				<input
					type="checkbox"
					checked={node.style.wrap}
					onChange={(event) =>
						updateNodeStyle(nodeId, { wrap: event.target.checked })
					}
				/>
				Wrap text
			</label>
		</div>
	);
}
