import { getAbsoluteFrame } from "#/features/designer/canvas/geometry";
import type { NodeId, ReportDocument } from "@komnour/report/src/model/types";

type ResizeEdge = "right" | "bottom" | "corner";

interface SelectionOverlayProps {
	document: ReportDocument;
	selection: NodeId[];
	zoom: number;
	onHandlePointerDown: (
		nodeId: NodeId,
		edge: ResizeEdge,
		event: React.PointerEvent,
	) => void;
}

const HANDLE_SIZE = 8;

export function SelectionOverlay({
	document,
	selection,
	zoom,
	onHandlePointerDown,
}: SelectionOverlayProps) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{selection.map((nodeId) => {
				const node = document.nodes[nodeId];
				if (!node) return null;
				const frame = getAbsoluteFrame(document, nodeId);
				const showHandles = selection.length === 1;

				return (
					<div key={nodeId}>
						<div
							className="pointer-events-none absolute border-2 border-blue-500"
							style={{
								left: frame.x,
								top: frame.y,
								width: frame.width,
								height: frame.height,
							}}
						/>
						{showHandles && (
							<>
								<ResizeHandle
									cursor="ew-resize"
									x={frame.x + frame.width}
									y={frame.y + frame.height / 2}
									zoom={zoom}
									onPointerDown={(e) => onHandlePointerDown(nodeId, "right", e)}
								/>
								<ResizeHandle
									cursor="ns-resize"
									x={frame.x + frame.width / 2}
									y={frame.y + frame.height}
									zoom={zoom}
									onPointerDown={(e) =>
										onHandlePointerDown(nodeId, "bottom", e)
									}
								/>
								<ResizeHandle
									cursor="nwse-resize"
									x={frame.x + frame.width}
									y={frame.y + frame.height}
									zoom={zoom}
									onPointerDown={(e) =>
										onHandlePointerDown(nodeId, "corner", e)
									}
								/>
							</>
						)}
					</div>
				);
			})}
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
	return (
		<div
			className="pointer-events-auto absolute rounded-sm border border-blue-500 bg-white"
			style={{
				left: x,
				top: y,
				width: HANDLE_SIZE,
				height: HANDLE_SIZE,
				marginLeft: -HANDLE_SIZE / 2,
				marginTop: -HANDLE_SIZE / 2,
				cursor,
				transform: `scale(${1 / zoom})`,
			}}
			onPointerDown={onPointerDown}
		/>
	);
}
