import { useDesignerStore } from "#/features/designer/store/reportStore";
import type {
	CircleNode,
	LineNode,
	NodeId,
	RectNode,
	Stroke,
} from "@komnour/report/src/model/types";
import { NumberField } from "./NumberField";

type ShapeNode = RectNode | CircleNode | LineNode;

/** Default on/off lengths (points) applied when a stroke is switched to dashed. */
const DEFAULT_DASH = [6, 4];

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

	const currentStroke: Stroke = node.stroke ?? { color: "#000000", width: 1 };
	const isDashed = (currentStroke.dash?.length ?? 0) > 0;
	// Merge into the existing stroke so editing one field never drops the others
	// (color/width/dash all live on the same replaced object).
	function updateStroke(patch: Partial<Stroke>) {
		updateNode(nodeId, { stroke: { ...currentStroke, ...patch } });
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
					value={currentStroke.color}
					onChange={(event) => updateStroke({ color: event.target.value })}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>

			<NumberField
				label="Stroke width"
				value={currentStroke.width}
				onChange={(width) => updateStroke({ width })}
			/>

			<label className="flex items-center gap-2 text-neutral-700 text-xs">
				<input
					type="checkbox"
					checked={isDashed}
					onChange={(event) =>
						updateStroke({ dash: event.target.checked ? DEFAULT_DASH : undefined })
					}
				/>
				Dashed {node.type === "line" ? "line" : "border"}
			</label>

			{isDashed && (
				<div className="grid grid-cols-2 gap-2">
					<NumberField
						label="Dash length"
						value={currentStroke.dash?.[0] ?? DEFAULT_DASH[0]}
						min={1}
						onChange={(dashLen) =>
							updateStroke({
								dash: [dashLen, currentStroke.dash?.[1] ?? DEFAULT_DASH[1]],
							})
						}
					/>
					<NumberField
						label="Gap length"
						value={currentStroke.dash?.[1] ?? DEFAULT_DASH[1]}
						min={1}
						onChange={(gapLen) =>
							updateStroke({
								dash: [currentStroke.dash?.[0] ?? DEFAULT_DASH[0], gapLen],
							})
						}
					/>
				</div>
			)}

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
