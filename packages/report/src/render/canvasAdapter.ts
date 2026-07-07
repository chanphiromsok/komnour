import type {
	Canvas,
	CanvasKit,
	FontMgr,
	FontWeight,
	Paint as SkPaint,
	Surface,
} from "canvaskit-wasm";
import { fitRect } from "../layout/fitRect";
import { verticalAlignOffset } from "../layout/verticalAlign";
import type { Paint, Stroke, TextStyle } from "../model/types";
import type {
	CircleOptions,
	PathOptions,
	RectOptions,
	RendererAdapter,
	ResolvedAsset,
	TextBlockMetrics,
} from "./adapter";

/**
 * RendererAdapter backed by CanvasKit (WASM Skia) for the live browser
 * preview. Text shaping/wrapping is delegated entirely to CanvasKit's
 * Paragraph module (ICU + HarfBuzz) — never a hand-rolled wrap algorithm —
 * which is what makes correct Khmer line-breaking possible and what keeps
 * this in step with SkiaAdapter's use of skia-canvas's native text layout.
 */
export class CanvasAdapter implements RendererAdapter {
	private canvasKit: CanvasKit;
	private surface: Surface;
	private canvas: Canvas;
	private fontMgr: FontMgr;
	private opacityLayerStack: boolean[] = [];

	/**
	 * `pixelRatio` scales every subsequent draw call so the canvas's backing
	 * pixel buffer can be sized at `devicePixelRatio` for crisp rendering on
	 * HiDPI displays while every draw call still works in document points.
	 * Applied once here, before any renderer.ts save/restore pairs exist, so
	 * it composes transparently underneath them with no changes needed
	 * anywhere else. Export (SkiaAdapter) has no such concept — this is a
	 * browser-display-only concern, not part of the document/WYSIWYG model.
	 */
	constructor(
		canvasKit: CanvasKit,
		surface: Surface,
		fontMgr: FontMgr,
		pixelRatio = 1,
	) {
		this.canvasKit = canvasKit;
		this.surface = surface;
		this.canvas = surface.getCanvas();
		this.fontMgr = fontMgr;
		if (pixelRatio !== 1) this.canvas.scale(pixelRatio, pixelRatio);
	}

	beginDocument(): void {}

	beginPage(size: { width: number; height: number }, background: string): void {
		this.canvas.clear(this.canvasKit.WHITE);
		this.canvas.save();
		this.drawRect(size.width, size.height, { fill: { color: background } });
		this.canvas.restore();
	}

	endPage(): void {}

	endDocument(): undefined {
		this.surface.flush();
	}

	save(): void {
		this.canvas.save();
		this.opacityLayerStack.push(false);
	}

	restore(): void {
		const hadOpacityLayer = this.opacityLayerStack.pop() ?? false;
		this.canvas.restore();
		if (hadOpacityLayer) this.canvas.restore();
	}

	translate(x: number, y: number): void {
		this.canvas.translate(x, y);
	}

	rotate(degrees: number): void {
		this.canvas.rotate(degrees, 0, 0);
	}

	setOpacity(opacity: number): void {
		const paint = new this.canvasKit.Paint();
		paint.setAlphaf(opacity);
		this.canvas.saveLayer(paint);
		paint.delete();
		if (this.opacityLayerStack.length > 0) {
			this.opacityLayerStack[this.opacityLayerStack.length - 1] = true;
		}
	}

	clipRect(width: number, height: number, radius?: number): void {
		const rect = this.canvasKit.XYWHRect(0, 0, width, height);
		if (radius) {
			const rrect = this.canvasKit.RRectXY(rect, radius, radius);
			this.canvas.clipRRect(rrect, this.canvasKit.ClipOp.Intersect, true);
		} else {
			this.canvas.clipRect(rect, this.canvasKit.ClipOp.Intersect, true);
		}
	}

	drawRect(width: number, height: number, opts: RectOptions): void {
		const rect = this.canvasKit.XYWHRect(0, 0, width, height);
		if (opts.fill) {
			const paint = this.makeFillPaint(opts.fill);
			if (opts.radius) {
				this.canvas.drawRRect(
					this.canvasKit.RRectXY(rect, opts.radius, opts.radius),
					paint,
				);
			} else {
				this.canvas.drawRect(rect, paint);
			}
			paint.delete();
		}
		if (opts.stroke) {
			const paint = this.makeStrokePaint(opts.stroke);
			if (opts.radius) {
				this.canvas.drawRRect(
					this.canvasKit.RRectXY(rect, opts.radius, opts.radius),
					paint,
				);
			} else {
				this.canvas.drawRect(rect, paint);
			}
			paint.delete();
		}
	}

	drawEllipse(width: number, height: number, opts: CircleOptions): void {
		const oval = this.canvasKit.XYWHRect(0, 0, width, height);
		if (opts.fill) {
			const paint = this.makeFillPaint(opts.fill);
			this.canvas.drawOval(oval, paint);
			paint.delete();
		}
		if (opts.stroke) {
			const paint = this.makeStrokePaint(opts.stroke);
			this.canvas.drawOval(oval, paint);
			paint.delete();
		}
	}

	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		stroke: Stroke,
	): void {
		const paint = this.makeStrokePaint(stroke);
		this.canvas.drawLine(x1, y1, x2, y2, paint);
		paint.delete();
	}

	drawPath(d: string, opts: PathOptions): void {
		const path = this.canvasKit.Path.MakeFromSVGString(d);
		if (!path) return;
		if (opts.fill) {
			const paint = this.makeFillPaint(opts.fill);
			this.canvas.drawPath(path, paint);
			paint.delete();
		}
		if (opts.stroke) {
			const paint = this.makeStrokePaint(opts.stroke);
			this.canvas.drawPath(path, paint);
			paint.delete();
		}
		path.delete();
	}

	drawImage(
		asset: ResolvedAsset,
		width: number,
		height: number,
		fit: "contain" | "cover" | "fill",
	): void {
		const image = this.canvasKit.MakeImageFromEncoded(asset.bytes);
		if (!image) return;
		const src = this.canvasKit.XYWHRect(0, 0, asset.width, asset.height);
		const fitted = fitRect(asset.width, asset.height, width, height, fit);
		const dest = this.canvasKit.XYWHRect(
			fitted.x,
			fitted.y,
			fitted.width,
			fitted.height,
		);
		const paint = new this.canvasKit.Paint();
		this.canvas.drawImageRect(image, src, dest, paint, true);
		paint.delete();
		image.delete();
	}

	measureTextBlock(
		text: string,
		style: TextStyle,
		maxWidth: number,
	): TextBlockMetrics {
		const paragraph = this.buildParagraph(text, style, maxWidth);
		const metrics: TextBlockMetrics = {
			width: paragraph.getMaxWidth(),
			height: paragraph.getHeight(),
			lineCount: paragraph.getNumberOfLines(),
		};
		paragraph.delete();
		return metrics;
	}

	drawTextBlock(
		text: string,
		style: TextStyle,
		box: { width: number; height: number },
	): void {
		const paragraph = this.buildParagraph(text, style, box.width);
		const yOffset = verticalAlignOffset(
			box.height,
			paragraph.getHeight(),
			style.verticalAlign,
		);
		this.canvas.drawParagraph(paragraph, 0, yOffset);
		paragraph.delete();
	}

	private buildParagraph(text: string, style: TextStyle, maxWidth: number) {
		const paragraphStyle = new this.canvasKit.ParagraphStyle({
			textAlign: textAlignFor(this.canvasKit, style.align),
			textStyle: {
				color: this.canvasKit.parseColorString(style.color),
				fontFamilies: [style.fontFamily],
				fontSize: style.fontSize,
				fontStyle: {
					weight: { value: style.fontWeight } as FontWeight,
					slant:
						style.fontStyle === "italic"
							? this.canvasKit.FontSlant.Italic
							: this.canvasKit.FontSlant.Upright,
				},
				heightMultiplier: style.lineHeight,
				letterSpacing: style.letterSpacing,
				decoration: decorationFor(this.canvasKit, style.decoration),
			},
		});
		const builder = this.canvasKit.ParagraphBuilder.Make(
			paragraphStyle,
			this.fontMgr,
		);
		builder.addText(text);
		const paragraph = builder.build();
		paragraph.layout(style.wrap ? maxWidth : Number.POSITIVE_INFINITY);
		builder.delete();
		return paragraph;
	}

	private makeFillPaint(fill: Paint): SkPaint {
		const paint = new this.canvasKit.Paint();
		paint.setColor(this.canvasKit.parseColorString(fill.color));
		paint.setStyle(this.canvasKit.PaintStyle.Fill);
		paint.setAntiAlias(true);
		return paint;
	}

	private makeStrokePaint(stroke: Stroke): SkPaint {
		const paint = new this.canvasKit.Paint();
		paint.setColor(this.canvasKit.parseColorString(stroke.color));
		paint.setStyle(this.canvasKit.PaintStyle.Stroke);
		paint.setStrokeWidth(stroke.width);
		paint.setAntiAlias(true);
		return paint;
	}
}

function textAlignFor(canvasKit: CanvasKit, align: TextStyle["align"]) {
	switch (align) {
		case "left":
			return canvasKit.TextAlign.Left;
		case "center":
			return canvasKit.TextAlign.Center;
		case "right":
			return canvasKit.TextAlign.Right;
	}
}

function decorationFor(
	canvasKit: CanvasKit,
	decoration: TextStyle["decoration"],
): number {
	switch (decoration) {
		case "underline":
			return canvasKit.UnderlineDecoration;
		case "line-through":
			return canvasKit.LineThroughDecoration;
		default:
			return canvasKit.NoDecoration;
	}
}
