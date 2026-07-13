import { encode as encodeQrCode } from "uqr";
import { resolveBindings } from "../data/bind";
import { fitRect } from "../layout/fitRect";
import { resolvePaperSize } from "../layout/paper";
import { resolveRuns } from "../model/runs";
import type {
	Asset,
	PageNode,
	ReportDocument,
	ReportNode,
	TextStyle,
} from "../model/types";
import type { RendererAdapter, ResolvedAsset } from "./adapter";

export type ReportData = Record<string, unknown>;

/** Used for a checkbox's label when the node doesn't specify its own labelStyle. */
const DEFAULT_CHECKBOX_LABEL_STYLE: TextStyle = {
	fontFamily: "Inter",
	fontSize: 14,
	fontWeight: 400,
	fontStyle: "normal",
	color: "#111111",
	lineHeight: 1.3,
	letterSpacing: 0,
	align: "left",
	verticalAlign: "middle",
	decoration: "none",
	wrap: false,
};

export interface RenderOptions {
	/** Resolves an asset id to its decoded bytes/dimensions. Required only if the document contains image nodes. */
	resolveAsset?: (asset: Asset) => ResolvedAsset | Promise<ResolvedAsset>;
	/**
	 * Polled after every `await` point (asset resolution, node-to-node).
	 * When it starts returning true, rendering stops issuing further draw
	 * calls and returns early. Callers that fire off a new render on every
	 * document change (e.g. an interactive canvas re-rendering on each
	 * pointermove) should set this once a newer render has superseded this
	 * one — otherwise the two calls race on the same shared canvas surface,
	 * since an in-flight image fetch can resume and keep drawing stale
	 * content on top of a newer, already-correct frame.
	 */
	shouldAbort?: () => boolean;
}
/**
 * Renders every page of `doc` through `adapter` and returns the finished
 * document's bytes (for SkiaAdapter, a PDF; browser adapters paint and
 * return undefined). Does not register fonts and does not validate `doc` —
 * both are the caller's responsibility.
 *
 * ```ts
 * const adapter = new SkiaAdapter();
 * const bytes = await renderDocument(doc, adapter, data, {
 * 	resolveAsset: resolveAssetServer, // only needed for image nodes
 * });
 * const pdf = Buffer.from(bytes ?? new Uint8Array());
 * ```
 */
export async function renderDocument(
	doc: ReportDocument,
	adapter: RendererAdapter,
	data?: ReportData,
	options?: RenderOptions,
): Promise<Uint8Array | undefined> {
	// Always resolve — not just when `data` is passed — so inline checkbox
	// literals (`{{checkbox: true}}`/`{{checkbox: false}}`, which don't need
	// any binding data) still render even for a document with none. When the
	// caller passes no `data`, fall back to the document's own embedded
	// `bindingData` (an exported document is self-contained — see
	// ReportDocument.bindingData) — the same fallback the server's export
	// routes and this package's README already promise. `{}` as the final
	// fallback keeps every dot-path lookup resolving to undefined.
	const resolved = resolveBindings(doc, data ?? doc.bindingData ?? {});

	await adapter.beginDocument();
	for (const pageId of resolved.pages) {
		if (options?.shouldAbort?.()) return undefined;
		const page = resolved.nodes[pageId] as PageNode;
		const size = resolvePaperSize(page.paper);
		adapter.beginPage(size, page.background);
		for (const childId of page.children) {
			await drawNode(resolved, childId, adapter, options);
			if (options?.shouldAbort?.()) return undefined;
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
	if (node.frame.rotation) {
		// Rotate around the frame's center, not its top-left origin — pivoting
		// on the corner swings the shape away from where it sits instead of
		// spinning it in place, which is never what a rotation control means
		// in a design tool. The selection overlay and hit-testing mirror this
		// same center pivot.
		const cx = node.frame.width / 2;
		const cy = node.frame.height / 2;
		adapter.translate(cx, cy);
		adapter.rotate(node.frame.rotation);
		adapter.translate(-cx, -cy);
	}
	if (node.opacity < 1) adapter.setOpacity(node.opacity);

	await drawNodeContent(doc, node, adapter, options);

	if (!options?.shouldAbort?.()) {
		for (const childId of node.children) {
			await drawNode(doc, childId, adapter, options);
			if (options?.shouldAbort?.()) break;
		}
	}
	// Always restore, even when aborting mid-tree, so the canvas's
	// save/restore (and CanvasAdapter's opacity-layer) stacks stay balanced
	// for the next render that reuses this same adapter instance.
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
			adapter.drawTextBlock(resolveRuns(node), node.style, {
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
			// The asset resolution above is the one `await` most likely to
			// outlive a superseded render (network/decode time); re-check here
			// before drawing so a stale resolve can't paint over a newer frame.
			if (options?.shouldAbort?.()) return;
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
		case "checkbox": {
			// With a label, the box is a square sized to the frame's height and
			// frame.width covers the box plus the label together (see
			// CheckboxNode's doc comment). Without one, there's nothing else to
			// lay out, so the box fills the whole frame — a label-less checkbox
			// resizes in both dimensions exactly like a Rect, instead of width
			// silently doing nothing (which looked like it couldn't be resized).
			const boxWidth = node.label ? node.frame.height : node.frame.width;
			const boxHeight = node.frame.height;
			adapter.drawRect(boxWidth, boxHeight, {
				fill: node.fill,
				stroke: node.stroke,
				radius: node.cornerRadius,
			});
			if (node.checked) {
				const checkStroke = {
					color: node.checkColor,
					width: Math.max(1.5, Math.min(boxWidth, boxHeight) * 0.12),
				};
				adapter.drawLine(
					boxWidth * 0.2,
					boxHeight * 0.55,
					boxWidth * 0.42,
					boxHeight * 0.78,
					checkStroke,
				);
				adapter.drawLine(
					boxWidth * 0.42,
					boxHeight * 0.78,
					boxWidth * 0.82,
					boxHeight * 0.22,
					checkStroke,
				);
			}
			if (node.label) {
				const gap = boxHeight * 0.4;
				adapter.save();
				adapter.translate(boxWidth + gap, 0);
				adapter.drawTextBlock(
					[{ text: node.label }],
					node.labelStyle ?? DEFAULT_CHECKBOX_LABEL_STYLE,
					{
						width: Math.max(0, node.frame.width - boxWidth - gap),
						height: node.frame.height,
					},
				);
				adapter.restore();
			}
			return;
		}
		case "qrcode": {
			if (!node.value) return;
			// A bound value can exceed QR capacity (~3KB at ecc L, much less at
			// H) and uqr throws "Data too long" — one oversized record shouldn't
			// blank the rest of the document, so skip just this node, the same
			// no-op treatment a broken image asset gets above.
			let matrix: boolean[][];
			let size: number;
			try {
				({ data: matrix, size } = encodeQrCode(node.value, {
					ecc: node.errorCorrection ?? "M",
				}));
			} catch {
				return;
			}
			// Centers a square code within a possibly non-square frame — the
			// same helper image placement uses, reused directly here since a
			// QR code is drawn as a grid of rects, not through drawImage.
			const box = fitRect(1, 1, node.frame.width, node.frame.height, "contain");
			const moduleSize = box.width / size;
			adapter.save();
			adapter.translate(box.x, box.y);
			if (node.background) {
				adapter.drawRect(box.width, box.height, {
					fill: { color: node.background },
				});
			}
			// Adjacent dark modules in a row are drawn as one rect per run, not
			// one rect per module: identical geometry, but ~10x fewer draw calls
			// and no antialiased hairline seams between horizontally adjacent
			// modules at fractional coordinates (visible in some PDF viewers).
			for (let row = 0; row < size; row++) {
				let col = 0;
				while (col < size) {
					if (!matrix[row][col]) {
						col++;
						continue;
					}
					let runEnd = col;
					while (runEnd < size && matrix[row][runEnd]) runEnd++;
					adapter.save();
					adapter.translate(col * moduleSize, row * moduleSize);
					adapter.drawRect((runEnd - col) * moduleSize, moduleSize, {
						fill: { color: node.color },
					});
					adapter.restore();
					col = runEnd;
				}
			}
			adapter.restore();
			return;
		}
	}
}
