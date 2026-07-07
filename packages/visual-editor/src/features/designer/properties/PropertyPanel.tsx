import { useDesignerStore } from "#/features/designer/store/reportStore";
import { FrameProperties } from "./FrameProperties";
import { ImageProperties } from "./ImageProperties";
import { PageProperties } from "./PageProperties";
import { ShapeProperties } from "./ShapeProperties";
import { TextProperties } from "./TextProperties";

export function PropertyPanel() {
	const selection = useDesignerStore((s) => s.selection);
	const node = useDesignerStore((s) =>
		selection.length === 1 ? s.document.nodes[selection[0]] : undefined,
	);

	return (
		<div className="flex w-64 shrink-0 flex-col gap-4 overflow-auto border-neutral-300 border-l bg-white p-3">
			<div className="font-medium text-neutral-500 text-xs uppercase tracking-wide">
				Properties
			</div>

			{!node && (
				<p className="text-neutral-400 text-sm">
					{selection.length > 1
						? "Multiple elements selected"
						: "Nothing selected"}
				</p>
			)}

			{node && node.type === "page" && <PageProperties nodeId={node.id} />}

			{node && node.type !== "page" && (
				<>
					<FrameProperties nodeId={node.id} />
					{node.type === "text" && <TextProperties nodeId={node.id} />}
					{node.type === "image" && <ImageProperties nodeId={node.id} />}
					{(node.type === "rect" ||
						node.type === "circle" ||
						node.type === "line") && <ShapeProperties nodeId={node.id} />}
				</>
			)}
		</div>
	);
}
