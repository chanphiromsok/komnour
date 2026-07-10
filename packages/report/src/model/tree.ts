import type { NodeId, ReportDocument, ReportNode } from "./types";

export function createEmptyDocument(): ReportDocument {
	return { version: 1, pages: [], nodes: {}, assets: {}, fonts: {} };
}

export function getNode(doc: ReportDocument, id: NodeId): ReportNode {
	const node = doc.nodes[id];
	if (!node) throw new Error(`Node not found: ${id}`);
	return node;
}

export function getChildren(doc: ReportDocument, id: NodeId): ReportNode[] {
	return getNode(doc, id).children.map((childId) => getNode(doc, childId));
}

export function walkTree(
	doc: ReportDocument,
	id: NodeId,
	visit: (node: ReportNode) => void,
): void {
	const node = getNode(doc, id);
	visit(node);
	for (const childId of node.children) walkTree(doc, childId, visit);
}

export function addNode(
	doc: ReportDocument,
	node: ReportNode,
	parentId: NodeId | null,
): ReportDocument {
	const nodes = { ...doc.nodes, [node.id]: { ...node, parentId } };
	if (parentId) {
		const parent = nodes[parentId];
		if (!parent) throw new Error(`Parent not found: ${parentId}`);
		nodes[parentId] = { ...parent, children: [...parent.children, node.id] };
	}
	const pages = node.type === "page" ? [...doc.pages, node.id] : doc.pages;
	return { ...doc, nodes, pages };
}

export function removeNode(doc: ReportDocument, id: NodeId): ReportDocument {
	const node = getNode(doc, id);
	const idsToRemove = new Set<NodeId>();
	walkTree(doc, id, (n) => idsToRemove.add(n.id));

	const nodes = { ...doc.nodes };
	for (const removedId of idsToRemove) delete nodes[removedId];

	if (node.parentId) {
		const parent = nodes[node.parentId];
		if (parent) {
			nodes[node.parentId] = {
				...parent,
				children: parent.children.filter((childId) => childId !== id),
			};
		}
	}

	const pages = doc.pages.filter((pageId) => !idsToRemove.has(pageId));
	return { ...doc, nodes, pages };
}

/** A new document containing only `pageId` and its descendants (used to render/export a single page in isolation, e.g. for PNG export). Assets/fonts are kept as-is since they're referenced by id and harmless to carry along unpruned. */
export function extractPageDocument(
	doc: ReportDocument,
	pageId: NodeId,
): ReportDocument {
	const nodes: ReportDocument["nodes"] = {};
	walkTree(doc, pageId, (node) => {
		nodes[node.id] = node;
	});
	return { ...doc, pages: [pageId], nodes };
}

export function duplicateNode(
	doc: ReportDocument,
	id: NodeId,
	makeId: () => NodeId,
): ReportDocument {
	const original = getNode(doc, id);
	const idMap = new Map<NodeId, NodeId>();
	walkTree(doc, id, (n) => idMap.set(n.id, makeId()));

	let next = doc;
	const cloneSubtree = (sourceId: NodeId, newParentId: NodeId | null) => {
		const source = getNode(doc, sourceId);
		const newId = idMap.get(sourceId);
		if (!newId) throw new Error(`Missing id mapping for ${sourceId}`);
		// A deep clone, not a shallow `{...source}` spread: every nested
		// object a node carries (frame, fill, stroke, style, labelStyle, ...)
		// is a JS reference, and a shallow spread only copies the top-level
		// property slots — the clone and the original would still point at
		// the exact same frame object underneath. Any later IN-PLACE
		// mutation of one (e.g. updateNodeFrame's `Object.assign(node.frame,
		// patch)`, or duplicateNodes offsetting the clone below the
		// original) would silently move both, which is exactly what made
		// duplicating a node look like it was moving the original.
		//
		// JSON round-trip rather than the native structuredClone: `source`
		// is read off an Immer draft mid-producer here (this runs inside
		// reportStore's commit()), and structuredClone throws a
		// DataCloneError on Immer's Proxy-wrapped draft objects — plain
		// JSON serialization unwraps them correctly, and every ReportNode
		// field is JSON-safe data (no functions/Dates/etc.) anyway.
		const clone: ReportNode = {
			...(JSON.parse(JSON.stringify(source)) as ReportNode),
			id: newId,
			parentId: newParentId,
			children: [],
		};
		next = addNode(next, clone, newParentId);
		for (const childId of source.children) cloneSubtree(childId, newId);
	};
	cloneSubtree(id, original.parentId);
	return next;
}
