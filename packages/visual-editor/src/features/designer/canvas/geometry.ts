import type { NodeId, ReportDocument } from "@komnour/report/src/model/types";

export interface AbsoluteFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Resolves a node's frame in page-local absolute coordinates by summing
 * every ancestor's x/y. The returned frame is the node's UNROTATED box;
 * callers that need rotation-aware behavior (hitTest below, the selection
 * overlay) apply the node's own frame.rotation around this box's center,
 * matching the renderer's pivot. Ancestor rotation is still ignored — only
 * pages parent nodes today and pages never rotate.
 */
export function getAbsoluteFrame(
	doc: ReportDocument,
	nodeId: NodeId,
): AbsoluteFrame {
	const node = doc.nodes[nodeId];
	let x = node.frame.x;
	let y = node.frame.y;
	let parentId = node.parentId;
	while (parentId) {
		const parent = doc.nodes[parentId];
		if (!parent) break;
		x += parent.frame.x;
		y += parent.frame.y;
		parentId = parent.parentId;
	}
	return { x, y, width: node.frame.width, height: node.frame.height };
}

/** All descendant node ids of `rootId` (not including `rootId` itself), depth-first. */
export function flattenDescendantIds(
	doc: ReportDocument,
	rootId: NodeId,
): NodeId[] {
	const ids: NodeId[] = [];
	const root = doc.nodes[rootId];
	if (!root) return ids;
	function visit(id: NodeId) {
		const node = doc.nodes[id];
		if (!node) return;
		ids.push(id);
		for (const childId of node.children) visit(childId);
	}
	for (const childId of root.children) visit(childId);
	return ids;
}

export function pointInFrame(
	x: number,
	y: number,
	frame: AbsoluteFrame,
): boolean {
	return (
		x >= frame.x &&
		x <= frame.x + frame.width &&
		y >= frame.y &&
		y <= frame.y + frame.height
	);
}

export function rectsIntersect(a: AbsoluteFrame, b: AbsoluteFrame): boolean {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

/** Distance from (px, py) to the segment (x1, y1)-(x2, y2). */
function distanceToSegment(
	px: number,
	py: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
	const t = Math.max(
		0,
		Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq),
	);
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Click/tap slop (in document points) for line nodes. A line's frame is a
 * bounding box that's routinely 0 wide or 0 tall (a horizontal/vertical
 * line), so plain rectangle containment would require the pointer to land
 * on an exact pixel row/column to ever hit it — this gives it a real,
 * grabbable width instead.
 */
const LINE_HIT_TOLERANCE = 5;

/**
 * Rotates (x, y) by -degrees around the frame's center — mapping a
 * page-space point into the node's unrotated local space, matching the
 * center-pivot rotation the renderer applies when drawing. Testing the
 * un-rotated point against the un-rotated frame is exactly equivalent to
 * testing the raw point against the rotated shape.
 */
function unrotatePoint(
	x: number,
	y: number,
	frame: AbsoluteFrame,
	degrees: number,
): { x: number; y: number } {
	if (!degrees) return { x, y };
	const cx = frame.x + frame.width / 2;
	const cy = frame.y + frame.height / 2;
	const rad = (-degrees * Math.PI) / 180;
	const dx = x - cx;
	const dy = y - cy;
	return {
		x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
		y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
	};
}

/** Topmost (last-drawn) selectable node under the active page whose frame contains the point, if any. */
export function hitTest(
	doc: ReportDocument,
	pageId: NodeId,
	x: number,
	y: number,
): NodeId | null {
	const ids = flattenDescendantIds(doc, pageId);
	for (let i = ids.length - 1; i >= 0; i--) {
		const node = doc.nodes[ids[i]];
		if (!node) continue;
		const frame = getAbsoluteFrame(doc, ids[i]);
		const p = unrotatePoint(x, y, frame, node.frame.rotation);
		if (node.type === "line") {
			const dist = distanceToSegment(
				p.x,
				p.y,
				frame.x + node.x1,
				frame.y + node.y1,
				frame.x + node.x2,
				frame.y + node.y2,
			);
			if (dist <= LINE_HIT_TOLERANCE) return ids[i];
			continue;
		}
		if (pointInFrame(p.x, p.y, frame)) return ids[i];
	}
	return null;
}
