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

