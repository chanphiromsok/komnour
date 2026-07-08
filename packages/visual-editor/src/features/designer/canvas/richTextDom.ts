import type { CSSProperties } from "react";
import type {
	InlineTextStyle,
	TextRun,
	TextStyle,
} from "@komnour/report/src/model/types";

/**
 * DOM glue for the contentEditable rich-text editor. Keeps the styled-run
 * model (TextRun[]) and the browser's editable DOM in sync in both directions
 * without React reconciling the editable subtree (which fights contentEditable).
 *
 * Encoding: a run with inline overrides becomes a <span data-style="{json}">;
 * an unstyled run is a bare text node; "\n" becomes <br>. The JSON in
 * data-style is the source of truth on the way back out, so the visual inline
 * CSS on the span is purely cosmetic and never re-parsed.
 */


/** Length in linear characters a node contributes (text length, 1 per <br>, recursive for elements). */
function nodeLength(node: Node): number {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
	if (node.nodeName === "BR") return 1;
	let total = 0;
	node.childNodes.forEach((child) => {
		total += nodeLength(child);
	});
	return total;
}

/** Apply a run's overrides as cosmetic inline CSS so the span looks right while editing. */
function applyInlineCss(span: HTMLSpanElement, style: Partial<InlineTextStyle>) {
	if (style.fontFamily) span.style.fontFamily = `"${style.fontFamily}"`;
	if (style.fontSize !== undefined) span.style.fontSize = `${style.fontSize}px`;
	if (style.fontWeight !== undefined)
		span.style.fontWeight = String(style.fontWeight);
	if (style.fontStyle) span.style.fontStyle = style.fontStyle;
	if (style.color) span.style.color = style.color;
	if (style.letterSpacing !== undefined)
		span.style.letterSpacing = `${style.letterSpacing}px`;
	if (style.decoration && style.decoration !== "none")
		span.style.textDecoration = style.decoration;
}

/** Drop undefined keys; return undefined when nothing is left. */
function cleanStyle(
	style: Partial<InlineTextStyle> | undefined,
): Partial<InlineTextStyle> | undefined {
	if (!style) return undefined;
	const entries = Object.entries(style).filter(([, v]) => v !== undefined);
	return entries.length > 0
		? (Object.fromEntries(entries) as Partial<InlineTextStyle>)
		: undefined;
}

/** (Re)build the editor's DOM from runs. Replaces all children. */
export function renderRunsToElement(el: HTMLElement, runs: TextRun[]): void {
	el.textContent = "";
	for (const run of runs) {
		const style = cleanStyle(run.style);
		// A run's text can contain newlines; each becomes a <br>.
		const segments = run.text.split("\n");
		segments.forEach((segment, index) => {
			if (index > 0) el.appendChild(document.createElement("br"));
			if (segment.length === 0) return;
			if (style) {
				const span = document.createElement("span");
				span.dataset.style = JSON.stringify(style);
				applyInlineCss(span, style);
				span.textContent = segment;
				el.appendChild(span);
			} else {
				el.appendChild(document.createTextNode(segment));
			}
		});
	}
	// contentEditable needs at least a <br> to hold a caret when empty.
	if (el.childNodes.length === 0) el.appendChild(document.createElement("br"));
}

/** Read the editor DOM back into runs, decoding data-style spans. */
export function serializeElementToRuns(el: HTMLElement): TextRun[] {
	const runs: TextRun[] = [];

	const walk = (node: Node, inherited: Partial<InlineTextStyle> | undefined) => {
		node.childNodes.forEach((child) => {
			if (child.nodeType === Node.TEXT_NODE) {
				// The browser inserts NBSP for typed spaces at edges; normalize back.
				const text = (child.textContent ?? "").replace(/\u00A0/g, " ");
				if (text.length > 0) runs.push({ text, style: inherited });
			} else if (child.nodeName === "BR") {
				runs.push({ text: "\n" });
			} else if (child instanceof HTMLElement) {
				let style = inherited;
				const raw = child.dataset.style;
				if (raw) {
					try {
						style = JSON.parse(raw) as Partial<InlineTextStyle>;
					} catch {
						style = inherited;
					}
				}
				// A block element (browsers wrap lines in <div> on Enter) is a break.
				const isBlock = child.nodeName === "DIV" || child.nodeName === "P";
				if (isBlock && runs.length > 0) runs.push({ text: "\n" });
				walk(child, style);
			}
		});
	};

	walk(el, undefined);
	return runs;
}

/**
 * Inline style in effect at a collapsed caret, read directly off the DOM
 * ancestor chain (data-style spans encode a run's overrides — see the module
 * doc). O(caret depth), not O(document length): unlike `serializeElementToRuns`
 * + `inlineStyleAt`, this doesn't walk the whole editor, so it's cheap enough
 * to call on every keystroke while typing in a large text block.
 */
export function styleAtCaret(
	el: HTMLElement,
	container: Node,
): Partial<InlineTextStyle> {
	let node: Node | null =
		container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
	while (node) {
		if (node instanceof HTMLElement && node.dataset.style) {
			try {
				return JSON.parse(node.dataset.style) as Partial<InlineTextStyle>;
			} catch {
				return {};
			}
		}
		if (node === el) break;
		node = node.parentElement;
	}
	return {};
}

/**
 * Text immediately before (container, offset), walking backward through
 * preceding siblings/ancestors up to `maxChars` characters or the editor
 * root, whichever comes first. Used for `{{path}}` binding autocomplete,
 * which only ever needs to see a short local window to find an unclosed
 * `{{` — bounded like this, it's cheap to call on every keystroke regardless
 * of total document length (same reasoning as `styleAtCaret` above).
 */
export function textBeforeCaret(
	el: HTMLElement,
	container: Node,
	offset: number,
	maxChars = 300,
): string {
	const parts: string[] = [];
	let collected = 0;

	function pushText(text: string) {
		parts.unshift(text);
		collected += text.length;
	}

	if (container.nodeType === Node.TEXT_NODE) {
		pushText((container.textContent ?? "").slice(0, offset));
	}

	let sibling: Node | null =
		container.nodeType === Node.TEXT_NODE
			? container.previousSibling
			: (container.childNodes[offset - 1] ?? null);
	let ancestor: Node | null =
		container.nodeType === Node.TEXT_NODE ? container.parentNode : container;

	while (ancestor && collected < maxChars) {
		while (sibling && collected < maxChars) {
			pushText(sibling.nodeName === "BR" ? "\n" : (sibling.textContent ?? ""));
			sibling = sibling.previousSibling;
		}
		if (ancestor === el) break;
		sibling = ancestor.previousSibling;
		ancestor = ancestor.parentNode;
	}

	const joined = parts.join("");
	return joined.length > maxChars
		? joined.slice(joined.length - maxChars)
		: joined;
}

/**
 * DOM position `count` characters before (container, offset) — the inverse of
 * `textBeforeCaret`'s walk. Used to find where a `{{` opener starts so it (and
 * the partial path after it) can be replaced when a binding suggestion is
 * applied. Bounded the same way: only ever walks back as far as `count`
 * requires, not the whole document.
 */
export function stepBack(
	el: HTMLElement,
	container: Node,
	offset: number,
	count: number,
): { node: Node; offset: number } {
	let remaining = count;

	if (container.nodeType === Node.TEXT_NODE) {
		if (remaining <= offset) return { node: container, offset: offset - remaining };
		remaining -= offset;
	}

	let sibling: Node | null =
		container.nodeType === Node.TEXT_NODE
			? container.previousSibling
			: (container.childNodes[offset - 1] ?? null);
	let ancestor: Node | null =
		container.nodeType === Node.TEXT_NODE ? container.parentNode : container;

	while (ancestor) {
		while (sibling) {
			const isBr = sibling.nodeName === "BR";
			const len = isBr ? 1 : (sibling.textContent ?? "").length;
			if (remaining <= len) {
				if (sibling.nodeType === Node.TEXT_NODE) {
					return { node: sibling, offset: len - remaining };
				}
				// A styled <span> (single text child, per renderRunsToElement) or a
				// <br> — descend into the span's text, or land at the sibling's own
				// boundary if there's nothing to descend into.
				const textChild = sibling.firstChild;
				if (!isBr && textChild?.nodeType === Node.TEXT_NODE) {
					return {
						node: textChild,
						offset: (textChild.textContent ?? "").length - remaining,
					};
				}
				return { node: sibling, offset: 0 };
			}
			remaining -= len;
			sibling = sibling.previousSibling;
		}
		if (ancestor === el) return { node: el, offset: 0 };
		sibling = ancestor.previousSibling;
		ancestor = ancestor.parentNode;
	}
	return { node: el, offset: 0 };
}

/** Current selection as linear character offsets within the editor, or null if none/outside. */
export function getSelectionOffsets(
	el: HTMLElement,
): { start: number; end: number } | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	if (
		!el.contains(range.startContainer) ||
		!el.contains(range.endContainer)
	)
		return null;
	const a = linearOffset(el, range.startContainer, range.startOffset);
	const b = linearOffset(el, range.endContainer, range.endOffset);
	return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** Linear char offset of a (container, offset) DOM position within root. */
function linearOffset(root: HTMLElement, container: Node, offset: number): number {
	let count = 0;
	let found = -1;

	const recurse = (node: Node): boolean => {
		if (node === container) {
			if (node.nodeType === Node.TEXT_NODE) {
				found = count + offset;
			} else {
				let local = count;
				for (let i = 0; i < offset && i < node.childNodes.length; i++) {
					local += nodeLength(node.childNodes[i]);
				}
				found = local;
			}
			return true;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			count += node.textContent?.length ?? 0;
			return false;
		}
		if (node.nodeName === "BR") {
			count += 1;
			return false;
		}
		for (const child of Array.from(node.childNodes)) {
			if (recurse(child)) return true;
		}
		return false;
	};

	recurse(root);
	return found >= 0 ? found : count;
}

/** Restore a selection given linear char offsets (used after re-rendering runs). */
export function setSelectionOffsets(
	el: HTMLElement,
	start: number,
	end: number,
): void {
	const startPos = locate(el, start);
	const endPos = locate(el, end);
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.setStart(startPos.node, startPos.offset);
	range.setEnd(endPos.node, endPos.offset);
	selection.removeAllRanges();
	selection.addRange(range);
}

function locate(
	root: HTMLElement,
	index: number,
): { node: Node; offset: number } {
	let count = 0;
	let result: { node: Node; offset: number } | null = null;

	const recurse = (node: Node): boolean => {
		if (node.nodeType === Node.TEXT_NODE) {
			const len = node.textContent?.length ?? 0;
			if (index <= count + len) {
				result = { node, offset: index - count };
				return true;
			}
			count += len;
			return false;
		}
		if (node.nodeName === "BR") {
			if (index <= count && node.parentNode) {
				const siblings = Array.from(node.parentNode.childNodes);
				result = {
					node: node.parentNode,
					offset: siblings.indexOf(node as ChildNode),
				};
				return true;
			}
			count += 1;
			return false;
		}
		for (const child of Array.from(node.childNodes)) {
			if (recurse(child)) return true;
		}
		return false;
	};

	recurse(root);
	if (!result) result = { node: root, offset: root.childNodes.length };
	return result;
}

/** The style CSS to put on the editor container so bare text nodes render in the base style. */
export function baseEditorStyle(style: TextStyle): CSSProperties {
	return {
		fontFamily: `"${style.fontFamily}"`,
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		fontStyle: style.fontStyle,
		color: style.color,
		lineHeight: style.lineHeight,
		letterSpacing: style.letterSpacing,
		textAlign: style.align,
		textDecoration: style.decoration === "none" ? undefined : style.decoration,
		padding: 0,
	};
}

