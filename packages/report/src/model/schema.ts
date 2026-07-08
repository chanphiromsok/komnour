import { z } from "zod";

export const FrameSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
	rotation: z.number(),
});

export const PaintSchema = z.object({
	color: z.string(),
});

export const StrokeSchema = z.object({
	color: z.string(),
	width: z.number(),
	dash: z.array(z.number()).optional(),
});

export const BorderSchema = z.object({
	color: z.string(),
	width: z.number(),
});

const baseNodeShape = {
	id: z.string(),
	parentId: z.string().nullable(),
	children: z.array(z.string()),
	name: z.string(),
	visible: z.boolean(),
	locked: z.boolean(),
	opacity: z.number(),
	frame: FrameSchema,
};

export const PageNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("page"),
	paper: z.object({
		preset: z.enum(["A5", "A4", "A3", "Letter", "Legal", "Custom"]),
		orientation: z.enum(["portrait", "landscape"]),
		width: z.number().optional(),
		height: z.number().optional(),
	}),
	margin: z.object({
		top: z.number(),
		right: z.number(),
		bottom: z.number(),
		left: z.number(),
	}),
	background: z.string(),
});

export const ViewNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("view"),
	background: z.string().optional(),
	border: BorderSchema.optional(),
	borderRadius: z.number().optional(),
	clip: z.boolean().optional(),
});

export const TextStyleSchema = z.object({
	fontFamily: z.string(),
	fontSize: z.number(),
	fontWeight: z.number(),
	fontStyle: z.enum(["normal", "italic"]),
	color: z.string(),
	lineHeight: z.number(),
	letterSpacing: z.number(),
	align: z.enum(["left", "center", "right"]),
	verticalAlign: z.enum(["top", "middle", "bottom"]),
	decoration: z.enum(["none", "underline", "line-through"]),
	wrap: z.boolean(),
});

/** Inline overrides a run may carry — the per-span subset of TextStyle (all optional). */
export const InlineTextStyleSchema = z
	.object({
		fontFamily: z.string(),
		fontSize: z.number(),
		fontWeight: z.number(),
		fontStyle: z.enum(["normal", "italic"]),
		color: z.string(),
		letterSpacing: z.number(),
		decoration: z.enum(["none", "underline", "line-through"]),
	})
	.partial();

export const TextRunSchema = z.object({
	text: z.string(),
	style: InlineTextStyleSchema.optional(),
});

export const TextNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("text"),
	text: z.string(),
	style: TextStyleSchema,
	runs: z.array(TextRunSchema).optional(),
});

export const ImageNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("image"),
	assetId: z.string(),
	fit: z.enum(["contain", "cover", "fill"]),
});

export const RectNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("rect"),
	fill: PaintSchema.optional(),
	stroke: StrokeSchema.optional(),
	radius: z.number().optional(),
});

export const CircleNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("circle"),
	radius: z.number(),
	fill: PaintSchema.optional(),
	stroke: StrokeSchema.optional(),
});

export const LineNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("line"),
	x1: z.number(),
	y1: z.number(),
	x2: z.number(),
	y2: z.number(),
	stroke: StrokeSchema,
});

export const PathNodeSchema = z.object({
	...baseNodeShape,
	type: z.literal("path"),
	d: z.string(),
	fill: PaintSchema.optional(),
	stroke: StrokeSchema.optional(),
});

export const ReportNodeSchema = z.discriminatedUnion("type", [
	PageNodeSchema,
	ViewNodeSchema,
	TextNodeSchema,
	ImageNodeSchema,
	RectNodeSchema,
	CircleNodeSchema,
	LineNodeSchema,
	PathNodeSchema,
]);

export const AssetSchema = z.object({
	id: z.string(),
	kind: z.literal("image"),
	url: z.string(),
	width: z.number().optional(),
	height: z.number().optional(),
});

export const FontDefinitionSchema = z.object({
	id: z.string(),
	family: z.string(),
	weight: z.number(),
	style: z.enum(["normal", "italic"]),
	source: z.string(),
});

export const ReportDocumentSchema = z.object({
	version: z.number(),
	pages: z.array(z.string()),
	nodes: z.record(z.string(), ReportNodeSchema),
	assets: z.record(z.string(), AssetSchema),
	fonts: z.record(z.string(), FontDefinitionSchema),
	bindingData: z.record(z.string(), z.unknown()).nullable().optional(),
});
