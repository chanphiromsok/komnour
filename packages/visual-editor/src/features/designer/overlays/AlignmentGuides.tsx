import type { AbsoluteFrame } from "#/features/designer/canvas/geometry";

/**
 * Snap radius in SCREEN pixels. Dividing by the current zoom converts it to
 * document points, so the magnetic pull covers the same distance under the
 * cursor whether the user is at 25% or 400% — a fixed document-space
 * threshold would feel sticky when zoomed in and useless when zoomed out.
 */
const SNAP_THRESHOLD_PX = 6;

/**
 * How close two anchor positions must be (in document points), AFTER the snap
 * correction is applied, to count as "aligned" and earn a guide line. This is
 * only a float-noise tolerance — snapping makes the matched pair exactly
 * equal, and any other pair either coincides too or isn't aligned at all.
 */
const GUIDE_EPSILON = 0.01;

export interface AlignmentSnapResult {
	/** The dragged frame with snap corrections applied (same coordinate space as the inputs). */
	frame: AbsoluteFrame;
	/** Line positions where a dragged anchor now exactly meets a sibling anchor. */
	guides: { vertical: number[]; horizontal: number[] };
	/** Per-axis: whether smart alignment claimed this axis. When false, the caller may apply its own fallback (e.g. grid snapping). */
	snappedX: boolean;
	snappedY: boolean;
}

/** A frame's three snap anchors along one axis: start edge, center, end edge. */
function axisAnchors(start: number, size: number): number[] {
	return [start, start + size / 2, start + size];
}

/**
 * One axis of smart snapping: finds the nearest sibling-anchor ↔ dragged-anchor
 * pair within `threshold` (any of the 9 start/center/end combinations), and
 * returns the position correction that makes them exactly coincide, plus every
 * guide line that alignment produces. Null when nothing is in range.
 */
function snapAxis(
	draggedAnchors: number[],
	siblingAnchorLists: number[][],
	threshold: number,
): { correction: number; guides: number[] } | null {
	let bestDelta: number | null = null;
	for (const anchors of siblingAnchorLists) {
		for (const siblingAnchor of anchors) {
			for (const draggedAnchor of draggedAnchors) {
				const delta = siblingAnchor - draggedAnchor;
				if (
					Math.abs(delta) <= threshold &&
					(bestDelta === null || Math.abs(delta) < Math.abs(bestDelta))
				) {
					bestDelta = delta;
				}
			}
		}
	}
	if (bestDelta === null) return null;

	// With the correction applied, collect every sibling anchor a dragged
	// anchor now sits exactly on — the winning pair by construction, plus any
	// others that happen to coincide (e.g. equal-size shapes align both edges
	// at once). Guides are drawn only where snapping actually landed.
	const guides = new Set<number>();
	for (const anchors of siblingAnchorLists) {
		for (const siblingAnchor of anchors) {
			for (const draggedAnchor of draggedAnchors) {
				if (Math.abs(siblingAnchor - (draggedAnchor + bestDelta)) < GUIDE_EPSILON)
					guides.add(siblingAnchor);
			}
		}
	}
	return { correction: bestDelta, guides: [...guides] };
}

/**
 * Figma-style smart alignment for a dragged frame: snaps it to the nearest
 * sibling edge/center within a zoom-invariant screen-space radius and reports
 * the guide lines at exactly the positions where snapping occurred. Each axis
 * snaps independently (X can lock to a sibling while Y stays free). All
 * frames must be in the same coordinate space — pass absolute frames and
 * convert the result back to the parent's local space at the call site, so
 * this keeps working when nested groups/frames arrive.
 */
export function computeAlignmentSnap(
	siblingFrames: AbsoluteFrame[],
	dragged: AbsoluteFrame,
	zoom: number,
): AlignmentSnapResult {
	const threshold = SNAP_THRESHOLD_PX / zoom;
	const xSnap = snapAxis(
		axisAnchors(dragged.x, dragged.width),
		siblingFrames.map((s) => axisAnchors(s.x, s.width)),
		threshold,
	);
	const ySnap = snapAxis(
		axisAnchors(dragged.y, dragged.height),
		siblingFrames.map((s) => axisAnchors(s.y, s.height)),
		threshold,
	);
	return {
		frame: {
			...dragged,
			x: dragged.x + (xSnap?.correction ?? 0),
			y: dragged.y + (ySnap?.correction ?? 0),
		},
		guides: {
			vertical: xSnap?.guides ?? [],
			horizontal: ySnap?.guides ?? [],
		},
		snappedX: xSnap !== null,
		snappedY: ySnap !== null,
	};
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
