import { useDesignerStore } from "#/features/designer/store/reportStore";
import type {
	CircleNode,
	LineNode,
	NodeId,
	RectNode,
} from "@komnour/report/src/model/types";
import { NumberField } from "./NumberField";

type ShapeNode = RectNode | CircleNode | LineNode;

export function ShapeProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as ShapeNode | undefined,
	);
	const updateNode = useDesignerStore((s) => s.updateNode);
	if (
		!node ||
		(node.type !== "rect" && node.type !== "circle" && node.type !== "line")
	) {
		return null;
	}

	return (
		<div className="flex flex-col gap-3">
			{(node.type === "rect" || node.type === "circle") && (
				<label className="flex flex-col gap-1 text-neutral-500 text-xs">
					Fill
					<input
						type="color"
						value={node.fill?.color ?? "#ffffff"}
						onChange={(event) =>
							updateNode(nodeId, { fill: { color: event.target.value } })
						}
						className="h-8 w-full rounded border border-neutral-300"
					/>
				</label>
			)}

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Stroke color
				<input
					type="color"
					value={node.stroke?.color ?? "#000000"}
					onChange={(event) =>
						updateNode(nodeId, {
							stroke: {
								color: event.target.value,
								width: node.stroke?.width ?? 1,
							},
						})
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<NumberField
				label="Stroke width"
				value={node.stroke?.width ?? 1}
				onChange={(width) =>
					updateNode(nodeId, {
						stroke: { color: node.stroke?.color ?? "#000000", width },
					})
				}
			/>

			{node.type === "rect" && (
				<NumberField
					label="Corner radius"
					value={node.radius ?? 0}
					onChange={(radius) => updateNode(nodeId, { radius })}
				/>
			)}
		</div>
	);
}
