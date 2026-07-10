import { resolvePaperSize } from "@komnour/report/src/layout/paper";
import type {
	CheckboxNode,
	CircleNode,
	ImageNode,
	LineNode,
	NodeId,
	PageNode,
	RectNode,
	TextNode,
} from "@komnour/report/src/model/types";

const DEFAULT_TEXT_STYLE: TextNode["style"] = {
	fontFamily: "Inter",
	fontSize: 16,
	fontWeight: 400,
	fontStyle: "normal",
	color: "#111111",
	lineHeight: 1.4,
	letterSpacing: 0,
	align: "left",
	verticalAlign: "top",
	decoration: "none",
	wrap: true,
};
const FALLBACK_ORIGIN = { x: 48, y: 48 };

/** Optional overrides every factory below accepts, layered on top of its own type-specific defaults. */
interface CreateNodeOptions {
	/**
	 * Where to CENTER the new node, in the active page's document-local
	 * coordinates — not its top-left corner, so callers don't need to know
	 * the node's default size to place it sensibly. Falls back to the
	 * historical fixed (48, 48) top-left when omitted (e.g. programmatic/
	 * test callers), same as before this became configurable.
	 */
	center?: { x: number; y: number };
}

interface CreateTextNodeOptions extends CreateNodeOptions {
	fontFamily?: string;
	fontSize?: number;
}

/** Resolves a factory's frame origin from a desired center point and the node's own size. */
function originFor(
	center: { x: number; y: number } | undefined,
	width: number,
	height: number,
): { x: number; y: number } {
	if (!center) return FALLBACK_ORIGIN;
	return { x: center.x - width / 2, y: center.y - height / 2 };
}

function baseNode(parentId: NodeId | null, name: string) {
	return {
		id: crypto.randomUUID(),
		parentId,
		children: [],
		name,
		visible: true,
		locked: false,
		opacity: 1,
	};
}

export function createTextNode(
	parentId: NodeId | null,
	options?: CreateTextNodeOptions,
): TextNode {
	const width = 160;
	const height = 32;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Text"),
		type: "text",
		text: "Text",
		frame: { ...origin, width, height, rotation: 0 },
		style: {
			...DEFAULT_TEXT_STYLE,
			fontFamily: options?.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
			fontSize: options?.fontSize ?? DEFAULT_TEXT_STYLE.fontSize,
		},
	};
}

export function createRectNode(
	parentId: NodeId | null,
	options?: CreateNodeOptions,
): RectNode {
	const width = 120;
	const height = 80;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Rectangle"),
		type: "rect",
		frame: { ...origin, width, height, rotation: 0 },
		fill: { color: "#e5e5e5" },
		stroke: { color: "#999999", width: 1 },
	};
}

export function createCircleNode(
	parentId: NodeId | null,
	options?: CreateNodeOptions,
): CircleNode {
	const width = 80;
	const height = 80;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Circle"),
		type: "circle",
		frame: { ...origin, width, height, rotation: 0 },
		radius: 40,
		fill: { color: "#e5e5e5" },
		stroke: { color: "#999999", width: 1 },
	};
}

export function createLineNode(
	parentId: NodeId | null,
	options?: CreateNodeOptions,
): LineNode {
	// `frame` is the line's bounding box — hit-testing, the selection outline,
	// and resize handles all key off it, so it can never be left at 0×0 like
	// x1/x2's raw values would otherwise imply. x1/y1 always sit at the
	// frame's origin and x2/y2 at its far corner (kept in sync on every
	// resize by updateNodeFrame), so a plain horizontal line here is frame
	// {x, y, width:120, height:0} with x1=y1=0, x2=120, y2=0.
	const width = 120;
	const height = 0;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Line"),
		type: "line",
		frame: { ...origin, width, height, rotation: 0 },
		x1: 0,
		y1: 0,
		x2: width,
		y2: 0,
		stroke: { color: "#333333", width: 1 },
	};
}

export function createImageNode(
	parentId: NodeId | null,
	options?: CreateNodeOptions,
): ImageNode {
	const width = 160;
	const height = 120;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Image"),
		type: "image",
		frame: { ...origin, width, height, rotation: 0 },
		assetId: "",
		fit: "contain",
	};
}

export function createCheckboxNode(
	parentId: NodeId | null,
	options?: CreateTextNodeOptions,
): CheckboxNode {
	// frame.height is the box's side length; frame.width is the box plus the
	// label — see CheckboxNode's doc comment for why the whole row is one
	// frame instead of a frame just for the box.
	const width = 160;
	const height = 20;
	const origin = originFor(options?.center, width, height);
	return {
		...baseNode(parentId, "Checkbox"),
		type: "checkbox",
		frame: { ...origin, width, height, rotation: 0 },
		checked: false,
		fill: { color: "#ffffff" },
		stroke: { color: "#999999", width: 1 },
		checkColor: "#111111",
		cornerRadius: 3,
		label: "Checkbox",
		labelStyle: {
			...DEFAULT_TEXT_STYLE,
			fontFamily: options?.fontFamily ?? DEFAULT_TEXT_STYLE.fontFamily,
			fontSize: options?.fontSize ?? 14,
			verticalAlign: "middle",
		},
	};
}

export function createPageNode(): PageNode {
	const paper: PageNode["paper"] = { preset: "A4", orientation: "portrait" };
	const size = resolvePaperSize(paper);
	return {
		...baseNode(null, "Page"),
		type: "page",
		frame: { x: 0, y: 0, width: size.width, height: size.height, rotation: 0 },
		paper,
		margin: { top: 48, right: 48, bottom: 48, left: 48 },
		background: "#ffffff",
	};
}
