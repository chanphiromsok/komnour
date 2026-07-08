import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { NodeId } from "@komnour/report/src/model/types";
import { NumberField } from "./NumberField";

export function FrameProperties({ nodeId }: { nodeId: NodeId }) {
	const frame = useDesignerStore((s) => s.document.nodes[nodeId]?.frame);
	const updateNodeFrame = useDesignerStore((s) => s.updateNodeFrame);
	const updateNode = useDesignerStore((s) => s.updateNode);
	if (!frame) return null;

	return (
		<div className="grid grid-cols-2 gap-2">
			<NumberField
				label="X"
				value={frame.x}
				onChange={(x) => updateNodeFrame(nodeId, { x, y: frame.y })}
			/>
			<NumberField
				label="Y"
				value={frame.y}
				onChange={(y) => updateNodeFrame(nodeId, { x: frame.x, y })}
			/>
			<NumberField
				label="Width"
				value={frame.width}
				onChange={(width) =>
					updateNodeFrame(nodeId, { width, height: frame.height })
				}
			/>
			<NumberField
				label="Height"
				value={frame.height}
				onChange={(height) =>
					updateNodeFrame(nodeId, { width: frame.width, height })
				}
			/>
			<NumberField
				label="Rotation"
				value={frame.rotation}
				onChange={(rotation) =>
					updateNode(nodeId, { frame: { ...frame, rotation } })
				}
			/>
		</div>
	);
}
