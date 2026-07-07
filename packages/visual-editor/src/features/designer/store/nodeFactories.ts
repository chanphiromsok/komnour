import { resolvePaperSize } from "@komnour/report/src/layout/paper";
import type {
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

export function createTextNode(parentId: NodeId | null): TextNode {
	return {
		...baseNode(parentId, "Text"),
		type: "text",
		text: "Text",
		frame: { x: 48, y: 48, width: 160, height: 32, rotation: 0 },
		style: { ...DEFAULT_TEXT_STYLE },
	};
}

export function createRectNode(parentId: NodeId | null): RectNode {
	return {
		...baseNode(parentId, "Rectangle"),
		type: "rect",
		frame: { x: 48, y: 48, width: 120, height: 80, rotation: 0 },
		fill: { color: "#e5e5e5" },
		stroke: { color: "#999999", width: 1 },
	};
}

export function createCircleNode(parentId: NodeId | null): CircleNode {
	return {
		...baseNode(parentId, "Circle"),
		type: "circle",
		frame: { x: 48, y: 48, width: 80, height: 80, rotation: 0 },
		radius: 40,
		fill: { color: "#e5e5e5" },
		stroke: { color: "#999999", width: 1 },
	};
}

export function createLineNode(parentId: NodeId | null): LineNode {
	return {
		...baseNode(parentId, "Line"),
		type: "line",
		frame: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
		x1: 48,
		y1: 48,
		x2: 168,
		y2: 48,
		stroke: { color: "#333333", width: 1 },
	};
}

export function createImageNode(parentId: NodeId | null): ImageNode {
	return {
		...baseNode(parentId, "Image"),
		type: "image",
		frame: { x: 48, y: 48, width: 160, height: 120, rotation: 0 },
		assetId: "",
		fit: "contain",
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
