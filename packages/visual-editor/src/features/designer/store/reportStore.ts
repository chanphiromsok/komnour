import {
	applyPatches,
	enablePatches,
	type Patch,
	produceWithPatches,
} from "immer";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { sampleReportDocument } from "@komnour/report/src/model/sample";
import { ReportDocumentSchema } from "@komnour/report/src/model/schema";
import {
	addNode as addNodeToTree,
	duplicateNode as duplicateSubtree,
	removeNode as removeNodeFromTree,
} from "@komnour/report/src/model/tree";
import type {
	Asset,
	Frame,
	NodeId,
	ReportDocument,
	ReportNode,
	ReportNodePatch,
	TextStyle,
} from "@komnour/report/src/model/types";
import { buildApiUrl } from "#/lib/apiBase";

enablePatches();

export type Tool = "select" | "pan";
export type Theme = "light" | "dark";

/** Matches the blue used for selection outlines/active toolbar states elsewhere (Tailwind blue-500). */
const DEFAULT_BOUND_FIELD_INDICATOR_COLOR = "#3b82f6";
/** Fallback text style for newly created text/checkbox-label nodes, overridable in Data binding > Editor settings. */
export const DEFAULT_FONT_FAMILY = "Inter";
export const DEFAULT_FONT_SIZE = 16;

/**
 * Plain module-level closure, not zustand state — DesignerCanvas replaces
 * this on mount with a function reading its own DOM refs (see
 * getSpawnCenter's doc comment on DesignerState). Kept outside the store so
 * swapping it never triggers a re-render on its own.
 */
let spawnCenterProvider: (() => { x: number; y: number } | null) | null = null;

/** A self-contained copy of a node and all its descendants, for the clipboard. */
interface ClipboardSubtree {
	rootId: NodeId;
	nodes: Record<NodeId, ReportNode>;
}

interface HistoryEntry {
	patches: Patch[];
	inversePatches: Patch[];
}

export interface DesignerState {
	document: ReportDocument;
	activePageId: NodeId | null;
	selection: NodeId[];
	tool: Tool;
	zoom: number;
	pan: { x: number; y: number };
	history: { past: HistoryEntry[]; future: HistoryEntry[] };
	/** Editor chrome theme (paper stays white in both). */
	theme: Theme;
	/**
	 * Tick color used ONLY in the canvas preview for a checkbox whose checked
	 * state comes from checkedBinding — a "this field is data-driven" visual
	 * aid while building a template. An editor-level setting (like theme),
	 * not part of any document: it persists across every document you open,
	 * and never affects what's actually exported (PDF/PNG always use the
	 * node's own designed checkColor, never this).
	 */
	boundFieldIndicatorColor: string;
	/**
	 * Font family/size newly created text nodes (and checkbox labels) start
	 * with — an editor-level default, not part of any document, same
	 * reasoning as boundFieldIndicatorColor above. Existing nodes are
	 * unaffected; this only applies at creation time.
	 */
	defaultFontFamily: string;
	defaultFontSize: number;

	toggleTheme: () => void;
	setBoundFieldIndicatorColor: (color: string) => void;
	setDefaultFontFamily: (family: string) => void;
	setDefaultFontSize: (size: number) => void;
	/**
	 * Where a newly created node should be centered, in the active page's
	 * document-local coordinates — near the pointer if it's currently over
	 * the canvas, otherwise the center of the visible viewport. `null` until
	 * DesignerCanvas mounts (it's the only thing with the DOM refs needed to
	 * compute this) and injects the real implementation; Toolbar's "Add
	 * ___" buttons call this the same way DesignerCanvas's own keyboard
	 * shortcuts do, since neither has access to the other's local refs.
	 * Session-only — never persisted, always re-injected on mount.
	 */
	getSpawnCenter: () => { x: number; y: number } | null;
	setSpawnCenterProvider: (provider: () => { x: number; y: number } | null) => void;
	setActivePageId: (pageId: NodeId) => void;
	/**
	 * JSON data used to resolve `{{path}}` bindings (preview + exports). Lives
	 * on `document.bindingData` — not a separate field — so it's part of the
	 * document's own JSON tree: downloading/copying/importing the document,
	 * or posting it to the server, carries its bound data automatically
	 * without a second payload alongside it. Routed through `commit()` so
	 * changing it is undoable like any other document edit.
	 */
	setBindingData: (data: Record<string, unknown> | null) => void;
	/** Replaces the whole document (e.g. JSON import) and resets selection/history/view. */
	loadDocument: (document: ReportDocument) => void;
	setSelection: (ids: NodeId[]) => void;
	toggleSelection: (id: NodeId) => void;
	clearSelection: () => void;
	setTool: (tool: Tool) => void;
	setZoom: (zoom: number) => void;
	setPan: (pan: { x: number; y: number }) => void;

	updateNodeFrame: (
		id: NodeId,
		patch: Pick<Frame, "x" | "y"> | Pick<Frame, "width" | "height">,
	) => void;
	updateNodeStyle: (id: NodeId, style: Partial<TextStyle>) => void;
	updateNodesStyle: (ids: NodeId[], style: Partial<TextStyle>) => void;
	updateNode: (id: NodeId, patch: ReportNodePatch) => void;
	setImageAsset: (
		nodeId: NodeId,
		url: string,
		metadata?: Pick<Asset, "width" | "height">,
	) => void;
	addNode: (node: ReportNode, parentId: NodeId | null) => void;
	removeNodes: (ids: NodeId[]) => void;
	duplicateNodes: (ids: NodeId[]) => void;
	/** Reparents a top-level node to another page, setting its new page-local frame position. */
	moveNodeToPage: (
		id: NodeId,
		targetPageId: NodeId,
		position: Pick<Frame, "x" | "y">,
	) => void;

	/** In-app clipboard (subtree snapshots); not the OS clipboard. */
	clipboard: ClipboardSubtree[] | null;
	copyNodes: (ids: NodeId[]) => void;
	/** Clones the clipboard onto the active page, offset and selected. */
	pasteNodes: () => void;

	undo: () => void;
	redo: () => void;
	canUndo: () => boolean;
	canRedo: () => boolean;

	verify: {
		status: "idle" | "loading" | "error";
		pngDataUrl: string | null;
		error?: string;
	};
	runVerifyRender: () => Promise<void>;
	clearVerify: () => void;
}

export const GRID_SIZE = 8;

export function snapToGrid(value: number): number {
	return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/** localStorage key for the persisted editor state. Bump PERSIST_VERSION when the persisted shape changes. */
const PERSIST_KEY = "komnour-visual-editor";
const PERSIST_VERSION = 1;

export const useDesignerStore = create<DesignerState>()(
	persist(
		(set, get) => {
			function commit(recipe: (draft: ReportDocument) => void) {
		const state = get();
		const [nextDocument, patches, inversePatches] = produceWithPatches(
			state.document,
			recipe,
		);
		if (patches.length === 0) return;
		set({
			document: nextDocument,
			history: {
				past: [...state.history.past, { patches, inversePatches }],
				future: [],
			},
		});
	}

	return {
		document: sampleReportDocument,
		activePageId: sampleReportDocument.pages[0] ?? null,
		selection: [],
		tool: "select",
		zoom: 1,
		pan: { x: 0, y: 0 },
		history: { past: [], future: [] },
		theme: "light",
		boundFieldIndicatorColor: DEFAULT_BOUND_FIELD_INDICATOR_COLOR,
		defaultFontFamily: DEFAULT_FONT_FAMILY,
		defaultFontSize: DEFAULT_FONT_SIZE,
		clipboard: null,
		verify: { status: "idle", pngDataUrl: null },

		toggleTheme: () =>
			set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
		setBoundFieldIndicatorColor: (color) =>
			set({ boundFieldIndicatorColor: color }),
		setDefaultFontFamily: (family) => set({ defaultFontFamily: family }),
		setDefaultFontSize: (size) => set({ defaultFontSize: size }),
		getSpawnCenter: () => spawnCenterProvider?.() ?? null,
		setSpawnCenterProvider: (provider) => {
			spawnCenterProvider = provider;
		},
		setActivePageId: (pageId) => set({ activePageId: pageId, selection: [] }),
		setBindingData: (data) => {
			commit((draft) => {
				draft.bindingData = data;
			});
		},
		loadDocument: (document) =>
			set({
				document,
				activePageId: document.pages[0] ?? null,
				selection: [],
				history: { past: [], future: [] },
				pan: { x: 0, y: 0 },
				zoom: 1,
			}),
		setSelection: (ids) => set({ selection: ids }),
		toggleSelection: (id) =>
			set((state) => ({
				selection: state.selection.includes(id)
					? state.selection.filter((selectedId) => selectedId !== id)
					: [...state.selection, id],
			})),
		clearSelection: () => set({ selection: [] }),
		setTool: (tool) => set({ tool }),
		setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.1, zoom)) }),
		setPan: (pan) => set({ pan }),

		updateNodeFrame: (id, patch) => {
			commit((draft) => {
				const node = draft.nodes[id];
				if (!node) return;
				Object.assign(node.frame, patch);
				// A line's endpoints are stored relative to its own frame (x1/y1 at
				// the frame's origin, x2/y2 at its far corner) so the frame stays a
				// real, hit-testable bounding box instead of always being 0×0.
				// Moving only shifts frame.x/y, which the translate in renderer.ts
				// already accounts for, but resizing changes frame.width/height and
				// must re-sync x2/y2 or the line would stop matching its bbox.
				if (node.type === "line") {
					node.x1 = 0;
					node.y1 = 0;
					node.x2 = node.frame.width;
					node.y2 = node.frame.height;
				}
			});
		},

		updateNodeStyle: (id, style) => {
			commit((draft) => {
				const node = draft.nodes[id];
				if (!node || node.type !== "text") return;
				Object.assign(node.style, style);
			});
		},

		updateNodesStyle: (ids, style) => {
			commit((draft) => {
				for (const id of ids) {
					const node = draft.nodes[id];
					if (!node || node.type !== "text") continue;
					Object.assign(node.style, style);
				}
			});
		},

		updateNode: (id, patch) => {
			commit((draft) => {
				const node = draft.nodes[id];
				if (!node) return;
				Object.assign(node, patch as Partial<ReportNode>);
			});
		},

		setImageAsset: (nodeId, url, metadata) => {
			commit((draft) => {
				const node = draft.nodes[nodeId];
				if (!node || node.type !== "image") return;
				const assetId = node.assetId || crypto.randomUUID();
				draft.assets[assetId] = { id: assetId, kind: "image", url, ...metadata };
				node.assetId = assetId;
			});
		},

		addNode: (node, parentId) => {
			commit((draft) => {
				const next = addNodeToTree(draft as ReportDocument, node, parentId);
				Object.assign(draft, next);
			});
			set({ selection: [node.id] });
		},

		removeNodes: (ids) => {
			commit((draft) => {
				let next = draft as ReportDocument;
				for (const id of ids) {
					if (!next.nodes[id]) continue;
					next = removeNodeFromTree(next, id);
				}
				Object.assign(draft, next);
			});
			const { document, activePageId } = get();
			set({
				selection: [],
				activePageId:
					activePageId && document.nodes[activePageId]
						? activePageId
						: (document.pages[0] ?? null),
			});
		},

		duplicateNodes: (ids) => {
			const newIds: NodeId[] = [];
			commit((draft) => {
				let next = draft as ReportDocument;
				for (const id of ids) {
					const original = next.nodes[id];
					if (!original) continue;
					// A tiny GRID_SIZE (8pt) nudge on both axes left the clone
					// almost exactly on top of the original — since the clone
					// renders last (on top, z-order-wise), it read as "duplicating
					// silently moved the original" rather than "a new copy
					// appeared". Offsetting straight down by the original's own
					// height instead puts the clone in an unambiguous new spot,
					// directly below, with the original completely untouched.
					const originalHeight = original.frame.height;
					const originalParentId = original.parentId;
					const beforeIds = new Set(Object.keys(next.nodes));
					next = duplicateSubtree(next, id, () => crypto.randomUUID());
					// Scoped to just this iteration's new ids — accumulating into
					// the outer `newIds` before this point would let `.find()`
					// below match a clone from a PREVIOUS id in a multi-select
					// duplicate whose parentId happened to coincide.
					const newIdsForThisNode = Object.keys(next.nodes).filter(
						(nid) => !beforeIds.has(nid),
					);
					newIds.push(...newIdsForThisNode);
					const clone = newIdsForThisNode
						.map((newId) => next.nodes[newId])
						.find((n) => n.parentId === originalParentId);
					if (clone) {
						clone.frame.y += originalHeight;
					}
				}
				Object.assign(draft, next);
			});
			if (newIds.length > 0) set({ selection: newIds });
		},

		moveNodeToPage: (id, targetPageId, position) => {
			commit((draft) => {
				const node = draft.nodes[id];
				const targetPage = draft.nodes[targetPageId];
				if (!node || !targetPage || targetPage.type !== "page") return;
				const oldParentId = node.parentId;
				if (oldParentId !== targetPageId) {
					const oldParent = oldParentId ? draft.nodes[oldParentId] : undefined;
					if (oldParent) {
						oldParent.children = oldParent.children.filter(
							(childId) => childId !== id,
						);
					}
					node.parentId = targetPageId;
					targetPage.children.push(id);
				}
				node.frame.x = position.x;
				node.frame.y = position.y;
			});
		},

		copyNodes: (ids) => {
			const { document } = get();
			const items: ClipboardSubtree[] = [];
			for (const id of ids) {
				const root = document.nodes[id];
				// Pages can't be nested into a page, so they aren't copyable here.
				if (!root || root.type === "page") continue;
				const nodes: Record<NodeId, ReportNode> = {};
				const collect = (nodeId: NodeId) => {
					const n = document.nodes[nodeId];
					if (!n) return;
					nodes[nodeId] = structuredClone(n);
					for (const childId of n.children) collect(childId);
				};
				collect(id);
				items.push({ rootId: id, nodes });
			}
			set({ clipboard: items.length > 0 ? items : null });
		},

		pasteNodes: () => {
			const { clipboard, activePageId } = get();
			if (!clipboard || !activePageId) return;
			const newRootIds: NodeId[] = [];
			commit((draft) => {
				if (!draft.nodes[activePageId]) return;
				let next = draft as ReportDocument;
				for (const item of clipboard) {
					const idMap = new Map<NodeId, NodeId>();
					const assignIds = (nodeId: NodeId) => {
						idMap.set(nodeId, crypto.randomUUID());
						for (const childId of item.nodes[nodeId].children)
							assignIds(childId);
					};
					assignIds(item.rootId);
					const insert = (srcId: NodeId, newParentId: NodeId) => {
						const src = item.nodes[srcId];
						const newId = idMap.get(srcId);
						if (!newId) return;
						const clone: ReportNode = {
							...structuredClone(src),
							id: newId,
							parentId: newParentId,
							children: [],
						};
						next = addNodeToTree(next, clone, newParentId);
						for (const childId of src.children) insert(childId, newId);
					};
					insert(item.rootId, activePageId);
					const newRootId = idMap.get(item.rootId);
					if (newRootId) {
						newRootIds.push(newRootId);
						// Offset so a paste is visibly distinct from the original.
						next.nodes[newRootId].frame.x += GRID_SIZE;
						next.nodes[newRootId].frame.y += GRID_SIZE;
					}
				}
				Object.assign(draft, next);
			});
			if (newRootIds.length > 0) set({ selection: newRootIds });
		},

		undo: () => {
			const state = get();
			const entry = state.history.past.at(-1);
			if (!entry) return;
			const nextDocument = applyPatches(state.document, entry.inversePatches);
			set({
				document: nextDocument,
				history: {
					past: state.history.past.slice(0, -1),
					future: [entry, ...state.history.future],
				},
			});
		},

		redo: () => {
			const state = get();
			const entry = state.history.future[0];
			if (!entry) return;
			const nextDocument = applyPatches(state.document, entry.patches);
			set({
				document: nextDocument,
				history: {
					past: [...state.history.past, entry],
					future: state.history.future.slice(1),
				},
			});
		},

		canUndo: () => get().history.past.length > 0,
		canRedo: () => get().history.future.length > 0,

		runVerifyRender: async () => {
			const state = get();
			if (!state.activePageId) return;
			const pageIndex = state.document.pages.indexOf(state.activePageId);
			if (pageIndex === -1) return;

			// An object URL pins its Blob in memory until explicitly revoked, even
			// once nothing references the URL string — so any previous verify PNG
			// must be revoked before it's replaced, not just left for the browser
			// to garbage-collect (it won't).
			if (state.verify.pngDataUrl) URL.revokeObjectURL(state.verify.pngDataUrl);
			set({ verify: { status: "loading", pngDataUrl: null } });
			try {
				// bindingData travels inside `document` itself — no separate `data`
				// field needed; the server falls back to document.bindingData when
				// one isn't explicitly given.
				const response = await fetch(buildApiUrl("/report/export/png"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						document: state.document,
						pageIndex,
					}),
				});
				if (!response.ok) {
					throw new Error(`Verify render failed: ${response.status}`);
				}
				const blob = await response.blob();
				// Re-read current state rather than reusing the `state` captured at
				// the top of this call — a second overlapping runVerifyRender (e.g.
				// a rapid double-click before this one resolved) may have set a
				// newer URL in the meantime, which must be revoked too, not clobbered.
				const staleUrl = get().verify.pngDataUrl;
				if (staleUrl) URL.revokeObjectURL(staleUrl);
				set({
					verify: {
						status: "idle",
						pngDataUrl: URL.createObjectURL(blob),
					},
				});
			} catch (error) {
				set({
					verify: {
						status: "error",
						pngDataUrl: null,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		},

		clearVerify: () => {
			const current = get().verify.pngDataUrl;
			if (current) URL.revokeObjectURL(current);
			set({ verify: { status: "idle", pngDataUrl: null } });
		},
	};
		},
		{
			name: PERSIST_KEY,
			version: PERSIST_VERSION,
			storage: createJSONStorage(() => localStorage),
			// Persist only durable data. Selection, tool, zoom/pan, undo history,
			// and the verify overlay (an object URL that dies with the tab) are
			// session-only and reset on reload.
			partialize: (state) => ({
				document: state.document,
				activePageId: state.activePageId,
				theme: state.theme,
				boundFieldIndicatorColor: state.boundFieldIndicatorColor,
				defaultFontFamily: state.defaultFontFamily,
				defaultFontSize: state.defaultFontSize,
			}),
			// Validate the persisted document before adopting it; a corrupt or
			// out-of-date entry falls back to the fresh sample rather than
			// crashing the editor on load.
			merge: (persisted, current) => {
				const saved = persisted as
					| {
							document?: unknown;
							/** Pre-migration shape: bindingData lived beside `document`, not inside it. */
							bindingData?: Record<string, unknown> | null;
							activePageId?: NodeId | null;
							theme?: Theme;
							boundFieldIndicatorColor?: string;
							defaultFontFamily?: string;
							defaultFontSize?: number;
					  }
					| undefined;
				const theme: Theme = saved?.theme === "dark" ? "dark" : "light";
				const boundFieldIndicatorColor =
					saved?.boundFieldIndicatorColor ?? DEFAULT_BOUND_FIELD_INDICATOR_COLOR;
				const defaultFontFamily = saved?.defaultFontFamily ?? DEFAULT_FONT_FAMILY;
				const defaultFontSize =
					typeof saved?.defaultFontSize === "number" && saved.defaultFontSize > 0
						? saved.defaultFontSize
						: DEFAULT_FONT_SIZE;
				const parsed = ReportDocumentSchema.safeParse(saved?.document);
				if (!parsed.success)
					return {
						...current,
						theme,
						boundFieldIndicatorColor,
						defaultFontFamily,
						defaultFontSize,
					};
				const document = parsed.data as ReportDocument;
				// Fold in the old sibling-field shape so upgrading doesn't drop it.
				if (document.bindingData === undefined && saved?.bindingData !== undefined) {
					document.bindingData = saved.bindingData;
				}
				const activePageId =
					saved?.activePageId && document.nodes[saved.activePageId]
						? saved.activePageId
						: (document.pages[0] ?? null);
				return {
					...current,
					document,
					activePageId,
					theme,
					boundFieldIndicatorColor,
					defaultFontFamily,
					defaultFontSize,
				};
			},
		},
	),
);
