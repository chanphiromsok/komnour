import {
	Braces,
	Check,
	CheckSquare,
	Circle,
	ClipboardCopy,
	Copy,
	FileDown,
	FileJson,
	FileUp,
	Hand,
	Image,
	Loader2,
	Minus,
	Moon,
	MousePointer2,
	Plus,
	Redo2,
	Square,
	Sun,
	Trash2,
	Type,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useRef, useState } from "react";
import { DataBindingDialog } from "#/features/designer/dialogs/DataBindingDialog";
import { ImportJsonDialog } from "#/features/designer/dialogs/ImportJsonDialog";
import {
	createCheckboxNode,
	createCircleNode,
	createImageNode,
	createLineNode,
	createPageNode,
	createRectNode,
	createTextNode,
} from "#/features/designer/store/nodeFactories";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { buildApiUrl } from "#/lib/apiBase";

export function Toolbar() {
	const tool = useDesignerStore((s) => s.tool);
	const setTool = useDesignerStore((s) => s.setTool);
	const zoom = useDesignerStore((s) => s.zoom);
	const setZoom = useDesignerStore((s) => s.setZoom);
	const selection = useDesignerStore((s) => s.selection);
	const reportDocument = useDesignerStore((s) => s.document);
	const activePageId = useDesignerStore((s) => s.activePageId);
	const setActivePageId = useDesignerStore((s) => s.setActivePageId);
	const addNode = useDesignerStore((s) => s.addNode);
	const setSelection = useDesignerStore((s) => s.setSelection);
	const removeNodes = useDesignerStore((s) => s.removeNodes);
	const duplicateNodes = useDesignerStore((s) => s.duplicateNodes);
	const undo = useDesignerStore((s) => s.undo);
	const redo = useDesignerStore((s) => s.redo);
	const canUndo = useDesignerStore((s) => s.canUndo());
	const canRedo = useDesignerStore((s) => s.canRedo());
	const verify = useDesignerStore((s) => s.verify);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const theme = useDesignerStore((s) => s.theme);
	const toggleTheme = useDesignerStore((s) => s.toggleTheme);
	const defaultFontFamily = useDesignerStore((s) => s.defaultFontFamily);
	const defaultFontSize = useDesignerStore((s) => s.defaultFontSize);
	const getSpawnCenter = useDesignerStore((s) => s.getSpawnCenter);

	const [exportingPdf, setExportingPdf] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);
	const [importOpen, setImportOpen] = useState(false);
	const [dataOpen, setDataOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	async function handleCopyJson() {
		try {
			await navigator.clipboard.writeText(
				JSON.stringify(reportDocument, null, 2),
			);
			setCopied(true);
			if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
			copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
		} catch (error) {
			setExportError(error instanceof Error ? error.message : String(error));
		}
	}

	async function handleExportPdf() {
		setExportingPdf(true);
		setExportError(null);
		try {
			// bindingData travels inside `document.bindingData` — no separate
			// `data` field needed; the server falls back to it automatically.
			const response = await fetch(buildApiUrl("/report/export/pdf"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ document: reportDocument }),
			});
			if (!response.ok) {
				throw new Error(`Export failed: ${response.status}`);
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = window.document.createElement("a");
			link.href = url;
			link.download = "report.pdf";
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			setExportError(error instanceof Error ? error.message : String(error));
		} finally {
			setExportingPdf(false);
		}
	}

	function handleDownloadJson() {
		const blob = new Blob([JSON.stringify(reportDocument, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = window.document.createElement("a");
		link.href = url;
		link.download = "report.json";
		link.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="flex h-11 shrink-0 items-center gap-1 border-neutral-800 border-b bg-[#1f1f23] px-2 text-neutral-200 shadow-sm">
			<div className="mr-2 flex h-7 items-center gap-2 rounded-md bg-white/5 px-2">
				<div className="h-3 w-3 rounded-sm bg-blue-500" />
				<span className="font-semibold text-[11px] text-white tracking-wide">
					Komnour
				</span>
			</div>

			<div className="flex max-w-[28rem] items-center gap-1 overflow-x-auto rounded-lg bg-black/15 p-0.5">
				{reportDocument.pages.map((pageId, index) => (
					<button
						key={pageId}
						type="button"
						onClick={() => {
							setActivePageId(pageId);
							setSelection([pageId]);
						}}
						className={`h-7 max-w-32 truncate rounded-md px-2 font-medium text-[11px] transition-colors ${pageId === activePageId
								? "bg-white text-neutral-950 shadow-sm"
								: "text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
							}`}
					>
						{reportDocument.nodes[pageId]?.name || `Page ${index + 1}`}
					</button>
				))}
				<ToolbarButton
					label="Add page"
					onClick={() => {
						const pageNode = createPageNode();
						addNode(pageNode, null);
						setActivePageId(pageNode.id);
						setSelection([pageNode.id]);
					}}
				>
					<Plus size={16} />
				</ToolbarButton>
			</div>

			<Divider />

			<div className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton
					active={tool === "select"}
					label="Select"
					onClick={() => setTool("select")}
				>
					<MousePointer2 size={16} />
				</ToolbarButton>
				<ToolbarButton
					active={tool === "pan"}
					label="Pan"
					onClick={() => setTool("pan")}
				>
					<Hand size={16} />
				</ToolbarButton>
			</div>

			<Divider />

			<div className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton
					label="Add text"
					onClick={() =>
						addNode(
							createTextNode(activePageId, {
								center: getSpawnCenter() ?? undefined,
								fontFamily: defaultFontFamily,
								fontSize: defaultFontSize,
							}),
							activePageId,
						)
					}
				>
					<Type size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Add rectangle"
					onClick={() =>
						addNode(
							createRectNode(activePageId, { center: getSpawnCenter() ?? undefined }),
							activePageId,
						)
					}
				>
					<Square size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Add circle"
					onClick={() =>
						addNode(
							createCircleNode(activePageId, { center: getSpawnCenter() ?? undefined }),
							activePageId,
						)
					}
				>
					<Circle size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Add line"
					onClick={() =>
						addNode(
							createLineNode(activePageId, { center: getSpawnCenter() ?? undefined }),
							activePageId,
						)
					}
				>
					<Minus size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Add image"
					onClick={() =>
						addNode(
							createImageNode(activePageId, { center: getSpawnCenter() ?? undefined }),
							activePageId,
						)
					}
				>
					<Image size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Add checkbox"
					onClick={() =>
						addNode(
							createCheckboxNode(activePageId, {
								center: getSpawnCenter() ?? undefined,
								fontFamily: defaultFontFamily,
							}),
							activePageId,
						)
					}
				>
					<CheckSquare size={16} />
				</ToolbarButton>
			</div>

			<Divider />

			<div className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton label="Undo" disabled={!canUndo} onClick={() => undo()}>
					<Undo2 size={16} />
				</ToolbarButton>
				<ToolbarButton label="Redo" disabled={!canRedo} onClick={() => redo()}>
					<Redo2 size={16} />
				</ToolbarButton>
			</div>

			<Divider />

			<div className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton
					label="Duplicate"
					disabled={selection.length === 0}
					onClick={() => duplicateNodes(selection)}
				>
					<Copy size={16} />
				</ToolbarButton>
				<ToolbarButton
					label="Delete"
					disabled={selection.length === 0}
					onClick={() => removeNodes(selection)}
				>
					<Trash2 size={16} />
				</ToolbarButton>
			</div>

			<Divider />

			{verify.status === "error" && (
				<span
					className="max-w-48 truncate text-red-600 text-xs"
					title={verify.error}
				>
					{verify.error}
				</span>
			)}

			<Divider />

			<ToolbarButton
				label="Export as PDF (DEV Environment only)"
				disabled={exportingPdf}
				onClick={handleExportPdf}
			>
				{exportingPdf ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					<FileDown size={16} />
				)}
			</ToolbarButton>
			<ToolbarButton
				label="Download document JSON"
				onClick={handleDownloadJson}
			>
				<FileJson size={16} />
			</ToolbarButton>
			<ToolbarButton
				label={copied ? "Copied!" : "Copy document JSON"}
				onClick={handleCopyJson}
			>
				{copied ? (
					<Check size={16} className="text-green-600" />
				) : (
					<ClipboardCopy size={16} />
				)}
			</ToolbarButton>
			<ToolbarButton
				label="Import document JSON"
				onClick={() => setImportOpen(true)}
			>
				<FileUp size={16} />
			</ToolbarButton>
			<ToolbarButton
				active={bindingData !== null}
				label={
					bindingData !== null
						? "Data binding (active)"
						: "Data binding ({{path}} placeholders)"
				}
				onClick={() => setDataOpen(true)}
			>
				<Braces size={16} />
			</ToolbarButton>
			{importOpen && <ImportJsonDialog onClose={() => setImportOpen(false)} />}
			{dataOpen && <DataBindingDialog onClose={() => setDataOpen(false)} />}
			{exportError && (
				<span
					className="max-w-48 truncate text-red-600 text-xs"
					title={exportError}
				>
					{exportError}
				</span>
			)}

			<div className="flex-1" />

			<div className="flex items-center gap-0.5 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton
					label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
					onClick={toggleTheme}
				>
					{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
				</ToolbarButton>
			</div>

			<Divider />

			<div className="flex items-center gap-1 rounded-lg bg-black/15 p-0.5">
				<ToolbarButton label="Zoom out" onClick={() => setZoom(zoom - 0.1)}>
					<ZoomOut size={16} />
				</ToolbarButton>
				<span className="w-12 text-center font-medium text-neutral-200 text-xs tabular-nums">
					{Math.round(zoom * 100)}%
				</span>
				<ToolbarButton label="Zoom in" onClick={() => setZoom(zoom + 0.1)}>
					<ZoomIn size={16} />
				</ToolbarButton>
			</div>
		</div>
	);
}

function Divider() {
	return <div className="mx-1 h-6 w-px bg-white/10" />;
}

function ToolbarButton({
	active,
	disabled,
	label,
	onClick,
	children,
}: {
	active?: boolean;
	disabled?: boolean;
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${active
					? "bg-blue-500 text-white shadow-sm"
					: "text-neutral-300 hover:bg-white/10 hover:text-white"
				} disabled:cursor-not-allowed disabled:text-neutral-600 disabled:opacity-60`}
		>
			{children}
		</button>
	);
}
