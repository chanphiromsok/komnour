import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { NodeId, PagePaper } from "@komnour/report/src/model/types";
import { NumberField } from "./NumberField";

const PRESETS: PagePaper["preset"][] = [
	"A5",
	"A4",
	"A3",
	"Letter",
	"Legal",
	"Custom",
];

export function PageProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore((s) => {
		const n = s.document.nodes[nodeId];
		return n?.type === "page" ? n : undefined;
	});
	const updateNode = useDesignerStore((s) => s.updateNode);
	if (!node) return null;

	const { paper, margin, background } = node;

	return (
		<div className="flex flex-col gap-3">
			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Paper size
				<select
					value={paper.preset}
					onChange={(event) =>
						updateNode(nodeId, {
							paper: {
								...paper,
								preset: event.target.value as PagePaper["preset"],
							},
						})
					}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				>
					{PRESETS.map((preset) => (
						<option key={preset} value={preset}>
							{preset}
						</option>
					))}
				</select>
			</label>

			<div className="flex flex-col gap-1 text-neutral-500 text-xs">
				Orientation
				<div className="flex gap-1">
					{(["portrait", "landscape"] as const).map((orientation) => (
						<button
							key={orientation}
							type="button"
							onClick={() =>
								updateNode(nodeId, { paper: { ...paper, orientation } })
							}
							className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
								paper.orientation === orientation
									? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-300"
									: "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
							}`}
						>
							{orientation}
						</button>
					))}
				</div>
			</div>

			{paper.preset === "Custom" && (
				<div className="grid grid-cols-2 gap-2">
					<NumberField
						label="Width"
						value={paper.width ?? 0}
						onChange={(width) =>
							updateNode(nodeId, { paper: { ...paper, width } })
						}
					/>
					<NumberField
						label="Height"
						value={paper.height ?? 0}
						onChange={(height) =>
							updateNode(nodeId, { paper: { ...paper, height } })
						}
					/>
				</div>
			)}

			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Margin top"
					value={margin.top}
					onChange={(top) => updateNode(nodeId, { margin: { ...margin, top } })}
				/>
				<NumberField
					label="Margin right"
					value={margin.right}
					onChange={(right) =>
						updateNode(nodeId, { margin: { ...margin, right } })
					}
				/>
				<NumberField
					label="Margin bottom"
					value={margin.bottom}
					onChange={(bottom) =>
						updateNode(nodeId, { margin: { ...margin, bottom } })
					}
				/>
				<NumberField
					label="Margin left"
					value={margin.left}
					onChange={(left) =>
						updateNode(nodeId, { margin: { ...margin, left } })
					}
				/>
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Background
				<input
					type="color"
					value={background}
					onChange={(event) =>
						updateNode(nodeId, { background: event.target.value })
					}
					className="h-8 w-full rounded border border-neutral-300"
				/>
			</label>
		</div>
	);
}
