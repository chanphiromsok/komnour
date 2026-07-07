import { useEffect, useRef } from "react";
import type { TextStyle } from "@komnour/report/src/model/types";
import type { AbsoluteFrame } from "./geometry";

interface TextEditOverlayProps {
	frame: AbsoluteFrame;
	style: TextStyle;
	initialValue: string;
	onCommit: (value: string) => void;
	onCancel: () => void;
}

/**
 * In-place text editing surface shown on double-click. A close visual match
 * to the node's style, not a pixel-identical stand-in for the Skia-rendered
 * text — same tradeoff every canvas-based design tool makes for its text
 * editing affordance. The exported/previewed result always comes from the
 * real renderer once this overlay commits back to the store.
 */
export function TextEditOverlay({
	frame,
	style,
	initialValue,
	onCommit,
	onCancel,
}: TextEditOverlayProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.focus();
		textarea.select();
	}, []);

	return (
		<textarea
			ref={textareaRef}
			defaultValue={initialValue}
			onClick={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				} else if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					onCommit(event.currentTarget.value);
				}
			}}
			onBlur={(event) => onCommit(event.currentTarget.value)}
			className="absolute resize-none overflow-hidden border border-blue-500 bg-white/95 outline-none"
			style={{
				left: frame.x,
				top: frame.y,
				width: frame.width,
				height: frame.height,
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				fontStyle: style.fontStyle,
				color: style.color,
				lineHeight: style.lineHeight,
				letterSpacing: style.letterSpacing,
				textAlign: style.align,
				textDecoration:
					style.decoration === "none" ? undefined : style.decoration,
				padding: 0,
			}}
		/>
	);
}
