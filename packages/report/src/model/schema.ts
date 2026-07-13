import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler, type ValueError } from "@sinclair/typebox/compiler";

/** A string-literal union, TypeBox's equivalent of zod's `z.enum([...])`. */
function StringUnion<T extends string[]>(values: readonly [...T]) {
	return Type.Union(values.map((v) => Type.Literal(v)));
}

export const FrameSchema = Type.Object({
	x: Type.Number(),
	y: Type.Number(),
	width: Type.Number(),
	height: Type.Number(),
	rotation: Type.Number(),
});

export const PaintSchema = Type.Object({
	color: Type.String(),
});

export const StrokeSchema = Type.Object({
	color: Type.String(),
	width: Type.Number(),
	dash: Type.Optional(Type.Array(Type.Number())),
});

export const BorderSchema = Type.Object({
	color: Type.String(),
	width: Type.Number(),
});

const baseNodeShape = {
	id: Type.String(),
	parentId: Type.Union([Type.String(), Type.Null()]),
	children: Type.Array(Type.String()),
	name: Type.String(),
	visible: Type.Boolean(),
	locked: Type.Boolean(),
	opacity: Type.Number(),
	frame: FrameSchema,
};

export const PageNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("page"),
	paper: Type.Object({
		preset: StringUnion(["A5", "A4", "A3", "Letter", "Legal", "Custom"]),
		orientation: StringUnion(["portrait", "landscape"]),
		width: Type.Optional(Type.Number()),
		height: Type.Optional(Type.Number()),
	}),
	margin: Type.Object({
		top: Type.Number(),
		right: Type.Number(),
		bottom: Type.Number(),
		left: Type.Number(),
	}),
	background: Type.String(),
});

export const ViewNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("view"),
	background: Type.Optional(Type.String()),
	border: Type.Optional(BorderSchema),
	borderRadius: Type.Optional(Type.Number()),
	clip: Type.Optional(Type.Boolean()),
});

export const TextStyleSchema = Type.Object({
	fontFamily: Type.String(),
	fontSize: Type.Number(),
	fontWeight: Type.Number(),
	fontStyle: StringUnion(["normal", "italic"]),
	color: Type.String(),
	lineHeight: Type.Number(),
	letterSpacing: Type.Number(),
	align: StringUnion(["left", "center", "right"]),
	verticalAlign: StringUnion(["top", "middle", "bottom"]),
	decoration: StringUnion(["none", "underline", "line-through"]),
	wrap: Type.Boolean(),
});

/** Inline overrides a run may carry — the per-span subset of TextStyle (all optional). */
export const InlineTextStyleSchema = Type.Partial(
	Type.Object({
		fontFamily: Type.String(),
		fontSize: Type.Number(),
		fontWeight: Type.Number(),
		fontStyle: StringUnion(["normal", "italic"]),
		color: Type.String(),
		letterSpacing: Type.Number(),
		decoration: StringUnion(["none", "underline", "line-through"]),
	}),
);

export const TextRunSchema = Type.Object({
	text: Type.String(),
	style: Type.Optional(InlineTextStyleSchema),
});

export const TextNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("text"),
	text: Type.String(),
	style: TextStyleSchema,
	runs: Type.Optional(Type.Array(TextRunSchema)),
});

export const ImageNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("image"),
	assetId: Type.String(),
	fit: StringUnion(["contain", "cover", "fill"]),
});

export const RectNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("rect"),
	fill: Type.Optional(PaintSchema),
	stroke: Type.Optional(StrokeSchema),
	radius: Type.Optional(Type.Number()),
});

export const CircleNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("circle"),
	radius: Type.Number(),
	fill: Type.Optional(PaintSchema),
	stroke: Type.Optional(StrokeSchema),
});

export const LineNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("line"),
	x1: Type.Number(),
	y1: Type.Number(),
	x2: Type.Number(),
	y2: Type.Number(),
	stroke: StrokeSchema,
});

export const PathNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("path"),
	d: Type.String(),
	fill: Type.Optional(PaintSchema),
	stroke: Type.Optional(StrokeSchema),
});

export const CheckboxNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("checkbox"),
	checked: Type.Boolean(),
	checkedBinding: Type.Optional(Type.String()),
	fill: Type.Optional(PaintSchema),
	stroke: Type.Optional(StrokeSchema),
	checkColor: Type.String(),
	cornerRadius: Type.Optional(Type.Number()),
	label: Type.Optional(Type.String()),
	labelStyle: Type.Optional(TextStyleSchema),
});

export const QrCodeNodeSchema = Type.Object({
	...baseNodeShape,
	type: Type.Literal("qrcode"),
	value: Type.String(),
	valueBinding: Type.Optional(Type.String()),
	color: Type.String(),
	background: Type.Optional(Type.String()),
	errorCorrection: Type.Optional(StringUnion(["L", "M", "Q", "H"])),
});

export const ReportNodeSchema = Type.Union([
	PageNodeSchema,
	ViewNodeSchema,
	TextNodeSchema,
	ImageNodeSchema,
	RectNodeSchema,
	CircleNodeSchema,
	LineNodeSchema,
	PathNodeSchema,
	CheckboxNodeSchema,
	QrCodeNodeSchema,
]);

export const AssetSchema = Type.Object({
	id: Type.String(),
	kind: Type.Literal("image"),
	url: Type.String(),
	width: Type.Optional(Type.Number()),
	height: Type.Optional(Type.Number()),
});

export const FontDefinitionSchema = Type.Object({
	id: Type.String(),
	family: Type.String(),
	weight: Type.Number(),
	style: StringUnion(["normal", "italic"]),
	source: Type.String(),
});

export const ReportDocumentTypeBoxSchema = Type.Object({
	version: Type.Number(),
	pages: Type.Array(Type.String()),
	nodes: Type.Record(Type.String(), ReportNodeSchema),
	assets: Type.Record(Type.String(), AssetSchema),
	fonts: Type.Record(Type.String(), FontDefinitionSchema),
	bindingData: Type.Optional(
		Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
	),
});

export type ReportDocumentFromSchema = Static<typeof ReportDocumentTypeBoxSchema>;

/** One validation failure — same shape as a zod issue, so existing `.safeParse()` callers (which read `issue.path`/`issue.message`) don't need to change. */
export interface SchemaIssue {
	path: (string | number)[];
	message: string;
}

export type SafeParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: { issues: SchemaIssue[] } };

/** TypeBox reports a location as a JSON-Pointer string ("/nodes/abc/frame/x"); split it into zod-style path segments. */
function toIssue(error: ValueError): SchemaIssue {
	const path = error.path
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
	return { path, message: error.message };
}

const compiledReportDocument = TypeCompiler.Compile(ReportDocumentTypeBoxSchema);

/**
 * Drop-in replacement for the zod schema's `.safeParse()` this package used
 * to export — same `{ success, data }` / `{ success: false, error: { issues } }`
 * shape, so callers (the server's export routes, the visual editor's JSON
 * import dialog and document-load path) didn't need to change at all when
 * this migrated off zod. Validation itself runs through TypeBox's compiled
 * checker (compiled once, at module load, and reused for every call), which
 * is both faster than re-walking an uncompiled schema and — since a
 * TypeBox schema is plain JSON Schema — means `ReportDocumentTypeBoxSchema`
 * can also be handed directly to any JSON-Schema-aware tool, not just this
 * package's own validator.
 */
export const ReportDocumentSchema = {
	safeParse(value: unknown): SafeParseResult<ReportDocumentFromSchema> {
		if (compiledReportDocument.Check(value)) {
			return { success: true, data: value };
		}
		const issues = [...compiledReportDocument.Errors(value)].map(toIssue);
		return { success: false, error: { issues } };
	},
};
