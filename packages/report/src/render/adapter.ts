import type { Paint, Stroke, TextRun, TextStyle } from "../model/types";

export interface ResolvedAsset {
	bytes: Uint8Array;
	width: number;
	height: number;
}

export interface RectOptions {
	fill?: Paint;
	stroke?: Stroke;
	radius?: number;
}

export interface CircleOptions {
	fill?: Paint;
	stroke?: Stroke;
}

export interface PathOptions {
	fill?: Paint;
	stroke?: Stroke;
}

export interface TextBlockMetrics {
	width: number;
	height: number;
	lineCount: number;
}

/**
 * Backend-agnostic drawing surface. CanvasAdapter (CanvasKit, browser) and
 * SkiaAdapter (skia-canvas, server) each implement this once; renderer.ts
 * calls only through this interface so the two backends never diverge in
 * what gets drawn, only in how.
 */
export interface RendererAdapter {
	beginDocument(): void | Promise<void>;
	beginPage(size: { width: number; height: number }, background: string): void;
	endPage(): void;
	endDocument(): Uint8Array | Promise<Uint8Array> | undefined;

	save(): void;
	restore(): void;
	translate(x: number, y: number): void;
	rotate(degrees: number): void;
	setOpacity(opacity: number): void;
	clipRect(width: number, height: number, radius?: number): void;

	drawRect(width: number, height: number, opts: RectOptions): void;
	/** Draws an ellipse filling the box (0,0,width,height); a square box yields a circle. */
	drawEllipse(width: number, height: number, opts: CircleOptions): void;
	drawLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		stroke: Stroke,
	): void;
	drawPath(d: string, opts: PathOptions): void;
	drawImage(
		asset: ResolvedAsset,
		width: number,
		height: number,
		fit: "contain" | "cover" | "fill",
	): void | Promise<void>;

	/**
	 * Text is passed as styled runs (see resolveRuns): `style` is the paragraph's
	 * base/block style and each run's optional `style` overrides it for that span.
	 * An unstyled node is a single run with no overrides.
	 */
	measureTextBlock(
		runs: TextRun[],
		style: TextStyle,
		maxWidth: number,
	): TextBlockMetrics;
	drawTextBlock(
		runs: TextRun[],
		style: TextStyle,
		box: { width: number; height: number },
	): void;
}
