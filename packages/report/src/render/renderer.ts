import { resolveBindings } from "../data/bind";
import { resolvePaperSize } from "../layout/paper";
import type {
	Asset,
	PageNode,
	ReportDocument,
	ReportNode,
} from "../model/types";
import type { RendererAdapter, ResolvedAsset } from "./adapter";

export type ReportData = Record<string, unknown>;

export interface RenderOptions {
	/** Resolves an asset id to its decoded bytes/dimensions. Required only if the document contains image nodes. */
	resolveAsset?: (asset: Asset) => ResolvedAsset | Promise<ResolvedAsset>;
}

export async function renderDocument(
	doc: ReportDocument,
	adapter: RendererAdapter,
	data?: ReportData,
	options?: RenderOptions,
): Promise<Uint8Array | undefined> {
	const resolved = data ? resolveBindings(doc, data) : doc;

	await adapter.beginDocument();
	for (const pageId of resolved.pages) {
		const page = resolved.nodes[pageId] as PageNode;
		const size = resolvePaperSize(page.paper);
		adapter.beginPage(size, page.background);
		for (const childId of page.children) {
			await drawNode(resolved, childId, adapter, options);
		}
		adapter.endPage();
	}
	return adapter.endDocument();
}

async function drawNode(
	doc: ReportDocument,
	nodeId: string,
	adapter: RendererAdapter,
	options?: RenderOptions,
): Promise<void> {
	const node = doc.nodes[nodeId];
	if (!node || !node.visible) return;

	adapter.save();
	adapter.translate(node.frame.x, node.frame.y);
	if (node.frame.rotation) adapter.rotate(node.frame.rotation);
	if (node.opacity < 1) adapter.setOpacity(node.opacity);

	await drawNodeContent(doc, node, adapter, options);

	for (const childId of node.children) {
		await drawNode(doc, childId, adapter, options);
	}
	adapter.restore();
}

async function drawNodeContent(
	doc: ReportDocument,
	node: ReportNode,
	adapter: RendererAdapter,
	options?: RenderOptions,
): Promise<void> {
	switch (node.type) {
		case "page":
			return;
		case "view": {
			if (node.background || node.border) {
				adapter.drawRect(node.frame.width, node.frame.height, {
					fill: node.background ? { color: node.background } : undefined,
					stroke: node.border,
					radius: node.borderRadius,
				});
			}
			if (node.clip)
				adapter.clipRect(
					node.frame.width,
					node.frame.height,
					node.borderRadius,
				);
			return;
		}
		case "text":
			adapter.drawTextBlock(node.text, node.style, {
				width: node.frame.width,
				height: node.frame.height,
			});
			return;
		case "image": {
			const asset = doc.assets[node.assetId];
			if (!asset || !options?.resolveAsset) return;
			let resolved: ResolvedAsset;
			try {
				resolved = await options.resolveAsset(asset);
			} catch {
				// An unreachable/broken image URL shouldn't blank out the rest of
				// the document — skip drawing this node and keep going, same as
				// the no-op behavior for an unresolved assetId above.
				return;
			}
			await adapter.drawImage(
				resolved,
				node.frame.width,
				node.frame.height,
				node.fit,
			);
			return;
		}
		case "rect":
			adapter.drawRect(node.frame.width, node.frame.height, {
				fill: node.fill,
				stroke: node.stroke,
				radius: node.radius,
			});
			return;
		case "circle":
			// Frame-driven so the shape resizes with its frame (a square frame is
			// a circle, a non-square frame an ellipse). The legacy `radius` field
			// is ignored for rendering.
			adapter.drawEllipse(node.frame.width, node.frame.height, {
				fill: node.fill,
				stroke: node.stroke,
			});
			return;
		case "line":
			adapter.drawLine(node.x1, node.y1, node.x2, node.y2, node.stroke);
			return;
		case "path":
			adapter.drawPath(node.d, { fill: node.fill, stroke: node.stroke });
			return;
	}
}
