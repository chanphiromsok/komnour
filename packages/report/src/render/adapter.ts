import type { Paint, Stroke, TextStyle } from "../model/types";

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
	drawCircle(radius: number, opts: CircleOptions): void;
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

	measureTextBlock(
		text: string,
		style: TextStyle,
		maxWidth: number,
	): TextBlockMetrics;
	drawTextBlock(
		text: string,
		style: TextStyle,
		box: { width: number; height: number },
	): void;
}
