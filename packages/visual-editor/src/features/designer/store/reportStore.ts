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
	getNode,
	removeNode as removeNodeFromTree,
} from "@komnour/report/src/model/tree";
import type {
	Frame,
	NodeId,
	ReportDocument,
	ReportNode,
	ReportNodePatch,
	TextStyle,
} from "@komnour/report/src/model/types";

enablePatches();

const API_BASE_URL: string =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export type Tool = "select" | "pan";

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
	/** JSON data used to resolve `{{path}}` bindings in text nodes (preview + exports). */
	bindingData: Record<string, unknown> | null;

	setActivePageId: (pageId: NodeId) => void;
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
	updateNode: (id: NodeId, patch: ReportNodePatch) => void;
	setImageAsset: (nodeId: NodeId, url: string) => void;
	addNode: (node: ReportNode, parentId: NodeId | null) => void;
	removeNodes: (ids: NodeId[]) => void;
	duplicateNodes: (ids: NodeId[]) => void;

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
		bindingData: null,
		verify: { status: "idle", pngDataUrl: null },

		setActivePageId: (pageId) => set({ activePageId: pageId, selection: [] }),
		setBindingData: (data) => set({ bindingData: data }),
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
			});
		},

		updateNodeStyle: (id, style) => {
			commit((draft) => {
				const node = draft.nodes[id];
				if (!node || node.type !== "text") return;
				Object.assign(node.style, style);
			});
		},

		updateNode: (id, patch) => {
			commit((draft) => {
				const node = draft.nodes[id];
				if (!node) return;
				Object.assign(node, patch as Partial<ReportNode>);
			});
		},

		setImageAsset: (nodeId, url) => {
			commit((draft) => {
				const node = draft.nodes[nodeId];
				if (!node || node.type !== "image") return;
				const assetId = node.assetId || crypto.randomUUID();
				draft.assets[assetId] = { id: assetId, kind: "image", url };
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
					if (!next.nodes[id]) continue;
					const beforeIds = new Set(Object.keys(next.nodes));
					next = duplicateSubtree(next, id, () => crypto.randomUUID());
					for (const newId of Object.keys(next.nodes)) {
						if (!beforeIds.has(newId)) newIds.push(newId);
					}
					const original = getNode(next, id);
					const clone = newIds
						.map((newId) => next.nodes[newId])
						.find((n) => n.parentId === original.parentId);
					if (clone) {
						clone.frame.x += GRID_SIZE;
						clone.frame.y += GRID_SIZE;
					}
				}
				Object.assign(draft, next);
			});
			if (newIds.length > 0) set({ selection: newIds });
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

			set({ verify: { status: "loading", pngDataUrl: null } });
			try {
				const response = await fetch(`${API_BASE_URL}/report/export/png`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						document: state.document,
						pageIndex,
						data: state.bindingData ?? undefined,
					}),
				});
				if (!response.ok) {
					throw new Error(`Verify render failed: ${response.status}`);
				}
				const blob = await response.blob();
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
				bindingData: state.bindingData,
				activePageId: state.activePageId,
			}),
			// Validate the persisted document before adopting it; a corrupt or
			// out-of-date entry falls back to the fresh sample rather than
			// crashing the editor on load.
			merge: (persisted, current) => {
				const saved = persisted as
					| {
							document?: unknown;
							bindingData?: Record<string, unknown> | null;
							activePageId?: NodeId | null;
					  }
					| undefined;
				const parsed = ReportDocumentSchema.safeParse(saved?.document);
				if (!parsed.success) return current;
				const document = parsed.data as ReportDocument;
				const activePageId =
					saved?.activePageId && document.nodes[saved.activePageId]
						? saved.activePageId
						: (document.pages[0] ?? null);
				return {
					...current,
					document,
					bindingData: saved?.bindingData ?? null,
					activePageId,
				};
			},
		},
	),
);
