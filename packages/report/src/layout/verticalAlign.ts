import type { TextStyle } from "../model/types";

export function verticalAlignOffset(
	boxHeight: number,
	contentHeight: number,
	verticalAlign: TextStyle["verticalAlign"],
): number {
	switch (verticalAlign) {
		case "top":
			return 0;
		case "middle":
			return (boxHeight - contentHeight) / 2;
		case "bottom":
			return boxHeight - contentHeight;
	}
}
