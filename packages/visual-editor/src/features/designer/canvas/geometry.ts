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

/** Topmost (last-drawn) selectable node under the active page whose frame contains the point, if any. */
export function hitTest(
	doc: ReportDocument,
	pageId: NodeId,
	x: number,
	y: number,
): NodeId | null {
	const ids = flattenDescendantIds(doc, pageId);
	for (let i = ids.length - 1; i >= 0; i--) {
		const frame = getAbsoluteFrame(doc, ids[i]);
		if (pointInFrame(x, y, frame)) return ids[i];
	}
	return null;
}
