import { fitRect } from "../layout/fitRect";
import { verticalAlignOffset } from "../layout/verticalAlign";
import type { InlineTextStyle, Stroke, TextRun, TextStyle } from "../model/types";
import type {
	CircleOptions,
	PathOptions,
	RectOptions,
	RendererAdapter,
	ResolvedAsset,
	TextBlockMetrics,
} from "./adapter";

/**
 * RendererAdapter backed by the browser's native Canvas2D API — works against
 * a real `<canvas>` context on the main thread or an `OffscreenCanvas`'s
 * context inside a Worker (their 2D context APIs are identical for
 * everything used here), which is what makes it possible to render the live
 * editor's page previews entirely client-side instead of round-tripping to
 * the server for every edit.
 *
 * Unlike SkiaAdapter (skia-canvas), there is no native wrap-simulating
 * `measureText`/`fillText` or `textDecoration` here — those are skia-canvas
 * extensions with no browser equivalent — so every text block, styled or
 * not, goes through the same manual token-wrap layout (see
 * `layoutStyledRuns`/`drawStyledRuns` below), and underline/strikethrough
 * are drawn by hand as lines under/through the measured text. This is
 * preview-only rendering; the server (SkiaAdapter) remains the source of
 * truth for exported PDF/PNG, so small cosmetic differences in decoration
 * placement between the two are acceptable here.
 */
export class BrowserCanvasAdapter implements RendererAdapter {
	private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	private opacityLayerDepth = 0;

	/**
	 * `pixelRatio` scales every subsequent draw call so the canvas's backing
	 * pixel buffer can be sized at devicePixelRatio × zoom for crisp
	 * rendering while every draw call still works in document points —
	 * applied once here, before renderer.ts's save/restore pairs exist, so it
	 * composes transparently underneath them with no changes needed anywhere
	 * else (same approach the removed CanvasKit-based adapter used).
	 */
	constructor(
		ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
		pixelRatio = 1,
	) {
		this.ctx = ctx;
		if (pixelRatio !== 1) ctx.scale(pixelRatio, pixelRatio);
	}

	beginDocument(): void {}

	beginPage(size: { width: number; height: number }, background: string): void {
		this.ctx.clearRect(0, 0, size.width, size.height);
		this.ctx.fillStyle = background;
		this.ctx.fillRect(0, 0, size.width, size.height);
	}

	endPage(): void {}

	endDocument(): undefined {
		return undefined;
	}

	save(): void {
		this.ctx.save();
	}

	restore(): void {
		this.ctx.restore();
	}

	translate(x: number, y: number): void {
		this.ctx.translate(x, y);
	}

	rotate(degrees: number): void {
		this.ctx.rotate((degrees * Math.PI) / 180);
	}

	setOpacity(opacity: number): void {
		// No native "save layer" in Canvas2D — matches SkiaAdapter's approach
		// (multiplying globalAlpha rather than isolating a compositing layer),
		// so overlapping semi-transparent children within one opacity node
		// composite the same (slightly different from a true isolated layer)
		// in both the live preview and the exported render.
		this.ctx.globalAlpha *= opacity;
	}

	clipRect(width: number, height: number, radius?: number): void {
		const ctx = this.ctx;
		ctx.beginPath();
		if (radius) ctx.roundRect(0, 0, width, height, radius);
		else ctx.rect(0, 0, width, height);
		ctx.clip();
	}

	drawRect(width: number, height: number, opts: RectOptions): void {
		const ctx = this.ctx;
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
		if (opts.stroke) {
			this.applyStroke(opts.stroke);
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
		const ctx = this.ctx;
		const rx = width / 2;
		const ry = height / 2;
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			ctx.beginPath();
			ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
			ctx.fill();
		}
		if (opts.stroke) {
			this.applyStroke(opts.stroke);
			ctx.beginPath();
			ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
			ctx.stroke();
		}
	}

	drawLine(x1: number, y1: number, x2: number, y2: number, stroke: Stroke): void {
		const ctx = this.ctx;
		this.applyStroke(stroke);
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	}

	drawPath(d: string, opts: PathOptions): void {
		const ctx = this.ctx;
		const path = new Path2D(d);
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			ctx.fill(path);
		}
		if (opts.stroke) {
			this.applyStroke(opts.stroke);
			ctx.stroke(path);
		}
	}

	async drawImage(
		asset: ResolvedAsset,
		width: number,
		height: number,
		fit: "contain" | "cover" | "fill",
	): Promise<void> {
		const blob = new Blob([asset.bytes.slice()]);
		const bitmap = await createImageBitmap(blob);
		const fitted = fitRect(asset.width, asset.height, width, height, fit);
		this.ctx.drawImage(bitmap, fitted.x, fitted.y, fitted.width, fitted.height);
		bitmap.close();
	}

	measureTextBlock(runs: TextRun[], style: TextStyle, maxWidth: number): TextBlockMetrics {
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
		const ctx = this.ctx;
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
				if (token.style.decoration !== "none") {
					this.drawDecoration(
						x,
						baseline,
						token.width,
						token.style.fontSize,
						token.style.decoration,
						token.style.color,
					);
				}
				x += token.width;
			}
			y += line.advance;
		}
	}

	/**
	 * There's no native `ctx.textDecoration` in a real browser (skia-canvas
	 * adds that as a convenience) — underline/strikethrough are drawn by hand
	 * as a line at an approximate offset from the baseline. Preview-only, so
	 * this doesn't need to land on the exact same pixel as the server's Skia
	 * decoration, just read as the same style.
	 */
	private drawDecoration(
		x: number,
		baseline: number,
		width: number,
		fontSize: number,
		decoration: "underline" | "line-through",
		color: string,
	): void {
		const ctx = this.ctx;
		const thickness = Math.max(1, fontSize / 14);
		const y =
			decoration === "underline" ? baseline + fontSize * 0.12 : baseline - fontSize * 0.3;
		ctx.save();
		ctx.strokeStyle = color;
		ctx.lineWidth = thickness;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x + width, y);
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * Tokenizes every run (hard newlines, whitespace spans, words), greedily
	 * wraps them against `maxWidth`, and returns per-line token layout — the
	 * same algorithm SkiaAdapter uses for its non-uniform (mixed-style) path,
	 * used unconditionally here since there's no native fast path to fall
	 * back to for uniform text.
	 */
	private layoutStyledRuns(
		runs: TextRun[],
		style: TextStyle,
		maxWidth: number,
	): StyledLine[] {
		const ctx = this.ctx;
		const wrap = style.wrap;
		const lines: StyledLine[] = [];
		let current: StyledToken[] = [];

		const flush = () => {
			lines.push(makeLine(current));
			current = [];
		};

		for (const run of runs) {
			const merged = mergeInline(style, run.style);
			// Tokens: a hard newline, a whitespace span, or a word.
			const tokens = run.text.match(/\n|[^\S\n]+|\S+/g) ?? [];
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

	/** Sets the 2D context up to draw one run's text (font, color, letter-spacing). */
	private applyRunStyle(style: ResolvedInline): void {
		const ctx = this.ctx;
		const italic = style.fontStyle === "italic" ? "italic " : "";
		ctx.font = `${italic}${style.fontWeight} ${style.fontSize}px "${style.fontFamily}"`;
		ctx.fillStyle = style.color;
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.letterSpacing = `${style.letterSpacing}px`;
	}

	private applyStroke(stroke: Stroke): void {
		const ctx = this.ctx;
		ctx.strokeStyle = stroke.color;
		ctx.lineWidth = stroke.width;
		ctx.setLineDash(stroke.dash ?? []);
	}
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

function makeLine(tokens: StyledToken[]): StyledLine {
	const ascent = Math.max(0, ...tokens.map((t) => t.ascent));
	const descent = Math.max(0, ...tokens.map((t) => t.descent));
	const naturalHeight = ascent + descent;
	const requestedHeight = Math.max(0, ...tokens.map((t) => t.lineHeight));
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
	};
}
