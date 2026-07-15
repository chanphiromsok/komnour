import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	type BindingSuggestion,
	bindingContextAt,
	filterSuggestions,
	flattenBindingPaths,
} from "#/features/designer/bindings/paths";
import { useFontFamilies } from "#/features/designer/fonts/useFontFamilies";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { requiredTextHeight } from "#/features/designer/store/textMeasurement";
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
	stepBack,
	styleAtCaret,
	textBeforeCaret,
} from "./richTextDom";

interface TextEditOverlayProps {
	frame: AbsoluteFrame;
	rotation: number;
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
	rotation,
	style,
	initialRuns,
	onCommit,
	onCancel,
}: TextEditOverlayProps) {
	const fontFamilies = useFontFamilies();
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const runsRef = useRef<TextRun[]>(initialRuns);
	const lastRangeRef = useRef<{ start: number; end: number } | null>(null);
	const committedRef = useRef(false);
	const blurCommitFrameRef = useRef<number | null>(null);
	const [active, setActive] = useState<Partial<InlineTextStyle>>({});
	// Tracks the SAME height calculation the store applies on commit
	// (ensureTextFits/requiredTextHeight) — recomputed on every keystroke so
	// the box you're looking at while typing is already the size it'll
	// commit as: unchanged while the content fits the box's own height,
	// grown only when it genuinely overflows.
	const [liveHeight, setLiveHeight] = useState(frame.height);

	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const allBindingPaths = useMemo(
		() => flattenBindingPaths(bindingData),
		[bindingData],
	);
	// `distanceFromCaret` (not an absolute offset) is what lets applying a
	// suggestion locate the `{{` opener via a bounded backward DOM walk
	// (stepBack) instead of needing a document-wide linear offset.
	const [bindingQuery, setBindingQuery] = useState<{
		distanceFromCaret: number;
		prefix: string;
		query: string;
	} | null>(null);
	const [bindingActiveIndex, setBindingActiveIndex] = useState(0);

	const bindingSuggestions =
		bindingQuery && allBindingPaths.length > 0
			? filterSuggestions(allBindingPaths, bindingQuery.query)
			: [];
	const bindingOpen = bindingQuery !== null && bindingSuggestions.length > 0;

	// Keep the highlighted row in range as the filtered list shrinks/grows.
	useLayoutEffect(() => {
		if (bindingActiveIndex >= bindingSuggestions.length) setBindingActiveIndex(0);
	}, [bindingSuggestions.length, bindingActiveIndex]);

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
		updateLiveHeight();
	}, []);

	/**
	 * Re-measures with the exact same function (and the same padded formula)
	 * the store applies on commit — see the liveHeight state's own comment.
	 * Re-serializes fresh from the DOM every call rather than trusting
	 * runsRef.current, which syncActive only updates for a non-collapsed
	 * selection — the common case while just typing is a collapsed caret,
	 * where it's never touched.
	 */
	function updateLiveHeight() {
		const el = editorRef.current;
		if (!el) return;
		const runs = normalizeRuns(serializeElementToRuns(el));
		// Read directly off the store rather than subscribing via the
		// useDesignerStore hook — Object.values(...) allocates a new array
		// every call, and a selector that never returns a stable reference
		// makes React's useSyncExternalStore re-render in an infinite loop.
		// This only needs the current value at the moment of measurement, not
		// to react to it, so a plain non-subscribing read is exactly right.
		const customFonts = Object.values(useDesignerStore.getState().document.fonts);
		setLiveHeight(
			requiredTextHeight(
				{ text: runsToText(runs), runs, style, frame: { width: frame.width } },
				frame.height,
				customFonts,
			),
		);
	}

	useEffect(() => {
		const handler = () => syncActive();
		document.addEventListener("selectionchange", handler);
		return () => document.removeEventListener("selectionchange", handler);
	}, []);

	useEffect(() => {
		return () => {
			if (blurCommitFrameRef.current !== null) {
				cancelAnimationFrame(blurCommitFrameRef.current);
			}
		};
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

			// `{{path}}` binding autocomplete: bounded backward walk, so this
			// stays cheap regardless of total text length (same reasoning as
			// styleAtCaret above) — see textBeforeCaret's doc comment.
			const before = textBeforeCaret(el, range.startContainer, range.startOffset);
			const ctx = bindingContextAt(before, before.length);
			setBindingQuery(
				ctx
					? {
						distanceFromCaret: before.length - ctx.openIndex,
						prefix: ctx.prefix,
						query: ctx.query,
					}
					: null,
			);
			return;
		}

		setBindingQuery(null);
		const offsets = getSelectionOffsets(el);
		const runs = normalizeRuns(serializeElementToRuns(el));
		runsRef.current = runs;
		if (offsets) {
			if (offsets.start !== offsets.end) lastRangeRef.current = offsets;
			setActive(inlineStyleAt(runs, offsets.start, offsets.end));
		}
	}

	function applyBindingSuggestion(suggestion: BindingSuggestion) {
		const el = editorRef.current;
		const selection = window.getSelection();
		if (!el || !bindingQuery || !selection || selection.rangeCount === 0) return;
		const range = selection.getRangeAt(0);
		if (!range.collapsed) return;

		const openPos = stepBack(
			el,
			range.startContainer,
			range.startOffset,
			bindingQuery.distanceFromCaret,
		);
		// A branch path keeps the binding open (trailing dot) so the user can
		// drill deeper; a leaf closes it with `}}` — same convention as the
		// properties-panel BindingTextarea.
		const insertText = suggestion.isBranch
			? `{{${bindingQuery.prefix}${suggestion.path}.`
			: `{{${bindingQuery.prefix}${suggestion.path}}}`;

		const deleteRange = document.createRange();
		deleteRange.setStart(openPos.node, openPos.offset);
		deleteRange.setEnd(range.startContainer, range.startOffset);
		deleteRange.deleteContents();
		const textNode = document.createTextNode(insertText);
		deleteRange.insertNode(textNode);

		const caretRange = document.createRange();
		caretRange.setStart(textNode, textNode.length);
		caretRange.collapse(true);
		selection.removeAllRanges();
		selection.addRange(caretRange);

		setBindingQuery(null);
		el.focus();
		syncActive();
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

	// A native <input type="color"> fires its 'input' event continuously
	// while the user drags across the picker's gradient — dozens of times for
	// a single drag. applyInline does a full serialize + DOM teardown/rebuild
	// + re-selection sized to the whole document, so driving it off every one
	// of those events measured at 100+ ms per tick on a realistically large
	// selection: a one-second drag froze the tab for several seconds.
	//
	// Debouncing (rather than switching to the native 'change' event) keeps
	// this on the same event every browser already fires reliably for this
	// element — 'change' firing semantics for a native/OS color picker vary
	// enough across browsers that relying on it exclusively silently broke
	// color-on-selection entirely in practice. Debounced, a drag's rapid burst
	// collapses into exactly one applyInline call after the user stops moving,
	// with the same net result and no per-tick cost.
	const pendingColorRef = useRef<{
		value: string;
		timer: ReturnType<typeof setTimeout>;
	} | null>(null);

	function flushPendingColor() {
		const pending = pendingColorRef.current;
		if (!pending) return;
		clearTimeout(pending.timer);
		pendingColorRef.current = null;
		applyInline({ color: pending.value });
	}

	function handleColorChange(value: string) {
		if (pendingColorRef.current) clearTimeout(pendingColorRef.current.timer);
		const timer = setTimeout(() => {
			pendingColorRef.current = null;
			applyInline({ color: value });
		}, 150);
		pendingColorRef.current = { value, timer };
	}

	useEffect(() => {
		return () => {
			if (pendingColorRef.current) clearTimeout(pendingColorRef.current.timer);
		};
	}, []);

	function commit() {
		if (committedRef.current) return;
		// A color change still debouncing (e.g. the user picked a color and
		// immediately clicked away) must land in the DOM before it's read below
		// — otherwise a fast commit right after picking would silently drop it.
		flushPendingColor();
		committedRef.current = true;
		const el = editorRef.current;
		const runs = normalizeRuns(
			el ? serializeElementToRuns(el) : runsRef.current,
		);
		onCommit({ text: runsToText(runs), runs });
	}

	function cancelPendingBlurCommit() {
		if (blurCommitFrameRef.current === null) return;
		cancelAnimationFrame(blurCommitFrameRef.current);
		blurCommitFrameRef.current = null;
	}

	function scheduleBlurCommit() {
		cancelPendingBlurCommit();
		blurCommitFrameRef.current = requestAnimationFrame(() => {
			blurCommitFrameRef.current = null;
			const activeElement = document.activeElement;
			if (activeElement && containerRef.current?.contains(activeElement)) return;
			commit();
		});
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
				// minHeight, not a fixed height: liveHeight already tracks the same
				// calculation the store commits with, but this is still a floor,
				// not a hard cap — if the real DOM ever needs a hair more than that
				// estimate, natural block flow lets it grow instead of clipping.
				minHeight: liveHeight,
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
					{fontFamilies.map((family) => (
						<option key={family} value={family}>
							{family}
						</option>
					))}
				</select>
				<input
					type="color"
					value={toHexColor(currentColor)}
					title="Color of selection"
					onChange={(event) => handleColorChange(event.target.value)}
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
				onInput={() => {
					syncActive();
					updateLiveHeight();
				}}
				onFocus={cancelPendingBlurCommit}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (bindingOpen) {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setBindingActiveIndex((i) => (i + 1) % bindingSuggestions.length);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setBindingActiveIndex(
								(i) => (i - 1 + bindingSuggestions.length) % bindingSuggestions.length,
							);
							return;
						}
						if (event.key === "Enter" || event.key === "Tab") {
							event.preventDefault();
							applyBindingSuggestion(bindingSuggestions[bindingActiveIndex]);
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setBindingQuery(null);
							return;
						}
					}
					if (event.key === "Escape") {
						event.preventDefault();
						committedRef.current = true;
						onCancel();
					} else if (event.key === "Tab") {
						event.preventDefault();
						document.execCommand("insertText", false, "\t");
						syncActive();
					} else if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						commit();
					}
				}}
				onBlur={(event) => {
					// Focus moving to a toolbar control (font select, color picker)
					// isn't the end of editing — only commit when focus leaves the
					// whole overlay. Some browser/OS controls report relatedTarget as
					// null during focus handoff, so defer one frame and inspect the
					// settled activeElement instead of committing synchronously.
					const next = event.relatedTarget as Node | null;
					if (next && containerRef.current?.contains(next)) return;
					scheduleBlurCommit();
				}}
				// min-h-full (not h-full) and no overflow-hidden: the outer
				// container's minHeight already tracks liveHeight, but this stays
				// a floor here too rather than a hard clip — typed content that
				// (rarely) needs a hair more than the live estimate grows the box
				// via normal block flow instead of being silently hidden, which is
				// exactly the bug this replaced (edits invisible while focused,
				// only appearing once the box snapped to size on blur).
				//
				// The focus indicator is drawn with `outline` (in the inline style
				// below), not a `border` class — with this app's global
				// box-sizing:border-box, a border eats into the element's own
				// content box, narrowing the width actually available for text to
				// wrap in below the frame.width every measurement assumes. An
				// outline is drawn outside the box model entirely and never
				// affects layout, so the visible focus ring can't silently
				// squeeze the text it's framing.
				className="min-h-full w-full resize-none whitespace-pre-wrap break-words bg-white ring-4 ring-blue-500/15 selection:bg-blue-500/25"
				style={{
					...baseEditorStyle(style),
					outline: "2px solid #3b82f6",
					transform: rotation ? `rotate(${rotation}deg)` : undefined,
					transformOrigin: "center",
				}}
			/>

			{/* `{{path}}` binding autocomplete — anchored below the text box, same
			    convention as the properties-panel BindingTextarea's dropdown. */}
			{bindingOpen && (
				<ul
					className="absolute top-full left-0 z-20 mt-1 max-h-56 w-64 overflow-auto rounded border border-neutral-300 bg-white py-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
					onPointerDown={(event) => event.stopPropagation()}
				>
					{bindingSuggestions.map((suggestion, index) => (
						<li key={suggestion.path}>
							<button
								type="button"
								// onMouseDown (not onClick) so it beats the editor's blur.
								onMouseDown={(event) => {
									event.preventDefault();
									applyBindingSuggestion(suggestion);
								}}
								onMouseEnter={() => setBindingActiveIndex(index)}
								className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left ${
									index === bindingActiveIndex
										? "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
										: "text-neutral-700 dark:text-neutral-300"
								}`}
							>
								<span className="truncate font-mono">
									{suggestion.path}
									{suggestion.isBranch && (
										<span className="text-neutral-400">.</span>
									)}
								</span>
								<span className="shrink-0 truncate text-neutral-400">
									{suggestion.preview}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
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
