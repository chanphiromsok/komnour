import { DesignerCanvas } from "#/features/designer/canvas/DesignerCanvas";
import { LayersPanel } from "#/features/designer/layers/LayersPanel";
import { PropertyPanel } from "#/features/designer/properties/PropertyPanel";
import { Toolbar } from "#/features/designer/toolbar/Toolbar";

export function DesignerApp() {
	return (
		<div className="flex h-screen w-screen flex-col">
			<Toolbar />
			<div className="flex flex-1 overflow-hidden">
				<LayersPanel />
				<DesignerCanvas />
				<PropertyPanel />
			</div>
		</div>
	);
}
