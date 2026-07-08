export type NodeId = string;
export type AssetId = string;
export type FontId = string;

export interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
}

export interface Paint {
	color: string;
}

export interface Stroke {
	color: string;
	width: number;
	dash?: number[];
}

export interface Border {
	color: string;
	width: number;
}

export interface BaseNode {
	id: NodeId;
	parentId: NodeId | null;
	children: NodeId[];
	name: string;
	visible: boolean;
	locked: boolean;
	opacity: number;
	frame: Frame;
}

export interface PagePaper {
	preset: "A5" | "A4" | "A3" | "Letter" | "Legal" | "Custom";
	orientation: "portrait" | "landscape";
	width?: number;
	height?: number;
}

export interface PageMargin {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface PageNode extends BaseNode {
	type: "page";
	paper: PagePaper;
	margin: PageMargin;
	background: string;
}

export interface ViewNode extends BaseNode {
	type: "view";
	background?: string;
	border?: Border;
	borderRadius?: number;
	clip?: boolean;
}

export interface TextStyle {
	fontFamily: string;
	fontSize: number;
	fontWeight: number;
	fontStyle: "normal" | "italic";
	color: string;
	lineHeight: number;
	letterSpacing: number;
	align: "left" | "center" | "right";
	verticalAlign: "top" | "middle" | "bottom";
	decoration: "none" | "underline" | "line-through";
	wrap: boolean;
}

/**
 * The subset of TextStyle that can vary between runs within one paragraph.
 * Block-level properties (align, lineHeight, verticalAlign, wrap) stay on the
 * node's base `style` — they apply to the whole paragraph, not a span of it.
 */
export type InlineTextStyle = Pick<
	TextStyle,
	| "fontFamily"
	| "fontSize"
	| "fontWeight"
	| "fontStyle"
	| "color"
	| "letterSpacing"
	| "decoration"
>;

/**
 * A contiguous span of text sharing one set of inline style overrides. Fields
 * present in `style` override the node's base TextStyle for this span; omitted
 * fields inherit it. This is what makes "select a word, make it bold" possible.
 */
export interface TextRun {
	text: string;
	style?: Partial<InlineTextStyle>;
}

export interface TextNode extends BaseNode {
	type: "text";
	/**
	 * Full plain text. Always kept equal to the concatenation of `runs` when
	 * runs are present. Used for bindings and as the sole content when `runs`
	 * is absent (the common, unstyled case).
	 */
	text: string;
	style: TextStyle;
	/**
	 * Optional inline styled spans. Absent — or a single run with no overrides —
	 * means the whole text renders in the base `style`.
	 */
	runs?: TextRun[];
}

export interface ImageNode extends BaseNode {
	type: "image";
	assetId: AssetId;
	fit: "contain" | "cover" | "fill";
}

export interface RectNode extends BaseNode {
	type: "rect";
	fill?: Paint;
	stroke?: Stroke;
	radius?: number;
}

export interface CircleNode extends BaseNode {
	type: "circle";
	radius: number;
	fill?: Paint;
	stroke?: Stroke;
}

export interface LineNode extends BaseNode {
	type: "line";
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	stroke: Stroke;
}

export interface PathNode extends BaseNode {
	type: "path";
	d: string;
	fill?: Paint;
	stroke?: Stroke;
}

export type ReportNode =
	| PageNode
	| ViewNode
	| TextNode
	| ImageNode
	| RectNode
	| CircleNode
	| LineNode
	| PathNode;

export type NodeType = ReportNode["type"];

/** Distributes Partial<T> over each member of the ReportNode union, so a patch typed to one node's own fields (e.g. `{ text: string }`) is still valid without collapsing to only BaseNode's common keys. */
type Distribute<T> = T extends ReportNode ? Partial<T> : never;
export type ReportNodePatch = Distribute<ReportNode>;

export interface Asset {
	id: AssetId;
	kind: "image";
	url: string;
	width?: number;
	height?: number;
}

export interface FontDefinition {
	id: FontId;
	family: string;
	weight: number;
	style: "normal" | "italic";
	source: string;
}

export interface ReportDocument {
	version: number;
	pages: NodeId[];
	nodes: Record<NodeId, ReportNode>;
	assets: Record<AssetId, Asset>;
	fonts: Record<FontId, FontDefinition>;
}
