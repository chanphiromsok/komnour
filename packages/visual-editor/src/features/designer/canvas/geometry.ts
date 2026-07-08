import type { NodeId, ReportDocument } from "@komnour/report/src/model/types";

export interface AbsoluteFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Resolves a node's frame in page-local absolute coordinates by summing
 * every ancestor's x/y. Ignores rotation (a known simplification — rotated
 * nodes hit-test/select using their unrotated bounding frame for now).
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
		const frame = getAbsoluteFrame(doc, ids[i]);
		if (node?.type === "line") {
			const dist = distanceToSegment(
				x,
				y,
				frame.x + node.x1,
				frame.y + node.y1,
				frame.x + node.x2,
				frame.y + node.y2,
			);
			if (dist <= LINE_HIT_TOLERANCE) return ids[i];
			continue;
		}
		if (pointInFrame(x, y, frame)) return ids[i];
	}
	return null;
}
