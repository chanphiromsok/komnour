export interface FittedRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Computes the destination rect for drawing a `srcWidth x srcHeight` image into a `destWidth x destHeight` box under the given fit mode. Shared by every adapter so image placement math is never duplicated. */
export function fitRect(
	srcWidth: number,
	srcHeight: number,
	destWidth: number,
	destHeight: number,
	fit: "contain" | "cover" | "fill",
): FittedRect {
	if (fit === "fill" || srcWidth === 0 || srcHeight === 0) {
		return { x: 0, y: 0, width: destWidth, height: destHeight };
	}
	const srcRatio = srcWidth / srcHeight;
	const destRatio = destWidth / destHeight;
	const scale =
		fit === "contain"
			? srcRatio > destRatio
				? destWidth / srcWidth
				: destHeight / srcHeight
			: srcRatio > destRatio
				? destHeight / srcHeight
				: destWidth / srcWidth;
	const width = srcWidth * scale;
	const height = srcHeight * scale;
	return {
		x: (destWidth - width) / 2,
		y: (destHeight - height) / 2,
		width,
		height,
	};
}
