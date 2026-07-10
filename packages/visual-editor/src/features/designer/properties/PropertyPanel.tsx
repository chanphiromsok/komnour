import { useDesignerStore } from "#/features/designer/store/reportStore";
import { CheckboxProperties } from "./CheckboxProperties";
import { FrameProperties } from "./FrameProperties";
import { ImageProperties } from "./ImageProperties";
import { PageProperties } from "./PageProperties";
import { ShapeProperties } from "./ShapeProperties";
import { TextProperties } from "./TextProperties";

export function PropertyPanel() {
	const selection = useDesignerStore((s) => s.selection);
	const node = useDesignerStore((s) =>
		selection.length === 1 ? s.document.nodes[selection[0]] : undefined,
	);
	const nodeTypeLabel = node
		? node.type.charAt(0).toUpperCase() + node.type.slice(1)
		: undefined;

	return (
		<div className="report-panel flex w-72 shrink-0 flex-col overflow-hidden border-neutral-200 border-l bg-[#f7f7f8] dark:border-neutral-800 dark:bg-neutral-900">
			<div className="border-neutral-200 border-b px-3 py-2.5 dark:border-neutral-800">
				<div className="font-semibold text-neutral-900 text-sm dark:text-neutral-100">
					Design
				</div>
				<div className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
					{node ? `${node.name} · ${nodeTypeLabel}` : "Inspector"}
				</div>
			</div>

			<div className="flex-1 space-y-3 overflow-auto p-3">
				{!node && (
					<div className="rounded-xl border border-dashed border-neutral-300 bg-white/70 p-4 text-center text-neutral-400 text-sm dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-500">
						{selection.length > 1
							? "Multiple elements selected"
							: "Select an element to edit its properties."}
					</div>
				)}

				{node && node.type === "page" && <PageProperties nodeId={node.id} />}

				{node && node.type !== "page" && (
					<>
						<InspectorSection title="Position">
							<FrameProperties nodeId={node.id} />
						</InspectorSection>
						{node.type === "text" && (
							<InspectorSection title="Text">
								<TextProperties nodeId={node.id} />
							</InspectorSection>
						)}
						{node.type === "image" && (
							<InspectorSection title="Image">
								<ImageProperties nodeId={node.id} />
							</InspectorSection>
						)}
						{(node.type === "rect" ||
							node.type === "circle" ||
							node.type === "line") && (
							<InspectorSection title="Appearance">
								<ShapeProperties nodeId={node.id} />
							</InspectorSection>
						)}
						{node.type === "checkbox" && (
							<InspectorSection title="Checkbox">
								<CheckboxProperties nodeId={node.id} />
							</InspectorSection>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function InspectorSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
			<div className="mb-3 font-semibold text-neutral-700 text-xs dark:text-neutral-200">
				{title}
			</div>
			{children}
		</section>
	);
}
