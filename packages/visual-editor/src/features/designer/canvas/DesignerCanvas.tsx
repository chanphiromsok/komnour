import type { CanvasKit, FontMgr, Surface } from "canvaskit-wasm";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlignmentGuides,
	computeAlignmentGuides,
} from "#/features/designer/overlays/AlignmentGuides";
import {
	type ResizeEdge,
	SelectionOverlay,
} from "#/features/designer/overlays/SelectionOverlay";
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
import { resolveRuns } from "@komnour/report/src/model/runs";
import { extractPageDocument } from "@komnour/report/src/model/tree";
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
/** Vertical gap between stacked page sheets, in document points. */
const PAGE_GAP = 48;
/** Smallest a node can be resized to, in document points. */
const MIN_SIZE = 8;
/**
 * Ceiling on devicePixelRatio × zoom used to size a page's canvas backing
 * buffer. Without a cap, a Retina display (dpr 2-3) zoomed to MAX_ZOOM (4)
 * would render at 8-12x the page's point size — for a multi-page document
 * that's several such surfaces at once, ballooning GPU/memory for a level of
 * sharpness well past what's visible on any real screen.
 */
const MAX_RENDER_SCALE = 4;
/** How long a zoom change must stay put before the canvas resizes to match it. */
const ZOOM_RESIZE_DEBOUNCE_MS = 150;

/**
 * Debounced copy of `value`, settling `delayMs` after the last change.
 * Used to defer the (comparatively expensive) canvas-resolution resize until
 * a zoom gesture actually stops, instead of recreating the CanvasKit surface
 * on every intermediate tick of a scroll-wheel zoom.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

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

interface RenderEngine {
	canvasKit: CanvasKit;
	fontMgr: FontMgr;
}

/**
 * Computes the resized frame for a drag of `edge` by (dx, dy) document points.
 * East/south edges grow width/height; west/north edges move x/y and grow the
 * opposite way while keeping the far edge pinned. Each moving edge snaps to the
 * grid and every side stays at least MIN_SIZE apart.
 */
function resizeFrame(
	original: Frame,
	edge: ResizeEdge,
	dx: number,
	dy: number,
): Partial<Frame> {
	const result: Partial<Frame> = {};
	const right = original.x + original.width;
	const bottom = original.y + original.height;

	if (edge.includes("e")) {
		result.width = Math.max(MIN_SIZE, snapToGrid(original.width + dx));
	}
	if (edge.includes("w")) {
		const newLeft = Math.min(snapToGrid(original.x + dx), right - MIN_SIZE);
		result.x = newLeft;
		result.width = right - newLeft;
	}
	if (edge.includes("s")) {
		result.height = Math.max(MIN_SIZE, snapToGrid(original.height + dy));
	}
	if (edge.includes("n")) {
		const newTop = Math.min(snapToGrid(original.y + dy), bottom - MIN_SIZE);
		result.y = newTop;
		result.height = bottom - newTop;
	}
	return result;
}

export function DesignerCanvas() {
	const viewportRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const activeSheetRef = useRef<HTMLDivElement | null>(null);
	// Every page sheet's DOM element, keyed by page id — used to hit-test which
	// page the pointer is over when dropping a cross-page drag. Lazily
	// initialized so the Map is only ever constructed once, not on every render.
	const sheetRefs = useRef<Map<NodeId, HTMLDivElement> | null>(null);
	if (sheetRefs.current === null) sheetRefs.current = new Map();
	const [engine, setEngine] = useState<RenderEngine | null>(null);
	const [error, setError] = useState<string | null>(null);

	const document = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const selection = useDesignerStore((s) => s.selection);
	const tool = useDesignerStore((s) => s.tool);
	const zoom = useDesignerStore((s) => s.zoom);
	const pan = useDesignerStore((s) => s.pan);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const setActivePageId = useDesignerStore((s) => s.setActivePageId);
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
	const moveNodeToPage = useDesignerStore((s) => s.moveNodeToPage);
	const copyNodes = useDesignerStore((s) => s.copyNodes);
	const pasteNodes = useDesignerStore((s) => s.pasteNodes);
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
			const canvasKit = await loadCanvasKit();
			if (cancelled) return;
			const fontMgr = await loadBrowserFontMgr(canvasKit);
			if (cancelled) return;
			setEngine({ canvasKit, fontMgr });
		}

		init().catch((err) =>
			setError(err instanceof Error ? err.message : String(err)),
		);

		return () => {
			cancelled = true;
		};
	}, []);

	// Bring the active page's sheet into view when it changes (e.g. a page
	// tab click or a freshly added page at the bottom of the stack).
	// biome-ignore lint/correctness/useExhaustiveDependencies: activePageId is the scroll trigger, not a render input
	useEffect(() => {
		activeSheetRef.current?.scrollIntoView({
			block: "nearest",
			behavior: "smooth",
		});
	}, [activePageId]);

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
			} else if (isMeta && key === "c") {
				if (selection.length > 0) {
					event.preventDefault();
					copyNodes(selection);
				}
			} else if (isMeta && key === "v") {
				event.preventDefault();
				pasteNodes();
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
		copyNodes,
		pasteNodes,
	]);

	/** Converts client coordinates to the ACTIVE page's local document points. */
	function toDocPoint(clientX: number, clientY: number) {
		const sheet = activeSheetRef.current;
		if (!sheet) return { x: 0, y: 0 };
		const rect = sheet.getBoundingClientRect();
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

	function handleSheetDoubleClick(event: React.MouseEvent) {
		if (!activePageId) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);
		const hitId = hitTest(document, activePageId, x, y);
		const node = hitId ? document.nodes[hitId] : undefined;
		if (node?.type === "text") {
			setSelection([node.id]);
			setEditingNodeId(node.id);
		}
	}

	function handleViewportPointerDown(event: React.PointerEvent) {
		if (editingNodeId) return;
		if (tool !== "pan" && event.button !== 1) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		interactionRef.current = {
			kind: "pan",
			startClientX: event.clientX,
			startClientY: event.clientY,
			originalPan: pan,
		};
	}

	function handleSheetPointerDown(pageId: NodeId, event: React.PointerEvent) {
		if (editingNodeId) return;
		// Let pan (tool or middle button) bubble up to the viewport handler.
		if (tool === "pan" || event.button === 1) return;
		event.stopPropagation();

		// First click on an inactive page just activates it.
		if (pageId !== activePageId) {
			setActivePageId(pageId);
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		const { x, y } = toDocPoint(event.clientX, event.clientY);

		const hitId = hitTest(document, pageId, x, y);
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

			const draggedNode = document.nodes[interaction.nodeId];
			const siblingIds = draggedNode
				? Object.values(document.nodes).reduce<NodeId[]>((ids, n) => {
						if (n.parentId === draggedNode.parentId && n.id !== interaction.nodeId)
							ids.push(n.id);
						return ids;
					}, [])
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
			const newFrame = resizeFrame(
				interaction.originalFrame,
				interaction.edge,
				dx,
				dy,
			);
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

	/** The page whose sheet is under the given client point, if any. */
	function pageUnderPointer(clientX: number, clientY: number): NodeId | null {
		for (const [pageId, el] of sheetRefs.current ?? []) {
			const rect = el.getBoundingClientRect();
			if (
				clientX >= rect.left &&
				clientX <= rect.right &&
				clientY >= rect.top &&
				clientY <= rect.bottom
			) {
				return pageId;
			}
		}
		return null;
	}

	function handlePointerUp(event: React.PointerEvent) {
		const interaction = interactionRef.current;
		if (!interaction || !activePageId) {
			interactionRef.current = null;
			return;
		}

		// Dropping a moved node over a different page reparents it there, so it
		// stays visible (instead of being clipped past the source page's edge).
		if (interaction.kind === "move") {
			const targetPageId = pageUnderPointer(event.clientX, event.clientY);
			if (targetPageId && targetPageId !== activePageId) {
				const targetEl = sheetRefs.current?.get(targetPageId);
				if (targetEl) {
					const rect = targetEl.getBoundingClientRect();
					const grabOffsetX = interaction.startX - interaction.originalFrame.x;
					const grabOffsetY = interaction.startY - interaction.originalFrame.y;
					const x = snapToGrid(
						(event.clientX - rect.left) / zoom - grabOffsetX,
					);
					const y = snapToGrid((event.clientY - rect.top) / zoom - grabOffsetY);
					moveNodeToPage(interaction.nodeId, targetPageId, { x, y });
					setActivePageId(targetPageId);
					setSelection([interaction.nodeId]);
					setDragPreview(null);
					setGuides({ vertical: [], horizontal: [] });
					interactionRef.current = null;
					return;
				}
			}
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
			className="relative flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-950"
			onPointerDown={handleViewportPointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			<div className="min-h-full min-w-full p-16">
				<div
					ref={stageRef}
					className="relative flex w-max flex-col items-start"
					style={{
						gap: PAGE_GAP,
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
						transformOrigin: "top left",
					}}
				>
					{error && (
						<p className="absolute top-0 left-0 text-red-600">{error}</p>
					)}
					{document.pages.map((pageId, index) => {
						const pageNode = document.nodes[pageId] as PageNode | undefined;
						if (!pageNode) return null;
						const pageSize = resolvePaperSize(pageNode.paper);
						const isActive = pageId === activePageId;
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: graphical editor surface (canvas + overlays), not a semantic content element
							<div
								key={pageId}
								ref={(el) => {
									if (el) sheetRefs.current?.set(pageId, el);
									else sheetRefs.current?.delete(pageId);
									if (isActive) activeSheetRef.current = el;
								}}
								className="relative"
								style={{ width: pageSize.width, height: pageSize.height }}
								onPointerDown={(event) =>
									handleSheetPointerDown(pageId, event)
								}
								onDoubleClick={isActive ? handleSheetDoubleClick : undefined}
							>
								<div className="pointer-events-none absolute -top-6 left-0 select-none text-neutral-500 text-xs dark:text-neutral-400">
									{pageNode.name || `Page ${index + 1}`}
								</div>
								<PageCanvas
									engine={engine}
									document={effectiveDocument}
									pageId={pageId}
									width={pageSize.width}
									height={pageSize.height}
									bindingData={bindingData}
									isActive={isActive}
									onError={setError}
									zoom={zoom}
								/>
								{isActive && (
									<>
										{verify.pngDataUrl && (
											// biome-ignore lint/a11y/useAltText: purely a diagnostic overlay, not content
											<img
												src={verify.pngDataUrl}
												width={pageSize.width}
												height={pageSize.height}
												className="pointer-events-none absolute top-0 left-0 opacity-50 mix-blend-difference"
											/>
										)}
										<SelectionOverlay
											document={effectiveDocument}
											selection={selection}
											zoom={zoom}
											onHandlePointerDown={handleHandlePointerDown}
										/>
										<AlignmentGuides guides={guides} pageSize={pageSize} />
										{editingNode &&
											editingNode.type === "text" &&
											editingFrame && (
												<TextEditOverlay
													frame={editingFrame}
													style={editingNode.style}
													initialRuns={resolveRuns(editingNode)}
													onCommit={({ text, runs }) => {
														updateNode(editingNode.id, { text, runs });
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
									</>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/**
 * One page sheet with its own CanvasKit surface. Rendering each page onto
 * its own canvas (via extractPageDocument) is what keeps pages from being
 * drawn on top of each other — renderDocument paints every page of the doc
 * it receives onto the same surface.
 */
function PageCanvas({
	engine,
	document,
	pageId,
	width,
	height,
	bindingData,
	isActive,
	onError,
	zoom,
}: {
	engine: RenderEngine | null;
	document: ReportDocument;
	pageId: NodeId;
	width: number;
	height: number;
	bindingData: Record<string, unknown> | null;
	isActive: boolean;
	onError: (message: string) => void;
	zoom: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const surfaceRef = useRef<Surface | null>(null);
	const adapterRef = useRef<CanvasAdapter | null>(null);
	// A monotonically increasing counter, not a boolean: when settledZoom (or
	// engine/width/height) changes, the surface-creation effect's cleanup
	// fires and then its body re-runs in the same batch — a boolean toggled
	// false-then-true nets out to "unchanged" from React's dependency
	// comparison, so the render effect below would never re-fire against the
	// newly created surface (this is exactly what made zooming show a blank
	// page). A counter can't cancel itself out this way, since it never
	// revisits the same value.
	const [surfaceGeneration, setSurfaceGeneration] = useState(0);

	// The stage (all page sheets) is scaled on-screen via a CSS transform, not
	// by re-rendering — so a canvas sized only for devicePixelRatio stays a
	// fixed-resolution bitmap that the browser stretches to fit whatever the
	// current zoom displays it at. Past 100% zoom that's a real, measured
	// upscale (e.g. 0.33x effective resolution at 300% zoom) that looks
	// exactly like a blurry raster image, because at that point it is one.
	// Debounced so a scroll-wheel zoom gesture doesn't recreate the surface
	// on every intermediate tick — the canvas stays at its previous
	// resolution (softening slightly) while actively zooming, then snaps
	// sharp once the gesture settles, same trade-off design tools typically
	// make.
	const settledZoom = useDebouncedValue(zoom, ZOOM_RESIZE_DEBOUNCE_MS);

	// Kept fresh on every render (not an effect dependency) so the resize
	// effect below can render "whatever the document currently is" without
	// re-running itself whenever content changes — that's the general render
	// effect's job, on the existing surface, with no resize involved.
	const latestRenderInputsRef = useRef({ document, pageId, bindingData });
	latestRenderInputsRef.current = { document, pageId, bindingData };

	useEffect(() => {
		const canvasEl = canvasRef.current;
		if (!canvasEl || !engine) return;
		let cancelled = false;
		let ownSurface: Surface | null = null;

		async function buildAndSwap() {
			const dpr = window.devicePixelRatio || 1;
			const scale = Math.min(dpr * settledZoom, MAX_RENDER_SCALE);

			// Resizing the *visible* canvas's width/height clears it to blank
			// synchronously (an HTML canvas spec requirement), but the redraw
			// (renderDocument) is async — image decode, etc. — so doing that
			// resize before the new frame is ready left a real window where the
			// visible canvas sat blank, seen as a flicker on every zoom-driven
			// resize. Rendering the frame on a hidden canvas first and blitting
			// the finished result onto the visible one in one uninterrupted
			// synchronous step means the visible canvas only ever goes directly
			// from "old frame" to "new, complete frame" — never through blank.
			const offscreenEl = window.document.createElement("canvas");
			offscreenEl.width = width * scale;
			offscreenEl.height = height * scale;
			const offscreenSurface = engine.canvasKit.MakeCanvasSurface(offscreenEl);
			if (!offscreenSurface) {
				onError("Failed to create CanvasKit surface");
				return;
			}
			const offscreenAdapter = new CanvasAdapter(
				engine.canvasKit,
				offscreenSurface,
				engine.fontMgr,
				scale,
			);
			const { document: currentDocument, pageId: currentPageId, bindingData: currentBindingData } =
				latestRenderInputsRef.current;
			const pageDocument = extractPageDocument(currentDocument, currentPageId);
			try {
				await renderDocument(
					pageDocument,
					offscreenAdapter,
					currentBindingData ?? undefined,
					{ resolveAsset: resolveAssetBrowser, shouldAbort: () => cancelled },
				);
			} catch (err) {
				offscreenSurface.delete();
				if (!cancelled) onError(err instanceof Error ? err.message : String(err));
				return;
			}
			if (cancelled) {
				offscreenSurface.delete();
				return;
			}

			const snapshot = offscreenSurface.makeImageSnapshot();
			canvasEl.width = width * scale;
			canvasEl.height = height * scale;
			const surface = engine.canvasKit.MakeCanvasSurface(canvasEl);
			if (!surface) {
				snapshot.delete();
				offscreenSurface.delete();
				onError("Failed to create CanvasKit surface");
				return;
			}
			const rect = engine.canvasKit.XYWHRect(0, 0, width * scale, height * scale);
			const paint = new engine.canvasKit.Paint();
			surface.getCanvas().drawImageRect(snapshot, rect, rect, paint, true);
			surface.flush();
			paint.delete();
			snapshot.delete();
			offscreenSurface.delete();

			ownSurface = surface;
			surfaceRef.current = surface;
			adapterRef.current = new CanvasAdapter(
				engine.canvasKit,
				surface,
				engine.fontMgr,
				scale,
			);
			setSurfaceGeneration((generation) => generation + 1);
		}

		buildAndSwap().catch((err) => {
			if (!cancelled) onError(err instanceof Error ? err.message : String(err));
		});

		return () => {
			cancelled = true;
			if (ownSurface) {
				ownSurface.delete();
				if (surfaceRef.current === ownSurface) surfaceRef.current = null;
				adapterRef.current = null;
			}
		};
	}, [engine, width, height, onError, settledZoom]);

	useEffect(() => {
		if (surfaceGeneration === 0 || !adapterRef.current) return;
		let cancelled = false;
		const pageDocument = extractPageDocument(document, pageId);
		renderDocument(pageDocument, adapterRef.current, bindingData ?? undefined, {
			resolveAsset: resolveAssetBrowser,
			shouldAbort: () => cancelled,
		}).catch((err) => {
			if (cancelled) return;
			onError(err instanceof Error ? err.message : String(err));
		});
		return () => {
			cancelled = true;
		};
	}, [surfaceGeneration, document, pageId, bindingData, onError]);

	return (
		<canvas
			ref={canvasRef}
			width={width}
			height={height}
			style={{ width, height }}
			className={`bg-white shadow-lg ${
				isActive
					? "ring-2 ring-blue-400"
					: "ring-1 ring-neutral-300 dark:ring-neutral-700"
			}`}
		/>
	);
}
