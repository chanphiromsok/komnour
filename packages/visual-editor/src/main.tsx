import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesignerApp } from "#/features/designer/DesignerApp";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
	<StrictMode>
		<DesignerApp />
	</StrictMode>,
);
