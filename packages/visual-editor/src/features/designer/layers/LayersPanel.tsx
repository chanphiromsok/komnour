import {
	Circle,
	Image,
	LayoutPanelTop,
	Minus,
	Spline,
	Square,
	Type,
} from "lucide-react";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { NodeId, ReportNode } from "@komnour/report/src/model/types";

const ICONS: Record<
	ReportNode["type"],
	React.ComponentType<{ size?: number | string }>
> = {
	page: LayoutPanelTop,
	view: LayoutPanelTop,
	text: Type,
	image: Image,
	rect: Square,
	circle: Circle,
	line: Minus,
	path: Spline,
};

export function LayersPanel() {
	const document = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const selection = useDesignerStore((s) => s.selection);
	const setSelection = useDesignerStore((s) => s.setSelection);

	const page = activePageId ? document.nodes[activePageId] : undefined;
	const childIds = page ? [...page.children].reverse() : [];

	return (
		<div className="flex w-56 shrink-0 flex-col border-neutral-300 border-r bg-white">
			<div className="border-neutral-200 border-b px-3 py-2 font-medium text-neutral-500 text-xs uppercase tracking-wide">
				Layers
			</div>
			<div className="flex-1 overflow-auto py-1">
				{childIds.map((id) => (
					<LayerRow
						key={id}
						nodeId={id}
						selected={selection.includes(id)}
						onSelect={(event) => {
							if (event.shiftKey) {
								const next = selection.includes(id)
									? selection.filter((sid) => sid !== id)
									: [...selection, id];
								setSelection(next);
							} else {
								setSelection([id]);
							}
						}}
					/>
				))}
			</div>
		</div>
	);
}

function LayerRow({
	nodeId,
	selected,
	onSelect,
}: {
	nodeId: NodeId;
	selected: boolean;
	onSelect: (event: React.MouseEvent) => void;
}) {
	const node = useDesignerStore((s) => s.document.nodes[nodeId]);
	if (!node) return null;
	const Icon = ICONS[node.type];

	return (
		<button
			type="button"
			onClick={onSelect}
			className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
				selected
					? "bg-blue-50 text-blue-700"
					: "text-neutral-700 hover:bg-neutral-50"
			}`}
		>
			<Icon size={14} />
			<span className="truncate">{node.name}</span>
		</button>
	);
}
