import type { AbsoluteFrame } from "#/features/designer/canvas/geometry";

const THRESHOLD = 4;

export function computeAlignmentGuides(
	siblingFrames: AbsoluteFrame[],
	dragged: AbsoluteFrame,
): { vertical: number[]; horizontal: number[] } {
	const verticalSet = new Set<number>();
	const horizontalSet = new Set<number>();
	const draggedXs = [
		dragged.x,
		dragged.x + dragged.width / 2,
		dragged.x + dragged.width,
	];
	const draggedYs = [
		dragged.y,
		dragged.y + dragged.height / 2,
		dragged.y + dragged.height,
	];

	for (const sibling of siblingFrames) {
		const siblingXs = [
			sibling.x,
			sibling.x + sibling.width / 2,
			sibling.x + sibling.width,
		];
		const siblingYs = [
			sibling.y,
			sibling.y + sibling.height / 2,
			sibling.y + sibling.height,
		];
		for (const dx of draggedXs) {
			for (const sx of siblingXs) {
				if (Math.abs(dx - sx) < THRESHOLD) verticalSet.add(sx);
			}
		}
		for (const dy of draggedYs) {
			for (const sy of siblingYs) {
				if (Math.abs(dy - sy) < THRESHOLD) horizontalSet.add(sy);
			}
		}
	}

	return { vertical: [...verticalSet], horizontal: [...horizontalSet] };
}

interface AlignmentGuidesProps {
	guides: { vertical: number[]; horizontal: number[] };
	pageSize: { width: number; height: number };
}

export function AlignmentGuides({ guides, pageSize }: AlignmentGuidesProps) {
	return (
		<div className="pointer-events-none absolute inset-0">
			{guides.vertical.map((x) => (
				<div
					key={`v-${x}`}
					className="absolute bg-pink-500"
					style={{ left: x, top: 0, width: 1, height: pageSize.height }}
				/>
			))}
			{guides.horizontal.map((y) => (
				<div
					key={`h-${y}`}
					className="absolute bg-pink-500"
					style={{ left: 0, top: y, width: pageSize.width, height: 1 }}
				/>
			))}
		</div>
	);
}
