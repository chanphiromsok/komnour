import { useEffect, useRef, useState } from "react";
import {
	applyInlineStyleToRuns,
	inlineStyleAt,
	normalizeRuns,
	runsToText,
} from "@komnour/report/src/model/runs";
import type {
	InlineTextStyle,
	TextRun,
	TextStyle,
} from "@komnour/report/src/model/types";
import type { AbsoluteFrame } from "./geometry";
import {
	baseEditorStyle,
	getSelectionOffsets,
	renderRunsToElement,
	serializeElementToRuns,
	setSelectionOffsets,
	styleAtCaret,
} from "./richTextDom";

const FONT_FAMILIES = [
	"Inter",
	"Roboto",
	"Battambang",
	"Noto Sans Khmer",
	"Khmer OS Moul",
	"Wingdings 2",
];

interface TextEditOverlayProps {
	frame: AbsoluteFrame;
	style: TextStyle;
	initialRuns: TextRun[];
	onCommit: (result: { text: string; runs: TextRun[] }) => void;
	onCancel: () => void;
}

/**
 * In-place rich-text editor shown on double-click. A contentEditable surface
 * whose DOM mirrors the node's styled runs (see richTextDom), with a floating
 * toolbar that applies inline styling — bold / italic / underline / font /
 * color — to just the selected characters, which is what makes "select the
 * middle word and make it bold" work. The browser owns keystroke editing; on
 * commit we serialize the DOM back to runs. The exported/previewed result
 * always comes from the real Skia renderer, this is only the editing affordance.
 */
export function TextEditOverlay({
	frame,
	style,
	initialRuns,
	onCommit,
	onCancel,
}: TextEditOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const runsRef = useRef<TextRun[]>(initialRuns);
	const lastRangeRef = useRef<{ start: number; end: number } | null>(null);
	const committedRef = useRef(false);
	const [active, setActive] = useState<Partial<InlineTextStyle>>({});

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only setup; initialRuns is a snapshot
	useEffect(() => {
		const el = editorRef.current;
		if (!el) return;
		renderRunsToElement(el, initialRuns);
		el.focus();
		const range = document.createRange();
		range.selectNodeContents(el);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		syncActive();
	}, []);

	useEffect(() => {
		const handler = () => syncActive();
		document.addEventListener("selectionchange", handler);
		return () => document.removeEventListener("selectionchange", handler);
	}, []);

	function syncActive() {
		const el = editorRef.current;
		if (!el) return;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return;
		const range = selection.getRangeAt(0);
		if (!el.contains(range.startContainer) || !el.contains(range.endContainer))
			return;

		// The common case while typing is a collapsed caret — read the style
		// straight off the DOM at the caret instead of re-serializing the whole
		// editor into runs on every keystroke, which used to make typing cost
		// grow with the total text length instead of being O(1) per keystroke.
		if (selection.isCollapsed) {
			setActive(styleAtCaret(el, range.startContainer));
			return;
		}

		const offsets = getSelectionOffsets(el);
		const runs = normalizeRuns(serializeElementToRuns(el));
		runsRef.current = runs;
		if (offsets) {
			if (offsets.start !== offsets.end) lastRangeRef.current = offsets;
			setActive(inlineStyleAt(runs, offsets.start, offsets.end));
		}
	}

	function applyInline(patch: Partial<InlineTextStyle>) {
		const el = editorRef.current;
		if (!el) return;
		const live = getSelectionOffsets(el);
		const target =
			live && live.start !== live.end ? live : lastRangeRef.current;
		if (!target || target.start === target.end) return;
		const runs = serializeElementToRuns(el);
		const next = applyInlineStyleToRuns(runs, target.start, target.end, patch);
		runsRef.current = next;
		renderRunsToElement(el, next);
		setSelectionOffsets(el, target.start, target.end);
		el.focus();
		syncActive();
	}

	function commit() {
		if (committedRef.current) return;
		committedRef.current = true;
		const el = editorRef.current;
		const runs = normalizeRuns(
			el ? serializeElementToRuns(el) : runsRef.current,
		);
		onCommit({ text: runsToText(runs), runs });
	}

	const isBold = (active.fontWeight ?? style.fontWeight) >= 600;
	const isItalic = (active.fontStyle ?? style.fontStyle) === "italic";
	const isUnderline = (active.decoration ?? style.decoration) === "underline";
	const currentFamily = active.fontFamily ?? style.fontFamily;
	const currentColor = active.color ?? style.color;

	return (
		<div
			ref={containerRef}
			className="absolute"
			style={{
				left: frame.x,
				top: frame.y,
				width: frame.width,
				height: frame.height,
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			{/* Floating inline-style toolbar, anchored just above the text box. */}
			<div
				className="report-panel -top-10 absolute left-0 z-10 flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-1 py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<ToolbarButton
					active={isBold}
					label="Bold"
					onApply={() =>
						applyInline({ fontWeight: isBold ? 400 : 700 })
					}
				>
					<span className="font-bold">B</span>
				</ToolbarButton>
				<ToolbarButton
					active={isItalic}
					label="Italic"
					onApply={() =>
						applyInline({ fontStyle: isItalic ? "normal" : "italic" })
					}
				>
					<span className="italic">I</span>
				</ToolbarButton>
				<ToolbarButton
					active={isUnderline}
					label="Underline"
					onApply={() =>
						applyInline({ decoration: isUnderline ? "none" : "underline" })
					}
				>
					<span className="underline">U</span>
				</ToolbarButton>
				<div className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-600" />
				<select
					value={currentFamily}
					title="Font family of selection"
					onChange={(event) => applyInline({ fontFamily: event.target.value })}
					className="h-7 rounded border border-neutral-200 bg-white px-1 text-neutral-800 text-xs dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
				>
					{FONT_FAMILIES.map((family) => (
						<option key={family} value={family}>
							{family}
						</option>
					))}
				</select>
				<input
					type="color"
					value={toHexColor(currentColor)}
					title="Color of selection"
					onChange={(event) => applyInline({ color: event.target.value })}
					className="h-7 w-7 rounded border border-neutral-200 dark:border-neutral-600"
				/>
			</div>

			{/* biome-ignore lint/a11y/useFocusableInteractive: contentEditable is inherently focusable */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: rich-text editing surface */}
			<div
				ref={editorRef}
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline="true"
				tabIndex={0}
				onInput={syncActive}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Escape") {
						event.preventDefault();
						committedRef.current = true;
						onCancel();
					} else if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						commit();
					}
				}}
				onBlur={(event) => {
					// Focus moving to a toolbar control (font select, color picker)
					// isn't the end of editing — only commit when focus leaves the
					// whole overlay.
					const next = event.relatedTarget as Node | null;
					if (next && containerRef.current?.contains(next)) return;
					commit();
				}}
				className="h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words border border-blue-500 bg-white/95 outline-none"
				style={baseEditorStyle(style)}
			/>
		</div>
	);
}

function ToolbarButton({
	active,
	label,
	onApply,
	children,
}: {
	active: boolean;
	label: string;
	onApply: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			// preventDefault on mousedown keeps the text selection (and editor
			// focus) intact so the style applies to what the user highlighted.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onApply}
			className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
				active
					? "bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200"
					: "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
			}`}
		>
			{children}
		</button>
	);
}

/** `<input type=color>` only accepts #rrggbb; pass through valid hex, else fall back to black. */
function toHexColor(color: string): string {
	return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#000000";
}
