import type { PagePaper } from "../model/types";

export interface PaperSize {
	width: number;
	height: number;
}

const PORTRAIT_PRESET_SIZES: Record<
	Exclude<PagePaper["preset"], "Custom">,
	PaperSize
> = {
	A5: { width: 419.53, height: 595.28 },
	A4: { width: 595.28, height: 841.89 },
	A3: { width: 841.89, height: 1190.55 },
	Letter: { width: 612, height: 792 },
	Legal: { width: 612, height: 1008 },
};

export function resolvePaperSize(paper: PagePaper): PaperSize {
	const base: PaperSize =
		paper.preset === "Custom"
			? { width: paper.width ?? 0, height: paper.height ?? 0 }
			: PORTRAIT_PRESET_SIZES[paper.preset];

	if (paper.orientation === "landscape") {
		return {
			width: Math.max(base.width, base.height),
			height: Math.min(base.width, base.height),
		};
	}
	return {
		width: Math.min(base.width, base.height),
		height: Math.max(base.width, base.height),
	};
}
