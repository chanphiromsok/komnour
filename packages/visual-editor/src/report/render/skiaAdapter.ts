import {
	Canvas,
	type CanvasRenderingContext2D,
	loadImage,
	Path2D,
} from "skia-canvas";
import { fitRect } from "../layout/fitRect";
import { verticalAlignOffset } from "../layout/verticalAlign";
import type { Stroke, TextStyle } from "../model/types";
import type {
	CircleOptions,
	PathOptions,
	RectOptions,
	RendererAdapter,
	ResolvedAsset,
	TextBlockMetrics,
} from "./adapter";

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

	private get context(): CanvasRenderingContext2D {
		if (!this.ctx)
			throw new Error("SkiaAdapter: beginPage() must be called before drawing");
		return this.ctx;
	}

	beginDocument(): void {}

	beginPage(size: { width: number; height: number }, background: string): void {
		if (!this.canvas) {
			this.canvas = new Canvas(size.width, size.height);
			this.ctx = this.canvas.getContext("2d");
		} else {
			this.ctx = this.canvas.newPage(size.width, size.height);
		}
		this.ctx.fillStyle = background;
		this.ctx.fillRect(0, 0, size.width, size.height);
	}

	endPage(): void {}

	async endDocument(): Promise<Uint8Array> {
		if (!this.canvas) return new Uint8Array();
		const buffer = await this.canvas.pdf;
		return new Uint8Array(buffer);
	}

	/** Renders just the current page (must be the only/last page drawn) to a PNG buffer. */
	async currentPageToPng(): Promise<Uint8Array> {
		if (!this.canvas) return new Uint8Array();
		const buffer = await this.canvas.png;
		return new Uint8Array(buffer);
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

	drawCircle(radius: number, opts: CircleOptions): void {
		const ctx = this.context;
		if (opts.fill) {
			ctx.fillStyle = opts.fill.color;
			ctx.beginPath();
			ctx.arc(radius, radius, radius, 0, Math.PI * 2);
			ctx.fill();
		}
		if (opts.stroke) {
			this.applyStroke(opts.stroke);
			ctx.beginPath();
			ctx.arc(radius, radius, radius, 0, Math.PI * 2);
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
		this.applyStroke(stroke);
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
		text: string,
		style: TextStyle,
		maxWidth: number,
	): TextBlockMetrics {
		const ctx = this.context;
		this.applyTextStyle(style);
		const metrics = ctx.measureText(text, style.wrap ? maxWidth : undefined);
		return {
			width: metrics.width,
			height: contentHeightOf(metrics),
			lineCount: metrics.lines.length,
		};
	}

	drawTextBlock(
		text: string,
		style: TextStyle,
		box: { width: number; height: number },
	): void {
		const ctx = this.context;
		this.applyTextStyle(style);
		const metrics = ctx.measureText(text, style.wrap ? box.width : undefined);
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
		ctx.fillText(text, x, yOffset, style.wrap ? box.width : undefined);
	}

	private applyStroke(stroke: Stroke): void {
		const ctx = this.context;
		ctx.strokeStyle = stroke.color;
		ctx.lineWidth = stroke.width;
		ctx.setLineDash(stroke.dash ?? []);
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
	const lastLine = metrics.lines.at(-1);
	return lastLine ? lastLine.y + lastLine.height : 0;
}
