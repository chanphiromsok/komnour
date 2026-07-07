import type { Surface } from "canvaskit-wasm";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlignmentGuides,
	computeAlignmentGuides,
} from "#/features/designer/overlays/AlignmentGuides";
import { SelectionOverlay } from "#/features/designer/overlays/SelectionOverlay";
import {
	createCircleNode,
	createLineNode,
	createRectNode,
	createTextNode,
} from "#/features/designer/store/nodeFactories";
import {
	GRID_SIZE,
	snapToGrid,
	useDesignerStore,
} from "#/features/designer/store/reportStore";
import { loadBrowserFontMgr } from "@komnour/report/src/fonts/registerBrowser";
import { resolvePaperSize } from "@komnour/report/src/layout/paper";
import type {
	Frame,
	NodeId,
	PageNode,
	ReportDocument,
} from "@komnour/report/src/model/types";
import { CanvasAdapter } from "@komnour/report/src/render/canvasAdapter";
import { loadCanvasKit } from "@komnour/report/src/render/canvasKitLoader";
import { renderDocument } from "@komnour/report/src/render/renderer";
import { resolveAssetBrowser } from "@komnour/report/src/render/resolveAssetBrowser";
import { getAbsoluteFrame, hitTest, rectsIntersect } from "./geometry";
import { TextEditOverlay } from "./TextEditOverlay";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

type ResizeEdge = "right" | "bottom" | "corner";

type Interaction =
	| {
			kind: "move";
			nodeId: NodeId;
			startX: number;
			startY: number;
			originalFrame: Frame;
	  }
	| {
			kind: "resize";
			nodeId: NodeId;
			edge: ResizeEdge;
			startX: number;
			startY: number;
			originalFrame: Frame;
	  }
	| {
			kind: "marquee";
			startX: number;
			startY: number;
			currentX: number;
			currentY: number;
	  }
	| {
			kind: "pan";
			startClientX: number;
			startClientY: number;
			originalPan: { x: number; y: number };
	  };

export function DesignerCanvas() {
	const viewportRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const surfaceRef = useRef<Surface | null>(null);
	const adapterRef = useRef<CanvasAdapter | null>(null);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const document = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const selection = useDesignerStore((s) => s.selection);
	const tool = useDesignerStore((s) => s.tool);
	const zoom = useDesignerStore((s) => s.zoom);
	const pan = useDesignerStore((s) => s.pan);
	const setSelection = useDesignerStore((s) => s.setSelection);
	const toggleSelection = useDesignerStore((s) => s.toggleSelection);
	const clearSelection = useDesignerStore((s) => s.clearSelection);
	const updateNodeFrame = useDesignerStore((s) => s.updateNodeFrame);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const removeNodes = useDesignerStore((s) => s.removeNodes);
	const duplicateNodes = useDesignerStore((s) => s.duplicateNodes);
	const undo = useDesignerStore((s) => s.undo);
	const redo = useDesignerStore((s) => s.redo);
	const setPan = useDesignerStore((s) => s.setPan);
	const setZoom = useDesignerStore((s) => s.setZoom);
	const setTool = useDesignerStore((s) => s.setTool);
	const addNode = useDesignerStore((s) => s.addNode);
	const verify = useDesignerStore((s) => s.verify);

	const [editingNodeId, setEditingNodeId] = useState<NodeId | null>(null);

	const [dragPreview, setDragPreview] = useState<{
		nodeId: NodeId;
		frame: Partial<Frame>;
	} | null>(null);
	const [marqueeRect, setMarqueeRect] = useState<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(null);
	const [guides, setGuides] = useState<{
		vertical: number[];
		horizontal: number[];
	}>({
		vertical: [],
		horizontal: [],
	});
	const interactionRef = useRef<Interaction | null>(null);
	const toolBeforeSpaceRef = useRef<typeof tool | null>(null);

	const page = activePageId
		? (document.nodes[activePageId] as PageNode | undefined)
		: undefined;
	const size = page
		? resolvePaperSize(page.paper)
		: { width: 595.28, height: 841.89 };

	const effectiveDocument = useMemo<ReportDocument>(() => {
		if (!dragPreview) return document;
		const node = document.nodes[dragPreview.nodeId];
		if (!node) return document;
		return {
			...document,
			nodes: {
				...document.nodes,
				[dragPreview.nodeId]: {
					...node,
					frame: { ...node.frame, ...dragPreview.frame },
				},
			},
		};
	}, [document, dragPreview]);

	const editingNode = editingNodeId ? document.nodes[editingNodeId] : undefined;
	const editingFrame = editingNodeId
		? getAbsoluteFrame(document, editingNodeId)
		: undefined;

	useEffect(() => {
		let cancelled = false;

		async function init() {
			const canvasEl = canvasRef.current;
			if (!canvasEl) return;
			// Size the backing pixel buffer at devicePixelRatio (imperatively,
			// after mount — window.devicePixelRatio doesn't exist during SSR, and
			// setting it here rather than via JSX avoids any hydration mismatch).
			// CSS size (in the `style` prop below) stays in document points; only
			// the physical buffer gets denser, which is what makes the canvas
			// crisp on HiDPI displays instead of upscaled/blurry.
			const dpr = window.devicePixelRatio || 1;
			canvasEl.width = size.width * dpr;
			canvasEl.height = size.height * dpr;
			const canvasKit = await loadCanvasKit();
			if (cancelled) return;
			const fontMgr = await loadBrowserFontMgr(canvasKit);
			if (cancelled) return;
			const surface = canvasKit.MakeCanvasSurface(canvasEl);
			if (!surface) {
				setError("Failed to create CanvasKit surface");
				return;
			}
			surfaceRef.current = surface;
			adapterRef.current = new CanvasAdapter(canvasKit, surface, fontMgr, dpr);
			setReady(true);
		}

		init().catch((err) =>
			setError(err instanceof Error ? err.message : String(err)),
		);

		return () => {
			cancelled = true;
			surfaceRef.current?.delete();
			surfaceRef.current = null;
			adapterRef.current = null;
		};
	}, [size.width, size.height]);

	useEffect(() => {
		if (!ready || !adapterRef.current) return;
		renderDocument(effectiveDocument, adapterRef.current, undefined, {
			resolveAsset: resolveAssetBrowser,
		}).catch((err) =>
			setError(err instanceof Error ? err.message : String(err)),
		);
	}, [ready, effectiveDocument]);

	useEffect(() => {
		const viewportEl = viewportRef.current;
		if (!viewportEl) return;

		function onWheel(event: WheelEvent) {
			if (!(event.ctrlKey || event.metaKey)) return;
			const stageEl = stageRef.current;
			if (!stageEl) return;
			event.preventDefault();

			const { zoom: zoomOld, pan: panOld } = useDesignerStore.getState();
			const rect = stageEl.getBoundingClientRect();
			// Cursor position relative to the stage's current (pre-zoom-change)
			// rendered box — since screenX = rect.left + docX * zoomOld, this is
			// exactly `docX * zoomOld`, which is what the zoom-to-cursor pan
			// correction below needs (see the derivation in the plan doc).
			const cursorX = event.clientX - rect.left;
			const cursorY = event.clientY - rect.top;

			// ~10% zoom change per typical wheel notch (deltaY ~100); trackpad
			// pinch gestures send many small deltas that compound smoothly.
			const zoomFactor = Math.exp(-event.deltaY * 0.001);
			const zoomNew = Math.min(
				MAX_ZOOM,
				Math.max(MIN_ZOOM, zoomOld * zoomFactor),
			);
			const scaleRatio = zoomNew / zoomOld;

			setZoom(zoomNew);
			setPan({
				x: panOld.x + cursorX * (1 - scaleRatio),
				y: panOld.y + cursorY * (1 - scaleRatio),
			});
		}

		viewportEl.addEventListener("wheel", onWheel, { passive: false });
		return () => viewportEl.removeEventListener("wheel", onWheel);
	}, [setZoom, setPan]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null;
			if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
				return;
			if (editingNodeId) return;

			const isMeta = event.metaKey || event.ctrlKey;
			const key = event.key.toLowerCase();

			if (isMeta && key === "z" && event.shiftKey) {
				event.preventDefault();
				redo();
			} else if (isMeta && key === "z") {
				event.preventDefault();
				undo();
			} else if (isMeta && key === "d") {
				event.preventDefault();
				if (selection.length > 0) duplicateNodes(selection);
			} else if (isMeta && key === "a") {
				event.preventDefault();
				if (activePageId) setSelection(document.nodes[activePageId].children);
			} else if (isMeta && (key === "=" || key === "+")) {
				event.preventDefault();
				setZoom(zoom + 0.1);
			} else if (isMeta && key === "-") {
				event.preventDefault();
				setZoom(zoom - 0.1);
			} else if (isMeta && key === "0") {
				event.preventDefault();
				setZoom(1);
			} else if (event.key === "Delete" || event.key === "Backspace") {
				if (selection.length > 0) {
					event.preventDefault();
					removeNodes(selection);
				}
			} else if (event.key === "Escape") {
				clearSelection();
			} else if (
				["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
					event.key,
				) &&
				selection.length > 0
			) {
				event.preventDefault();
				const step = event.shiftKey ? GRID_SIZE : 1;
				const [dx, dy] =
					event.key === "ArrowUp"
						? [0, -step]
						: event.key === "ArrowDown"
							? [0, step]
							: event.key === "ArrowLeft"
								? [-step, 0]
								: [step, 0];
				for (const id of selection) {
					const node = document.nodes[id];
					if (!node) continue;
					updateNodeFrame(id, { x: node.frame.x + dx, y: node.frame.y + dy });
				}
			} else if (
				!isMeta &&
				!event.altKey &&
				event.key === " " &&
				!event.repeat
			) {
				event.preventDefault();
				toolBeforeSpaceRef.current = tool;
				setTool("pan");
			} else if (!isMeta && !event.altKey && !event.repeat && activePageId) {
				if (key === "v") setTool("select");
				else if (key === "h") setTool("pan");
				else if (key === "t")
					addNode(createTextNode(activePageId), activePageId);
				else if (key === "r")
					addNode(createRectNode(activePageId), activePageId);
				else if (key === "o")
					addNode(createCircleNode(activePageId), activePageId);
				else if (key === "l")
					addNode(createLineNode(activePageId), activePageId);
			}
		}

		function onKeyUp(event: KeyboardEvent) {
			if (event.key === " " && toolBeforeSpaceRef.current) {
				setTool(toolBeforeSpaceRef.current);
				toolBeforeSpaceRef.current = null;
			}
		}

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [
		selection,
		undo,
		redo,
		duplicateNodes,
		removeNodes,
		clearSelection,
		editingNodeId,
		activePageId,
		document,
		setSelection,
		setZoom,
		zoom,
		updateNodeFrame,
		tool,
		setTool,
		addNode,
	]);

	function toDocPoint(clientX: number, clientY: number) {
		const stage = stageRef.current;
		if (!stage) return { x: 0, y: 0 };
		const rect = stage.getBoundingClientRect();
		return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
	}

	function handleHandlePointerDown(
		nodeId: NodeId,
		edge: ResizeEdge,
		event: React.PointerEvent,
	) {
		event.stopPropagation();
		event.preventDefault();
		const node = document.nodes[nodeId];
		if (!node) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);
		interactionRef.current = {
			kind: "resize",
			nodeId,
			edge,
			startX: x,
			startY: y,
			originalFrame: { ...node.frame },
		};
		(event.target as Element).setPointerCapture(event.pointerId);
	}

	function handleStageDoubleClick(event: React.MouseEvent) {
		if (!activePageId) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);
		const hitId = hitTest(document, activePageId, x, y);
		const node = hitId ? document.nodes[hitId] : undefined;
		if (node?.type === "text") {
			setSelection([node.id]);
			setEditingNodeId(node.id);
		}
	}

	function handleStagePointerDown(event: React.PointerEvent) {
		if (!activePageId || editingNodeId) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const { x, y } = toDocPoint(event.clientX, event.clientY);

		if (tool === "pan" || event.button === 1) {
			interactionRef.current = {
				kind: "pan",
				startClientX: event.clientX,
				startClientY: event.clientY,
				originalPan: pan,
			};
			return;
		}

		const hitId = hitTest(document, activePageId, x, y);
		if (hitId) {
			if (event.shiftKey) {
				toggleSelection(hitId);
				return;
			}
			if (!selection.includes(hitId)) setSelection([hitId]);
			const node = document.nodes[hitId];
			interactionRef.current = {
				kind: "move",
				nodeId: hitId,
				startX: x,
				startY: y,
				originalFrame: { ...node.frame },
			};
		} else {
			if (!event.shiftKey) clearSelection();
			interactionRef.current = {
				kind: "marquee",
				startX: x,
				startY: y,
				currentX: x,
				currentY: y,
			};
			setMarqueeRect({ x, y, width: 0, height: 0 });
		}
	}

	function handlePointerMove(event: React.PointerEvent) {
		const interaction = interactionRef.current;
		if (!interaction || !activePageId) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);

		if (interaction.kind === "move") {
			const dx = x - interaction.startX;
			const dy = y - interaction.startY;
			const newFrame = {
				x: snapToGrid(interaction.originalFrame.x + dx),
				y: snapToGrid(interaction.originalFrame.y + dy),
			};
			setDragPreview({ nodeId: interaction.nodeId, frame: newFrame });

			const siblingIds = document.nodes[interaction.nodeId]
				? Object.values(document.nodes)
						.filter(
							(n) => n.parentId === document.nodes[interaction.nodeId].parentId,
						)
						.filter((n) => n.id !== interaction.nodeId)
						.map((n) => n.id)
				: [];
			const siblingFrames = siblingIds.map((id) =>
				getAbsoluteFrame(document, id),
			);
			const draggedAbsolute = {
				...newFrame,
				width: interaction.originalFrame.width,
				height: interaction.originalFrame.height,
			};
			setGuides(computeAlignmentGuides(siblingFrames, draggedAbsolute));
		} else if (interaction.kind === "resize") {
			const dx = x - interaction.startX;
			const dy = y - interaction.startY;
			const newFrame: Partial<Frame> = {};
			if (interaction.edge === "right" || interaction.edge === "corner") {
				newFrame.width = Math.max(
					1,
					snapToGrid(interaction.originalFrame.width + dx),
				);
			}
			if (interaction.edge === "bottom" || interaction.edge === "corner") {
				newFrame.height = Math.max(
					1,
					snapToGrid(interaction.originalFrame.height + dy),
				);
			}
			setDragPreview({ nodeId: interaction.nodeId, frame: newFrame });
		} else if (interaction.kind === "marquee") {
			interactionRef.current = { ...interaction, currentX: x, currentY: y };
			setMarqueeRect({
				x: Math.min(interaction.startX, x),
				y: Math.min(interaction.startY, y),
				width: Math.abs(x - interaction.startX),
				height: Math.abs(y - interaction.startY),
			});
		} else if (interaction.kind === "pan") {
			setPan({
				x:
					interaction.originalPan.x +
					(event.clientX - interaction.startClientX),
				y:
					interaction.originalPan.y +
					(event.clientY - interaction.startClientY),
			});
		}
	}

	function handlePointerUp() {
		const interaction = interactionRef.current;
		if (!interaction || !activePageId) {
			interactionRef.current = null;
			return;
		}

		if (interaction.kind === "move" || interaction.kind === "resize") {
			if (dragPreview) {
				if ("x" in dragPreview.frame || "y" in dragPreview.frame) {
					updateNodeFrame(interaction.nodeId, {
						x: dragPreview.frame.x ?? interaction.originalFrame.x,
						y: dragPreview.frame.y ?? interaction.originalFrame.y,
					});
				}
				if ("width" in dragPreview.frame || "height" in dragPreview.frame) {
					updateNodeFrame(interaction.nodeId, {
						width: dragPreview.frame.width ?? interaction.originalFrame.width,
						height:
							dragPreview.frame.height ?? interaction.originalFrame.height,
					});
				}
			}
			setDragPreview(null);
			setGuides({ vertical: [], horizontal: [] });
		} else if (interaction.kind === "marquee") {
			const rect = {
				x: Math.min(interaction.startX, interaction.currentX),
				y: Math.min(interaction.startY, interaction.currentY),
				width: Math.abs(interaction.currentX - interaction.startX),
				height: Math.abs(interaction.currentY - interaction.startY),
			};
			if (rect.width > 2 || rect.height > 2) {
				const ids = document.nodes[activePageId].children.filter((id) =>
					rectsIntersect(rect, getAbsoluteFrame(document, id)),
				);
				setSelection(ids);
			}
			setMarqueeRect(null);
		}

		interactionRef.current = null;
	}

	return (
		<div
			ref={viewportRef}
			className="relative flex-1 overflow-auto bg-neutral-200"
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			<div className="min-h-full min-w-full p-16">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: graphical editor surface (canvas + overlays), not a semantic content element */}
				<div
					ref={stageRef}
					className="relative"
					style={{
						width: size.width,
						height: size.height,
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
						transformOrigin: "top left",
					}}
					onPointerDown={handleStagePointerDown}
					onDoubleClick={handleStageDoubleClick}
				>
					{error && (
						<p className="absolute top-0 left-0 text-red-600">{error}</p>
					)}
					<canvas
						ref={canvasRef}
						width={size.width}
						height={size.height}
						style={{ width: size.width, height: size.height }}
						className="bg-white shadow-lg"
					/>
					{verify.pngDataUrl && (
						// biome-ignore lint/a11y/useAltText: purely a diagnostic overlay, not content
						<img
							src={verify.pngDataUrl}
							width={size.width}
							height={size.height}
							className="pointer-events-none absolute top-0 left-0 opacity-50 mix-blend-difference"
						/>
					)}
					<SelectionOverlay
						document={effectiveDocument}
						selection={selection}
						zoom={zoom}
						onHandlePointerDown={handleHandlePointerDown}
					/>
					<AlignmentGuides guides={guides} pageSize={size} />
					{editingNode && editingNode.type === "text" && editingFrame && (
						<TextEditOverlay
							frame={editingFrame}
							style={editingNode.style}
							initialValue={editingNode.text}
							onCommit={(value) => {
								updateNode(editingNode.id, { text: value });
								setEditingNodeId(null);
							}}
							onCancel={() => setEditingNodeId(null)}
						/>
					)}
					{marqueeRect && (
						<div
							className="absolute border border-blue-500 bg-blue-500/10"
							style={{
								left: marqueeRect.x,
								top: marqueeRect.y,
								width: marqueeRect.width,
								height: marqueeRect.height,
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
