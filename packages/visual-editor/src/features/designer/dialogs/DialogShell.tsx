import { X } from "lucide-react";

/** Minimal modal shell shared by the toolbar dialogs. */
export function DialogShell({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="report-panel flex max-h-[80vh] w-[480px] flex-col rounded-lg bg-white shadow-xl dark:bg-neutral-900 dark:ring-1 dark:ring-neutral-800">
				<div className="flex items-center justify-between border-neutral-200 border-b px-4 py-3 dark:border-neutral-800">
					<h2 className="font-medium text-neutral-800 text-sm dark:text-neutral-100">
						{title}
					</h2>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
					>
						<X size={14} />
					</button>
				</div>
				<div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
					{children}
				</div>
			</div>
		</div>
	);
}
