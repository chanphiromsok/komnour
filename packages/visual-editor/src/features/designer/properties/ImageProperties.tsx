import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { ImageNode, NodeId } from "@komnour/report/src/model/types";

const FITS: ImageNode["fit"][] = ["contain", "cover", "fill"];

export function ImageProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as ImageNode | undefined,
	);
	const asset = useDesignerStore((s) =>
		node ? s.document.assets[node.assetId] : undefined,
	);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const setImageAsset = useDesignerStore((s) => s.setImageAsset);
	if (!node || node.type !== "image") return null;

	return (
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Image URL
				<input
					type="text"
					defaultValue={asset?.url ?? ""}
					onBlur={(event) => setImageAsset(nodeId, event.target.value)}
					placeholder="https://..."
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				/>
			</label>

			<div className="flex flex-col gap-1 text-neutral-500 text-xs">
				Fit
				<div className="flex gap-1">
					{FITS.map((fit) => (
						<button
							key={fit}
							type="button"
							onClick={() => updateNode(nodeId, { fit })}
							className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
								node.fit === fit
									? "border-blue-500 bg-blue-50 text-blue-700"
									: "border-neutral-300 text-neutral-700"
							}`}
						>
							{fit}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
