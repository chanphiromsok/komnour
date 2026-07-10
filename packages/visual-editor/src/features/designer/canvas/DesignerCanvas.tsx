import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlignmentGuides,
	computeAlignmentSnap,
} from "#/features/designer/overlays/AlignmentGuides";
import {
	type ResizeEdge,
	SelectionOverlay,
} from "#/features/designer/overlays/SelectionOverlay";
import {
	createCheckboxNode,
	createCircleNode,
	createImageNode,
	createLineNode,
	createRectNode,
	createTextNode,
} from "#/features/designer/store/nodeFactories";
import {
	imageFileToAsset,
	isImageFile,
} from "#/features/designer/assets/imageFiles";
import {
	GRID_SIZE,
	snapToGrid,
	useDesignerStore,
} from "#/features/designer/store/reportStore";
import { resolvePaperSize } from "@komnour/report/src/layout/paper";
import { resolveRuns } from "@komnour/report/src/model/runs";
import type {
	Frame,
	NodeId,
	PageNode,
	ReportDocument,
} from "@komnour/report/src/model/types";
import { buildApiUrl } from "#/lib/apiBase";
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
/** Wheel zoom sensitivity; roughly 10% per common mouse-wheel notch. */
const WHEEL_ZOOM_SPEED = 0.001;
const DROPPED_IMAGE_MAX_SIZE = 240;

/**
 * Debounced copy of `value`, settling `delayMs` after the last change.
 * Used to defer the comparatively expensive preview re-render until
 * a zoom gesture actually stops, instead of refetching server PNGs
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
		kind: "rotate";
		nodeId: NodeId;
		centerX: number;
		centerY: number;
		startAngle: number;
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

/**
 * Computes the resized frame for a drag of `edge` by (dx, dy) document points,
 * where (dx, dy) must already be in the node's LOCAL (unrotated) axes — the
 * caller rotates the pointer delta by -rotation first, so dragging the "e"
 * handle of a rotated rectangle stretches it along its own rotated edge
 * instead of the screen's x axis. East/south edges grow width/height; west/
 * north edges move x/y and grow the opposite way while keeping the far edge
 * pinned. Each moving edge snaps to the grid and every side stays at least
 * `minSize` apart — MIN_SIZE for shapes, but 0 for lines, whose bounding box
 * is legitimately zero-thick (a horizontal line dragged vertical and back
 * must be able to return to height 0, not get stuck at MIN_SIZE).
 */
function resizeFrame(
	original: Frame,
	edge: ResizeEdge,
	dx: number,
	dy: number,
	minSize: number = MIN_SIZE,
): Partial<Frame> {
	const result: Partial<Frame> = {};
	const right = original.x + original.width;
	const bottom = original.y + original.height;

	if (edge.includes("e")) {
		result.width = Math.max(minSize, snapToGrid(original.width + dx));
	}
	if (edge.includes("w")) {
		const newLeft = Math.min(snapToGrid(original.x + dx), right - minSize);
		result.x = newLeft;
		result.width = right - newLeft;
	}
	if (edge.includes("s")) {
		result.height = Math.max(minSize, snapToGrid(original.height + dy));
	}
	if (edge.includes("n")) {
		const newTop = Math.min(snapToGrid(original.y + dy), bottom - minSize);
		result.y = newTop;
		result.height = bottom - newTop;
	}
	return result;
}

/** Rotates a pointer delta by -degrees, mapping a page-space drag onto a rotated node's own axes. */
function rotateDelta(
	dx: number,
	dy: number,
	degrees: number,
): { dx: number; dy: number } {
	if (!degrees) return { dx, dy };
	const rad = (-degrees * Math.PI) / 180;
	return {
		dx: dx * Math.cos(rad) - dy * Math.sin(rad),
		dy: dx * Math.sin(rad) + dy * Math.cos(rad),
	};
}

function angleBetween(centerX: number, centerY: number, x: number, y: number) {
	return (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
}

function isTextInputTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function wheelDeltaInPixels(event: WheelEvent): { x: number; y: number } {
	const unit =
		event.deltaMode === WheelEvent.DOM_DELTA_LINE
			? 16
			: event.deltaMode === WheelEvent.DOM_DELTA_PAGE
				? window.innerHeight
				: 1;
	return { x: event.deltaX * unit, y: event.deltaY * unit };
}

function firstImageFile(files: FileList): File | null {
	return Array.from(files).find(isImageFile) ?? null;
}

function dragContainsImage(event: React.DragEvent): boolean {
	return Array.from(event.dataTransfer.items).some(
		(item) => item.kind === "file" && item.type.startsWith("image/"),
	);
}

function fitDroppedImageFrame({
	naturalWidth,
	naturalHeight,
	pageWidth,
	pageHeight,
	x,
	y,
}: {
	naturalWidth: number;
	naturalHeight: number;
	pageWidth: number;
	pageHeight: number;
	x: number;
	y: number;
}): Frame {
	const fallbackWidth = 160;
	const fallbackHeight = 120;
	const sourceWidth = naturalWidth > 0 ? naturalWidth : fallbackWidth;
	const sourceHeight = naturalHeight > 0 ? naturalHeight : fallbackHeight;
	const scale = Math.min(
		1,
		DROPPED_IMAGE_MAX_SIZE / sourceWidth,
		DROPPED_IMAGE_MAX_SIZE / sourceHeight,
	);
	const width = Math.max(MIN_SIZE, Math.round(sourceWidth * scale));
	const height = Math.max(MIN_SIZE, Math.round(sourceHeight * scale));
	const maxX = Math.max(0, pageWidth - width);
	const maxY = Math.max(0, pageHeight - height);
	return {
		x: snapToGrid(Math.min(Math.max(0, x - width / 2), maxX)),
		y: snapToGrid(Math.min(Math.max(0, y - height / 2), maxY)),
		width,
		height,
		rotation: 0,
	};
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
	const [error, setError] = useState<string | null>(null);

	const document = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const selection = useDesignerStore((s) => s.selection);
	const tool = useDesignerStore((s) => s.tool);
	const zoom = useDesignerStore((s) => s.zoom);
	const pan = useDesignerStore((s) => s.pan);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const boundFieldIndicatorColor = useDesignerStore(
		(s) => s.boundFieldIndicatorColor,
	);
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
	const setImageAsset = useDesignerStore((s) => s.setImageAsset);
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

	// Canvas-preview-only aid: a checkbox whose checked state comes from
	// checkedBinding gets its tick redrawn in boundFieldIndicatorColor here,
	// so it's visually obvious which fields are data-driven while building a
	// template. This never touches the stored document, so PDF/PNG export
	// (which renders the real document, not this preview copy) always uses
	// the node's own designed checkColor.
	const previewDocument = useMemo<ReportDocument>(() => {
		let changed = false;
		const nodes: ReportDocument["nodes"] = { ...document.nodes };
		for (const [id, node] of Object.entries(document.nodes)) {
			if (
				node.type === "checkbox" &&
				node.checkedBinding &&
				node.checkColor !== boundFieldIndicatorColor
			) {
				nodes[id] = { ...node, checkColor: boundFieldIndicatorColor };
				changed = true;
			}
		}
		return changed ? { ...document, nodes } : document;
	}, [document, boundFieldIndicatorColor]);

	const effectiveDocument = useMemo<ReportDocument>(() => {
		if (!dragPreview) return previewDocument;
		const node = previewDocument.nodes[dragPreview.nodeId];
		if (!node) return previewDocument;
		return {
			...previewDocument,
			nodes: {
				...previewDocument.nodes,
				[dragPreview.nodeId]: {
					...node,
					frame: { ...node.frame, ...dragPreview.frame },
				},
			},
		};
	}, [previewDocument, dragPreview]);

	const editingNode = editingNodeId ? document.nodes[editingNodeId] : undefined;
	const editingFrame = editingNodeId
		? getAbsoluteFrame(document, editingNodeId)
		: undefined;

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
			if (isTextInputTarget(event.target)) return;
			const stageEl = stageRef.current;
			if (!stageEl) return;
			event.preventDefault();

			const { zoom: zoomOld, pan: panOld } = useDesignerStore.getState();
			const delta = wheelDeltaInPixels(event);

			if (!(event.ctrlKey || event.metaKey)) {
				setPan({
					x: panOld.x - (event.shiftKey ? delta.y : delta.x),
					y: panOld.y - (event.shiftKey ? 0 : delta.y),
				});
				return;
			}

			const rect = stageEl.getBoundingClientRect();
			const docXUnderCursor = (event.clientX - rect.left) / zoomOld;
			const docYUnderCursor = (event.clientY - rect.top) / zoomOld;

			const zoomFactor = Math.exp(-delta.y * WHEEL_ZOOM_SPEED);
			const zoomNew = Math.min(
				MAX_ZOOM,
				Math.max(MIN_ZOOM, zoomOld * zoomFactor),
			);
			if (zoomNew === zoomOld) return;
			const stageBaseX = rect.left - panOld.x;
			const stageBaseY = rect.top - panOld.y;

			setZoom(zoomNew);
			setPan({
				x: event.clientX - stageBaseX - docXUnderCursor * zoomNew,
				y: event.clientY - stageBaseY - docYUnderCursor * zoomNew,
			});
		}

		viewportEl.addEventListener("wheel", onWheel, { passive: false });
		return () => viewportEl.removeEventListener("wheel", onWheel);
	}, [setZoom, setPan]);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (isTextInputTarget(event.target)) return;
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
			} else if (!isMeta && !event.altKey && event.key === " ") {
				event.preventDefault();
				if (!event.repeat && !toolBeforeSpaceRef.current) {
					toolBeforeSpaceRef.current = tool;
					setTool("pan");
				}
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
				else if (key === "c")
					addNode(createCheckboxNode(activePageId), activePageId);
			}
		}

		function onKeyUp(event: KeyboardEvent) {
			if (isTextInputTarget(event.target)) return;
			if (event.key === " ") {
				event.preventDefault();
			}
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

	function handleRotatePointerDown(nodeId: NodeId, event: React.PointerEvent) {
		event.stopPropagation();
		event.preventDefault();
		const node = document.nodes[nodeId];
		if (!node) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);
		const frame = getAbsoluteFrame(document, nodeId);
		const centerX = frame.x + frame.width / 2;
		const centerY = frame.y + frame.height / 2;
		interactionRef.current = {
			kind: "rotate",
			nodeId,
			centerX,
			centerY,
			startAngle: angleBetween(centerX, centerY, x, y),
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

	function handleSheetDragOver(event: React.DragEvent<HTMLDivElement>) {
		if (!dragContainsImage(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}

	async function handleSheetDrop(
		pageId: NodeId,
		event: React.DragEvent<HTMLDivElement>,
	) {
		const file = firstImageFile(event.dataTransfer.files);
		if (!file) return;
		event.preventDefault();
		event.stopPropagation();

		const pageNode = document.nodes[pageId];
		if (!pageNode || pageNode.type !== "page") return;
		const sheetRect = event.currentTarget.getBoundingClientRect();
		const point = {
			x: (event.clientX - sheetRect.left) / zoom,
			y: (event.clientY - sheetRect.top) / zoom,
		};
		const pageSize = resolvePaperSize(pageNode.paper);

		try {
			setError(null);
			const imageAsset = await imageFileToAsset(file);
			const imageNode = createImageNode(pageId);
			imageNode.name = file.name.replace(/\.[^.]+$/, "") || "Image";
			imageNode.frame = fitDroppedImageFrame({
				naturalWidth: imageAsset.width,
				naturalHeight: imageAsset.height,
				pageWidth: pageSize.width,
				pageHeight: pageSize.height,
				x: point.x,
				y: point.y,
			});
			if (pageId !== activePageId) setActivePageId(pageId);
			addNode(imageNode, pageId);
			setImageAsset(imageNode.id, imageAsset.url, {
				width: imageAsset.width,
				height: imageAsset.height,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}

	function handlePointerMove(event: React.PointerEvent) {
		const interaction = interactionRef.current;
		if (!interaction || !activePageId) return;
		const { x, y } = toDocPoint(event.clientX, event.clientY);

		if (interaction.kind === "move") {
			const dx = x - interaction.startX;
			const dy = y - interaction.startY;
			// Un-snapped pointer-driven position, in the parent's local space.
			const rawX = interaction.originalFrame.x + dx;
			const rawY = interaction.originalFrame.y + dy;

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
			// Alignment is computed in absolute coordinates and converted back
			// through the parent's offset, so nothing here assumes frame.x/y are
			// absolute — nested groups/frames will keep snapping correctly.
			const parentOffset =
				draggedNode?.parentId != null
					? getAbsoluteFrame(document, draggedNode.parentId)
					: { x: 0, y: 0 };
			// Alt (Option on macOS) temporarily disables smart alignment;
			// grid snapping below still applies as usual.
			const snap = event.altKey
				? null
				: computeAlignmentSnap(
						siblingFrames,
						{
							x: rawX + parentOffset.x,
							y: rawY + parentOffset.y,
							width: interaction.originalFrame.width,
							height: interaction.originalFrame.height,
						},
						zoom,
					);
			// Smart alignment wins over the grid, per axis: an axis it claims
			// takes the exact aligned position; an unclaimed axis falls back to
			// plain grid snapping.
			const newFrame = {
				x: snap?.snappedX ? snap.frame.x - parentOffset.x : snapToGrid(rawX),
				y: snap?.snappedY ? snap.frame.y - parentOffset.y : snapToGrid(rawY),
			};
			setDragPreview({ nodeId: interaction.nodeId, frame: newFrame });
			setGuides(snap?.guides ?? { vertical: [], horizontal: [] });
		} else if (interaction.kind === "resize") {
			const node = document.nodes[interaction.nodeId];
			// Map the page-space drag onto the node's own (possibly rotated) axes
			// so handles stretch along the shape's edges, not the screen's.
			const local = rotateDelta(
				x - interaction.startX,
				y - interaction.startY,
				interaction.originalFrame.rotation,
			);
			const newFrame = resizeFrame(
				interaction.originalFrame,
				interaction.edge,
				local.dx,
				local.dy,
				node?.type === "line" ? 0 : MIN_SIZE,
			);
			setDragPreview({ nodeId: interaction.nodeId, frame: newFrame });
		} else if (interaction.kind === "rotate") {
			const currentAngle = angleBetween(
				interaction.centerX,
				interaction.centerY,
				x,
				y,
			);
			const rawRotation =
				interaction.originalFrame.rotation +
				currentAngle -
				interaction.startAngle;
			const rotation = event.shiftKey
				? Math.round(rawRotation / 15) * 15
				: Math.round(rawRotation);
			setDragPreview({ nodeId: interaction.nodeId, frame: { rotation } });
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

		if (
			interaction.kind === "move" ||
			interaction.kind === "resize" ||
			interaction.kind === "rotate"
		) {
			if (dragPreview) {
				if (
					interaction.kind !== "rotate" &&
					("x" in dragPreview.frame || "y" in dragPreview.frame)
				) {
					updateNodeFrame(interaction.nodeId, {
						x: dragPreview.frame.x ?? interaction.originalFrame.x,
						y: dragPreview.frame.y ?? interaction.originalFrame.y,
					});
				}
				if (
					interaction.kind !== "rotate" &&
					("width" in dragPreview.frame || "height" in dragPreview.frame)
				) {
					updateNodeFrame(interaction.nodeId, {
						width: dragPreview.frame.width ?? interaction.originalFrame.width,
						height:
							dragPreview.frame.height ?? interaction.originalFrame.height,
					});
				}
				if (
					interaction.kind === "rotate" &&
					"rotation" in dragPreview.frame
				) {
					updateNode(interaction.nodeId, {
						frame: {
							...interaction.originalFrame,
							rotation:
								dragPreview.frame.rotation ??
								interaction.originalFrame.rotation,
						},
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
			className="relative flex-1 overflow-auto bg-[#e9eaec] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.08)_1px,transparent_0)] [background-size:24px_24px] dark:bg-neutral-950 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.08)_1px,transparent_0)]"
			onPointerDown={handleViewportPointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
		>
			<div className="min-h-full min-w-full p-12">
				<div
					ref={stageRef}
					className="relative flex w-max flex-col items-start"
					style={{
						gap: PAGE_GAP,
						transform: `matrix(${zoom}, 0, 0, ${zoom}, ${pan.x}, ${pan.y})`,
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
								onDragOver={handleSheetDragOver}
								onDrop={(event) => handleSheetDrop(pageId, event)}
								onDoubleClick={isActive ? handleSheetDoubleClick : undefined}
							>
								<div className="pointer-events-none absolute -top-6 left-0 select-none text-neutral-500 text-xs dark:text-neutral-400">
									{pageNode.name || `Page ${index + 1}`}
								</div>
								<PageCanvas
									document={previewDocument}
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
										<DragPreviewOverlay
											document={effectiveDocument}
											pageId={pageId}
											nodeId={dragPreview?.nodeId ?? null}
										/>
										<SelectionOverlay
											document={effectiveDocument}
											selection={selection}
											zoom={zoom}
											editingNodeId={editingNodeId}
											onHandlePointerDown={handleHandlePointerDown}
											onRotatePointerDown={handleRotatePointerDown}
										/>
										<AlignmentGuides guides={guides} pageSize={pageSize} />
										{editingNode &&
											editingNode.type === "text" &&
											editingFrame && (
												<TextEditOverlay
													frame={editingFrame}
													rotation={editingNode.frame.rotation}
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

function DragPreviewOverlay({
	document,
	pageId,
	nodeId,
}: {
	document: ReportDocument;
	pageId: NodeId;
	nodeId: NodeId | null;
}) {
	if (!nodeId) return null;
	const node = document.nodes[nodeId];
	if (!node || node.type !== "image" || node.parentId !== pageId) return null;
	const asset = document.assets[node.assetId];
	if (!asset?.url) return null;
	const frame = getAbsoluteFrame(document, nodeId);
	return (
		<img
			src={asset.url}
			alt=""
			draggable={false}
			className="pointer-events-none absolute select-none opacity-90"
			style={{
				left: frame.x,
				top: frame.y,
				width: frame.width,
				height: frame.height,
				objectFit: node.fit,
				transform: node.frame.rotation
					? `rotate(${node.frame.rotation}deg)`
					: undefined,
				transformOrigin: "center",
			}}
		/>
	);
}

/**
 * One page sheet backed by a skia-canvas PNG generated by the server.
 * The last complete preview stays visible until a newer render finishes,
 * so zooms and document edits do not flash a blank page.
 */
function PageCanvas({
	document,
	pageId,
	width,
	height,
	bindingData,
	isActive,
	onError,
	zoom,
}: {
	document: ReportDocument;
	pageId: NodeId;
	width: number;
	height: number;
	bindingData: Record<string, unknown> | null;
	isActive: boolean;
	onError: (message: string) => void;
	zoom: number;
}) {
	const previewUrlRef = useRef<string | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const settledZoom = useDebouncedValue(zoom, ZOOM_RESIZE_DEBOUNCE_MS);

	useEffect(() => {
		return () => {
			if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
		};
	}, []);

	const loadOnceRef = useRef(false);
	useEffect(() => {
		const pageIndex = document.pages.indexOf(pageId);
		if (pageIndex === -1) return;
		let cancelled = false;
		const controller = new AbortController();

		async function renderPreview() {
			const dpr = window.devicePixelRatio || 1;
			const scale = Math.min(dpr * settledZoom, MAX_RENDER_SCALE);
			const response = await fetch(buildApiUrl("/report/export/png"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					document,
					pageIndex,
					data: bindingData ?? undefined,
					scale,
				}),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(`Preview render failed: ${response.status}`);
			}
			const blob = await response.blob();
			if (cancelled) return;

			const nextUrl = URL.createObjectURL(blob);
			if (cancelled) {
				URL.revokeObjectURL(nextUrl);
				return;
			}
			setPreviewUrl((previousUrl) => {
				if (previousUrl) URL.revokeObjectURL(previousUrl);
				previewUrlRef.current = nextUrl;
				return nextUrl;
			});
		}

		if (!isActive && loadOnceRef.current) {
			console.log("SKIP renderPreview")
			return
		}
		renderPreview().catch((err) => {
			if (err instanceof DOMException && err.name === "AbortError") return;
			if (!cancelled) onError(err instanceof Error ? err.message : String(err));
			loadOnceRef.current = false;
		}).finally(()=>{
			loadOnceRef.current = true
		})

		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [document, pageId, bindingData, onError, settledZoom, isActive]);

	return (
		<div
			style={{ width, height }}
			className={`overflow-hidden bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] ${isActive
				? "ring-2 ring-blue-500"
				: "ring-1 ring-black/10 dark:ring-white/10"
				}`}
		>
			{previewUrl ? (
				<img
					src={previewUrl}
					width={width}
					height={height}
					alt=""
					draggable={false}
					className="block h-full w-full select-none"
				/>
			) : null}
		</div>
	);
}
