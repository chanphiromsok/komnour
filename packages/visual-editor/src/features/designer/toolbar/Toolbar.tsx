import {
	Braces,
	Check,
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
	ScanEye,
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
	createCircleNode,
	createImageNode,
	createLineNode,
	createPageNode,
	createRectNode,
	createTextNode,
} from "#/features/designer/store/nodeFactories";
import { useDesignerStore } from "#/features/designer/store/reportStore";

const API_BASE_URL: string =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

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
	const runVerifyRender = useDesignerStore((s) => s.runVerifyRender);
	const clearVerify = useDesignerStore((s) => s.clearVerify);
	const bindingData = useDesignerStore((s) => s.document.bindingData ?? null);
	const theme = useDesignerStore((s) => s.theme);
	const toggleTheme = useDesignerStore((s) => s.toggleTheme);

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
			const response = await fetch(`${API_BASE_URL}/report/export/pdf`, {
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
		<div className="flex h-12 shrink-0 items-center gap-1 border-neutral-200 border-b bg-white px-2 dark:border-neutral-800 dark:bg-neutral-900">
			<div className="flex items-center gap-1">
				{reportDocument.pages.map((pageId, index) => (
					<button
						key={pageId}
						type="button"
						onClick={() => {
							setActivePageId(pageId);
							setSelection([pageId]);
						}}
						className={`rounded px-2 py-1 text-xs ${
							pageId === activePageId
								? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
								: "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
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

			<Divider />

			<ToolbarButton
				label="Add text"
				onClick={() => addNode(createTextNode(activePageId), activePageId)}
			>
				<Type size={16} />
			</ToolbarButton>
			<ToolbarButton
				label="Add rectangle"
				onClick={() => addNode(createRectNode(activePageId), activePageId)}
			>
				<Square size={16} />
			</ToolbarButton>
			<ToolbarButton
				label="Add circle"
				onClick={() => addNode(createCircleNode(activePageId), activePageId)}
			>
				<Circle size={16} />
			</ToolbarButton>
			<ToolbarButton
				label="Add line"
				onClick={() => addNode(createLineNode(activePageId), activePageId)}
			>
				<Minus size={16} />
			</ToolbarButton>
			<ToolbarButton
				label="Add image"
				onClick={() => addNode(createImageNode(activePageId), activePageId)}
			>
				<Image size={16} />
			</ToolbarButton>

			<Divider />

			<ToolbarButton label="Undo" disabled={!canUndo} onClick={() => undo()}>
				<Undo2 size={16} />
			</ToolbarButton>
			<ToolbarButton label="Redo" disabled={!canRedo} onClick={() => redo()}>
				<Redo2 size={16} />
			</ToolbarButton>

			<Divider />

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

			<Divider />

			<ToolbarButton
				active={verify.pngDataUrl !== null}
				label={
					verify.pngDataUrl
						? "Hide server render overlay"
						: "Verify against server render (skia-canvas)"
				}
				onClick={() => (verify.pngDataUrl ? clearVerify() : runVerifyRender())}
			>
				{verify.status === "loading" ? (
					<Loader2 size={16} className="animate-spin" />
				) : (
					<ScanEye size={16} />
				)}
			</ToolbarButton>
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
				label="Export as PDF"
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

			<ToolbarButton
				label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
				onClick={toggleTheme}
			>
				{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
			</ToolbarButton>

			<Divider />

			<ToolbarButton label="Zoom out" onClick={() => setZoom(zoom - 0.1)}>
				<ZoomOut size={16} />
			</ToolbarButton>
			<span className="w-12 text-center text-neutral-600 text-sm tabular-nums dark:text-neutral-400">
				{Math.round(zoom * 100)}%
			</span>
			<ToolbarButton label="Zoom in" onClick={() => setZoom(zoom + 0.1)}>
				<ZoomIn size={16} />
			</ToolbarButton>
		</div>
	);
}

function Divider() {
	return <div className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-800" />;
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
			className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
				active
					? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
					: "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
			} disabled:cursor-not-allowed disabled:opacity-40`}
		>
			{children}
		</button>
	);
}
