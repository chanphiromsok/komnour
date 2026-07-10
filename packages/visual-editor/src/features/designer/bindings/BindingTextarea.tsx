import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import {
	type BindingSuggestion,
	bindingContextAt,
	filterSuggestions,
	flattenBindingPaths,
} from "./paths";

type TextareaProps = Omit<
	React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	"value" | "onChange"
>;

interface BindingTextareaProps extends TextareaProps {
	value: string;
	onValueChange: (value: string) => void;
	/** Called when a suggestion is committed with Enter, so the parent can avoid also handling Enter (e.g. commit-on-Enter overlays). */
	onCommitSuggestion?: () => void;
	/** Styling for the positioning wrapper (the suggestion dropdown anchors to it). */
	containerClassName?: string;
	containerStyle?: React.CSSProperties;
	textareaRef?: React.Ref<HTMLTextAreaElement>;
}

/**
 * A textarea that offers Figma-style `{{path}}` autocompletion. When the caret
 * is inside an unclosed `{{`, a dropdown lists paths flattened from the current
 * binding data (Toolbar → Data binding), filtered by what's typed. Selecting a
 * path inserts `{{path}}` and moves the caret past the closer.
 */
export function BindingTextarea({
	value,
	onValueChange,
	onCommitSuggestion,
	onKeyDown,
	containerClassName,
	containerStyle,
	textareaRef,
	...rest
}: BindingTextareaProps) {
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const allPaths = useMemo(
		() => flattenBindingPaths(bindingData),
		[bindingData],
	);
	const ref = useRef<HTMLTextAreaElement | null>(null);
	const [caret, setCaret] = useState<number | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);

	const context = caret === null ? null : bindingContextAt(value, caret);
	const suggestions =
		context && allPaths.length > 0
			? filterSuggestions(allPaths, context.query)
			: [];
	const open = context !== null && suggestions.length > 0;

	// Keep the highlighted row in range as the filtered list shrinks/grows.
	useLayoutEffect(() => {
		if (activeIndex >= suggestions.length) setActiveIndex(0);
	}, [suggestions.length, activeIndex]);

	function syncCaret() {
		const el = ref.current;
		if (el) setCaret(el.selectionStart);
	}

	function applySuggestion(suggestion: BindingSuggestion) {
		if (!context) return;
		const el = ref.current;
		const caretPos = el?.selectionStart ?? value.length;
		const before = value.slice(0, context.openIndex);
		const after = value.slice(caretPos);
		// A branch path keeps the binding open (trailing dot) so the user can
		// drill deeper; a leaf closes it with `}}`.
		const insert = suggestion.isBranch
			? `{{${context.prefix}${suggestion.path}.`
			: `{{${context.prefix}${suggestion.path}}}`;
		const nextValue = before + insert + after;
		const nextCaret = before.length + insert.length;
		onValueChange(nextValue);
		onCommitSuggestion?.();
		// Restore focus + caret after React re-renders the controlled value.
		requestAnimationFrame(() => {
			const node = ref.current;
			if (!node) return;
			node.focus();
			node.setSelectionRange(nextCaret, nextCaret);
			setCaret(nextCaret);
		});
	}

	function assignRef(node: HTMLTextAreaElement | null) {
		ref.current = node;
		if (typeof textareaRef === "function") textareaRef(node);
		else if (textareaRef) {
			(textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
				node;
		}
	}

	return (
		<div
			className={containerClassName ?? "relative"}
			style={containerStyle}
		>
			<textarea
				{...rest}
				ref={assignRef}
				value={value}
				onChange={(event) => {
					onValueChange(event.target.value);
					setCaret(event.target.selectionStart);
					setActiveIndex(0);
				}}
				onKeyUp={syncCaret}
				onClick={syncCaret}
				onFocus={syncCaret}
				onBlur={(event) => {
					// Delay so a mousedown on a suggestion row can fire first.
					window.setTimeout(() => setCaret(null), 120);
					rest.onBlur?.(event);
				}}
				onKeyDown={(event) => {
					if (open) {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActiveIndex((i) => (i + 1) % suggestions.length);
							return;
						}
						if (event.key === "ArrowUp") {
							event.preventDefault();
							setActiveIndex(
								(i) => (i - 1 + suggestions.length) % suggestions.length,
							);
							return;
						}
						if (event.key === "Enter" || event.key === "Tab") {
							event.preventDefault();
							applySuggestion(suggestions[activeIndex]);
							return;
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setCaret(null);
							return;
						}
					}
					onKeyDown?.(event);
				}}
			/>
			{open && (
				<ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
					{suggestions.map((suggestion, index) => (
						<li key={suggestion.path}>
							<button
								type="button"
								// onMouseDown (not onClick) so it beats the textarea blur.
								onMouseDown={(event) => {
									event.preventDefault();
									applySuggestion(suggestion);
								}}
								onMouseEnter={() => setActiveIndex(index)}
								className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs ${
									index === activeIndex
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
