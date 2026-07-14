import {
	Canvas,
	type CanvasRenderingContext2D,
	loadImage,
	Path2D,
} from "skia-canvas";
import { fitRect } from "../layout/fitRect";
import { verticalAlignOffset } from "../layout/verticalAlign";
import { runsToText } from "../model/runs";
import type {
	InlineTextStyle,
	Stroke,
	TextRun,
	TextStyle,
} from "../model/types";
import type {
	CircleOptions,
	PathOptions,
	RectOptions,
	RendererAdapter,
	ResolvedAsset,
	TextBlockMetrics,
} from "./adapter";
import { tokenizeText } from "./tokenizeText";

/**
 * RendererAdapter backed by skia-canvas (native Skia, Node) for server-side
 * PDF/PNG export. Text shaping/wrapping is delegated entirely to
 * skia-canvas's native `ctx.textWrap`/`measureText`/`fillText` — the same
 * "never hand-roll wrapping" rule as CanvasAdapter, so both backends stay in
 * step for Khmer and every other script.
 */
export class SkiaAdapter implements RendererAdapter {
	private canvas: Canvas | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private readonly gpu: boolean;
	private readonly output: "pdf" | "raster";

	/**
	 * Renders on the CPU by default (`gpu: false`): PDF output goes through
	 * Skia's vector PDF backend, which never uses the GPU, and on headless
	 * servers skipping GPU probing avoids allocating a Vulkan context that
	 * would only ever sit idle. Pass `{ gpu: true }` for raster (PNG)
	 * rendering on a machine that actually has a GPU worth using.
	 *
	 * `output` defaults to "pdf": endDocument serializes the PDF and then
	 * immediately releases the canvas. Pass "raster" when the render's real
	 * product is `currentPageToPng()` — endDocument then skips PDF
	 * generation entirely (previously every PNG export paid for a full PDF
	 * that was thrown away) and keeps the canvas alive for the PNG call,
	 * which releases it instead.
	 */
	constructor(
		private readonly pixelRatio = 1,
		options?: { gpu?: boolean; output?: "pdf" | "raster" },
	) {
		this.gpu = options?.gpu ?? false;
		this.output = options?.output ?? "pdf";
	}

	private get context(): CanvasRenderingContext2D {
		if (!this.ctx)
			throw new Error("SkiaAdapter: beginPage() must be called before drawing");
		return this.ctx;
	}

	beginDocument(): void {
		// A fresh document must not inherit pages from a previous render that
		// reused this adapter instance — beginPage's newPage() would otherwise
		// keep appending to the old canvas and endDocument would emit a PDF
		// containing both documents' pages.
		this.canvas = null;
		this.ctx = null;
	}

	beginPage(size: { width: number; height: number }, background: string): void {
		if (!this.canvas) {
			this.canvas = new Canvas(
				size.width * this.pixelRatio,
				size.height * this.pixelRatio,
			);
			this.canvas.gpu = this.gpu;
			this.ctx = this.canvas.getContext("2d");
		} else {
			this.ctx = this.canvas.newPage(
				size.width * this.pixelRatio,
				size.height * this.pixelRatio,
			);
		}
		if (this.pixelRatio !== 1) this.ctx.scale(this.pixelRatio, this.pixelRatio);
		this.ctx.fillStyle = background;
		this.ctx.fillRect(0, 0, size.width, size.height);
	}

	endPage(): void {}

	async endDocument(): Promise<Uint8Array> {
		if (!this.canvas) return new Uint8Array();
		// In raster mode the finished product is currentPageToPng's PNG, so
		// don't serialize a PDF nobody will read — and keep the canvas alive
		// for that PNG call, which releases it.
		if (this.output === "raster") return new Uint8Array();
		const buffer = await this.canvas.pdf;
		// Drop the canvas the moment its output exists rather than waiting to
		// be garbage-collected with this adapter: the canvas is mostly native
		// (non-V8) memory, which JS heap pressure won't hurry to collect, so
		// deterministic release keeps a busy server's footprint flat instead
		// of GC-timing-dependent.
		this.canvas = null;
		this.ctx = null;
		// A view over the native buffer's memory, not a copy — a finished PDF
		// can be tens of MB, and copying it here (and typically again in the
		// caller's Buffer.from) tripled peak memory per export.
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}

	/** Renders just the current page (must be the only/last page drawn) to a PNG buffer. */
	async currentPageToPng(): Promise<Uint8Array> {
		if (!this.canvas) return new Uint8Array();
		const buffer = await this.canvas.png;
		// Deterministic release + zero-copy view, same as endDocument above.
		this.canvas = null;
		this.ctx = null;
		return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	}

	save(): void {
		this.context.save();
	}

	restore(): void {
		this.context.restore();
	}

	translate(x: number, y: number): void {
		this.context.translate(x, y);
	}

	rotate(degrees: number): void {
		this.context.rotate((degrees * Math.PI) / 180);
	}

	setOpacity(opacity: number): void {
		this.context.globalAlpha *= opacity;
	}

	clipRect(width: number, height: number, radius?: number): void {
		const ctx = this.context;
		ctx.beginPath();
		if (radius) ctx.roundRect(0, 0, width, height, radius);
		else ctx.rect(0, 0, width, height);
		ctx.clip();
	}

	drawRect(width: number, height: number, opts: RectOptions): void {
		const ctx = this.context;
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			if (opts.radius) {
				ctx.beginPath();
				ctx.roundRect(0, 0, width, height, opts.radius);
				ctx.fill();
			} else {
				ctx.fillRect(0, 0, width, height);
			}
		}
		if (opts.stroke && this.applyStroke(opts.stroke)) {
			if (opts.radius) {
				ctx.beginPath();
				ctx.roundRect(0, 0, width, height, opts.radius);
				ctx.stroke();
			} else {
				ctx.strokeRect(0, 0, width, height);
			}
		}
	}

	drawEllipse(width: number, height: number, opts: CircleOptions): void {
		const ctx = this.context;
		const rx = width / 2;
		const ry = height / 2;
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			ctx.beginPath();
			ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		if (opts.stroke && this.applyStroke(opts.stroke)) {
			ctx.beginPath();
			ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		stroke: Stroke,
	): void {
		const ctx = this.context;
		if (!this.applyStroke(stroke)) return;
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}

	drawPath(d: string, opts: PathOptions): void {
		const ctx = this.context;
		const path = new Path2D(d);
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			ctx.fill(path);
		}
		if (opts.stroke && this.applyStroke(opts.stroke)) {
			ctx.stroke(path);
		}
	}

	async drawImage(
		asset: ResolvedAsset,
		width: number,
		height: number,
		fit: "contain" | "cover" | "fill",
	): Promise<void> {
		const image = await loadImage(Buffer.from(asset.bytes));
		const fitted = fitRect(asset.width, asset.height, width, height, fit);
		this.context.drawImage(
			image,
			fitted.x,
			fitted.y,
			fitted.width,
			fitted.height,
		);
	}

	measureTextBlock(
		runs: TextRun[],
		style: TextStyle,
		maxWidth: number,
	): TextBlockMetrics {
		if (isUniform(runs)) {
			const ctx = this.context;
			this.applyTextStyle(style);
			const metrics = ctx.measureText(
				runsToText(runs),
				style.wrap ? maxWidth : undefined,
			);
			return {
				width: metrics.width,
				height: contentHeightOf(metrics),
				lineCount: metrics.lines.length,
			};
		}
		const lines = this.layoutStyledRuns(runs, style, maxWidth);
		return {
			width: Math.max(0, ...lines.map((l) => l.width)),
			height: lines.reduce((sum, l) => sum + l.advance, 0),
			lineCount: lines.length,
		};
	}

	drawTextBlock(
		runs: TextRun[],
		style: TextStyle,
		box: { width: number; height: number },
	): void {
		// Fast path: an unstyled node (every existing document) is one uniform
		// run — shape it with skia-canvas's native wrap exactly as before, no
		// behavior change and no hand-rolled layout.
		if (isUniform(runs)) {
			const ctx = this.context;
			this.applyTextStyle(style);
			const metrics = ctx.measureText(
				runsToText(runs),
				style.wrap ? box.width : undefined,
			);
			const yOffset = verticalAlignOffset(
				box.height,
				contentHeightOf(metrics),
				style.verticalAlign,
			);
			const x =
				style.align === "center"
					? box.width / 2
					: style.align === "right"
						? box.width
						: 0;
			ctx.fillText(
				runsToText(runs),
				x,
				yOffset,
				style.wrap ? box.width : undefined,
			);
			return;
		}
		this.drawStyledRuns(runs, style, box);
	}

	/**
	 * Manual layout for a paragraph with mixed inline styles — skia-canvas has
	 * no rich-paragraph builder (unlike CanvasKit's ParagraphBuilder), so styled
	 * runs are tokenized into words/whitespace, greedily wrapped, and drawn per
	 * token at a shared baseline. Only reached when a node actually carries
	 * inline overrides; uniform text never takes this path.
	 */
	private layoutStyledRuns(
		runs: TextRun[],
		style: TextStyle,
		maxWidth: number,
	): StyledLine[] {
		const ctx = this.context;
		const wrap = style.wrap;
		const lines: StyledLine[] = [];
		let current: StyledToken[] = [];

		const flush = () => {
			lines.push(makeLine(current, style));
			current = [];
		};

		for (const run of runs) {
			const merged = mergeInline(style, run.style);
			const tokens = tokenizeText(run.text);
			for (const text of tokens) {
				if (text === "\n") {
					flush();
					continue;
				}
				this.applyRunStyle(merged);
				const m = ctx.measureText(text);
				const token: StyledToken = {
					text,
					width: m.width,
					ascent: m.fontBoundingBoxAscent,
					descent: m.fontBoundingBoxDescent,
					lineHeight: merged.fontSize * style.lineHeight,
					style: merged,
					isSpace: /^\s+$/.test(text),
				};
				const lineWidth = current.reduce((w, t) => w + t.width, 0);
				if (
					wrap &&
					current.length > 0 &&
					!token.isSpace &&
					lineWidth + token.width > maxWidth
				) {
					flush();
				}
				current.push(token);
			}
		}
		flush();
		return lines;
	}

	private drawStyledRuns(
		runs: TextRun[],
		style: TextStyle,
		box: { width: number; height: number },
	): void {
		const ctx = this.context;
		const lines = this.layoutStyledRuns(runs, style, box.width);
		const totalHeight = lines.reduce((sum, l) => sum + l.advance, 0);
		let y = verticalAlignOffset(box.height, totalHeight, style.verticalAlign);

		for (const line of lines) {
			const leading = line.advance - (line.ascent + line.descent);
			const baseline = y + leading / 2 + line.ascent;
			let x =
				style.align === "center"
					? (box.width - line.width) / 2
					: style.align === "right"
						? box.width - line.width
						: 0;
			for (const token of line.tokens) {
				this.applyRunStyle(token.style);
				ctx.fillText(token.text, x, baseline);
				x += token.width;
			}
			y += line.advance;
		}
	}

	/** Sets the 2D context up to draw one run's text (font, color, decoration). */
	private applyRunStyle(style: ResolvedInline): void {
		const ctx = this.context;
		const lineHeightPx = style.fontSize * style.lineHeightMultiplier;
		const italic = style.fontStyle === "italic" ? "italic " : "";
		ctx.font = `${italic}${style.fontWeight} ${style.fontSize}px/${lineHeightPx}px ${style.fontFamily}`;
		ctx.fillStyle = style.color;
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.textWrap = false;
		ctx.letterSpacing = `${style.letterSpacing}px`;
		ctx.textDecoration = style.decoration === "none" ? "" : style.decoration;
	}

	/**
	 * Returns false for a non-positive width so callers skip stroking
	 * entirely — assigning 0 to lineWidth is ignored per the Canvas2D spec,
	 * which would silently stroke with whatever width the previous shape
	 * left behind instead of drawing nothing.
	 */
	private applyStroke(stroke: Stroke): boolean {
		if (!(stroke.width > 0)) return false;
		const ctx = this.context;
		ctx.strokeStyle = stroke.color;
		ctx.lineWidth = stroke.width;
		ctx.setLineDash(stroke.dash ?? []);
		return true;
	}

	private applyTextStyle(style: TextStyle): void {
		const ctx = this.context;
		const lineHeightPx = style.fontSize * style.lineHeight;
		const italic = style.fontStyle === "italic" ? "italic " : "";
		ctx.font = `${italic}${style.fontWeight} ${style.fontSize}px/${lineHeightPx}px ${style.fontFamily}`;
		ctx.fillStyle = style.color;
		ctx.textAlign = style.align;
		ctx.textBaseline = "top";
		ctx.textWrap = style.wrap;
		ctx.letterSpacing = `${style.letterSpacing}px`;
		ctx.textDecoration = style.decoration === "none" ? "" : style.decoration;
	}
}

function contentHeightOf(metrics: {
	lines: readonly { y: number; height: number }[];
}): number {
	// Array.prototype.at() only landed in Node 16.6 — indexing directly keeps
	// this working on the full Node >=16 range this package supports.
	const lastLine = metrics.lines[metrics.lines.length - 1];
	return lastLine ? lastLine.y + lastLine.height : 0;
}

/** A fully-resolved inline style (base merged with a run's overrides) for the styled-run path. */
interface ResolvedInline {
	fontFamily: string;
	fontSize: number;
	fontWeight: number;
	fontStyle: "normal" | "italic";
	color: string;
	letterSpacing: number;
	decoration: "none" | "underline" | "line-through";
	/** Block-level line-height multiplier, always from the base style. */
	lineHeightMultiplier: number;
}

interface StyledToken {
	text: string;
	width: number;
	ascent: number;
	descent: number;
	lineHeight: number;
	style: ResolvedInline;
	isSpace: boolean;
}

interface StyledLine {
	tokens: StyledToken[];
	width: number;
	ascent: number;
	descent: number;
	/** Vertical space this line occupies (baseline-to-baseline advance). */
	advance: number;
}

/**
 * `fallbackStyle` covers a blank line (an empty paragraph between two "\n"s,
 * e.g. a spacer between paragraphs) — with zero tokens, `naturalHeight` and
 * the token-derived `requestedHeight` are both 0, which used to collapse a
 * blank line to no vertical space at all. A blank line still needs to
 * occupy a normal line's worth of height, so it falls back to the
 * surrounding paragraph's own fontSize × lineHeight.
 */
function makeLine(tokens: StyledToken[], fallbackStyle: TextStyle): StyledLine {
	const ascent = Math.max(0, ...tokens.map((t) => t.ascent));
	const descent = Math.max(0, ...tokens.map((t) => t.descent));
	const naturalHeight = ascent + descent;
	const requestedHeight =
		tokens.length > 0
			? Math.max(0, ...tokens.map((t) => t.lineHeight))
			: fallbackStyle.fontSize * fallbackStyle.lineHeight;
	return {
		tokens,
		width: tokens.reduce((w, t) => w + t.width, 0),
		ascent,
		descent,
		advance: Math.max(naturalHeight, requestedHeight),
	};
}

function mergeInline(
	base: TextStyle,
	override: Partial<InlineTextStyle> | undefined,
): ResolvedInline {
	return {
		fontFamily: override?.fontFamily ?? base.fontFamily,
		fontSize: override?.fontSize ?? base.fontSize,
		fontWeight: override?.fontWeight ?? base.fontWeight,
		fontStyle: override?.fontStyle ?? base.fontStyle,
		color: override?.color ?? base.color,
		letterSpacing: override?.letterSpacing ?? base.letterSpacing,
		decoration: override?.decoration ?? base.decoration,
		lineHeightMultiplier: base.lineHeight,
	};
}

/** True when no run carries an inline override, so the fast native-wrap path applies. */
function isUniform(runs: TextRun[]): boolean {
	return runs.every(
		(run) =>
			!run.style ||
			Object.values(run.style).every((value) => value === undefined),
	);
}
