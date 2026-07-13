import {
	CheckSquare,
	Circle,
	Image,
	LayoutPanelTop,
	Minus,
	QrCode,
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
	checkbox: CheckSquare,
	qrcode: QrCode,
};

export function LayersPanel() {
	const document = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const selection = useDesignerStore((s) => s.selection);
	const setSelection = useDesignerStore((s) => s.setSelection);

	const page = activePageId ? document.nodes[activePageId] : undefined;
	const childIds = page ? [...page.children].reverse() : [];

	return (
		<div className="flex w-60 shrink-0 flex-col border-neutral-200 border-r bg-[#f7f7f8] dark:border-neutral-800 dark:bg-neutral-900">
			<div className="border-neutral-200 border-b px-3 py-2.5 dark:border-neutral-800">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-semibold text-neutral-900 text-sm dark:text-neutral-100">
							Layers
						</div>
						<div className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
							{page?.name ?? "No active page"}
						</div>
					</div>
					<span className="rounded-full bg-neutral-200 px-2 py-0.5 font-medium text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
						{childIds.length}
					</span>
				</div>
			</div>
			<div className="flex-1 overflow-auto p-2">
				{childIds.length === 0 ? (
					<div className="rounded-lg border border-dashed border-neutral-300 bg-white/70 p-3 text-neutral-400 text-xs dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-500">
						Add text, shapes, images, or checkboxes to see layers here.
					</div>
				) : (
					<div className="space-y-1">
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
				)}
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
			className={`group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
				selected
					? "bg-blue-500 text-white shadow-sm"
					: "text-neutral-700 hover:bg-white dark:text-neutral-300 dark:hover:bg-neutral-800"
			}`}
		>
			<span
				className={`flex h-5 w-5 items-center justify-center rounded ${
					selected
						? "bg-white/15"
						: "bg-neutral-200 text-neutral-500 group-hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400"
				}`}
			>
				<Icon size={13} />
			</span>
			<span className="truncate font-medium">{node.name}</span>
		</button>
	);
}
