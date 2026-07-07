import { useEffect } from "react";
import { DesignerCanvas } from "#/features/designer/canvas/DesignerCanvas";
import { LayersPanel } from "#/features/designer/layers/LayersPanel";
import { PropertyPanel } from "#/features/designer/properties/PropertyPanel";
import { Toolbar } from "#/features/designer/toolbar/Toolbar";
import { useDesignerStore } from "#/features/designer/store/reportStore";

export function DesignerApp() {
	const theme = useDesignerStore((s) => s.theme);

	// Reflect the store's theme onto <html> so the `dark:` custom variant and
	// native `color-scheme` (see index.css) take effect app-wide.
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	return (
		<div className="flex h-screen w-screen flex-col bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
			<Toolbar />
			<div className="flex flex-1 overflow-hidden">
				<LayersPanel />
				<DesignerCanvas />
				<PropertyPanel />
			</div>
		</div>
	);
}
