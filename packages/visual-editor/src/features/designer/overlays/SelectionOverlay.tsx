import { getAbsoluteFrame } from "#/features/designer/canvas/geometry";
import type { NodeId, ReportDocument } from "@komnour/report/src/model/types";

/** Which frame edges a handle drives. "n"/"s" move top/bottom, "e"/"w" move right/left. */
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface SelectionOverlayProps {
	document: ReportDocument;
	selection: NodeId[];
	zoom: number;
	editingNodeId?: NodeId | null;
	onHandlePointerDown: (
		nodeId: NodeId,
		edge: ResizeEdge,
		event: React.PointerEvent,
	) => void;
	onRotatePointerDown: (nodeId: NodeId, event: React.PointerEvent) => void;
}

/** Visible dot size, in screen px (kept constant across zoom). */
const HANDLE_SIZE = 9;
/** Transparent grab area around each dot — a much larger hit target than the dot. */
const HIT_SIZE = 20;

const HANDLES: { edge: ResizeEdge; fx: number; fy: number; cursor: string }[] = [
	{ edge: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
	{ edge: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
	{ edge: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
	{ edge: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
	{ edge: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
	{ edge: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
	{ edge: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
	{ edge: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

const LINE_HANDLES: {
	edge: ResizeEdge;
	fx: number;
	fy: number;
	cursor: string;
}[] = [
	{ edge: "nw", fx: 0, fy: 0, cursor: "move" },
	{ edge: "se", fx: 1, fy: 1, cursor: "move" },
];

export function SelectionOverlay({
	document,
	selection,
	zoom,
	editingNodeId,
	onHandlePointerDown,
	onRotatePointerDown,
}: SelectionOverlayProps) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{selection.map((nodeId) => {
				const node = document.nodes[nodeId];
				if (!node) return null;
				const frame = getAbsoluteFrame(document, nodeId);
				const isEditing = nodeId === editingNodeId;
				const showHandles = selection.length === 1 && !isEditing;
				const handles = node.type === "line" ? LINE_HANDLES : HANDLES;
				const rotation = node.frame.rotation;

				return (
					// Outline + handles live in one wrapper rotated around the frame's
					// center — the same pivot the renderer draws with — so the
					// selection chrome tracks the shape exactly instead of staying
					// axis-aligned around a rotated node.
					<div
						key={nodeId}
						className="pointer-events-none absolute"
						style={{
							left: frame.x,
							top: frame.y,
							width: frame.width,
							height: frame.height,
							transform: rotation ? `rotate(${rotation}deg)` : undefined,
							transformOrigin: "center",
						}}
					>
						<div
							className={`pointer-events-none absolute inset-0 border-2 border-blue-500 ${
								isEditing ? "ring-4 ring-blue-500/15" : ""
							}`}
						/>
						{showHandles && (
							<RotateHandle
								x={frame.width / 2}
								y={-28 / zoom}
								zoom={zoom}
								onPointerDown={(event) =>
									onRotatePointerDown(nodeId, event)
								}
							/>
						)}
						{showHandles &&
							handles.map((handle) => (
								<ResizeHandle
									key={handle.edge}
									cursor={handle.cursor}
									x={frame.width * handle.fx}
									y={frame.height * handle.fy}
									zoom={zoom}
									onPointerDown={(event) =>
										onHandlePointerDown(nodeId, handle.edge, event)
									}
								/>
							))}
					</div>
				);
			})}
		</div>
	);
}

function RotateHandle({
	x,
	y,
	zoom,
	onPointerDown,
}: {
	x: number;
	y: number;
	zoom: number;
	onPointerDown: (event: React.PointerEvent) => void;
}) {
	return (
		<div
			className="pointer-events-auto absolute flex items-center justify-center"
			style={{
				left: x,
				top: y,
				width: HIT_SIZE,
				height: HIT_SIZE,
				marginLeft: -HIT_SIZE / 2,
				marginTop: -HIT_SIZE / 2,
				cursor: "grab",
				transform: `scale(${1 / zoom})`,
			}}
			onPointerDown={onPointerDown}
		>
			<div
				className="rounded-full border-2 border-blue-500 bg-white"
				style={{ width: HANDLE_SIZE + 2, height: HANDLE_SIZE + 2 }}
			/>
		</div>
	);
}

function ResizeHandle({
	x,
	y,
	zoom,
	cursor,
	onPointerDown,
}: {
	x: number;
	y: number;
	zoom: number;
	cursor: string;
	onPointerDown: (event: React.PointerEvent) => void;
}) {
	// A transparent HIT_SIZE grab box (easy to hit) wraps a small visible dot.
	// Both counter-scale by 1/zoom so their on-screen size is constant.
	return (
		<div
			className="pointer-events-auto absolute flex items-center justify-center"
			style={{
				left: x,
				top: y,
				width: HIT_SIZE,
				height: HIT_SIZE,
				marginLeft: -HIT_SIZE / 2,
				marginTop: -HIT_SIZE / 2,
				cursor,
				transform: `scale(${1 / zoom})`,
			}}
			onPointerDown={onPointerDown}
		>
			<div
				className="rounded-sm border border-blue-500 bg-white"
				style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
			/>
		</div>
	);
}
