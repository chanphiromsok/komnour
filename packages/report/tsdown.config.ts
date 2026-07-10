import { defineConfig } from "tsdown";

/**
 * Builds only the published entry points (currently just ./pdf, the
 * minimal Node-only "JSON in, PDF out" surface) to dual ESM/CJS + .d.ts —
 * everything else in this package is still consumed as raw .ts source
 * within the monorepo (visual-editor/server import deep `src/*` paths
 * directly, resolved via the package.json `exports` "./src/*" passthrough,
 * not this build output).
 */
export default defineConfig({
	entry: ["src/pdf.ts"],
	format: ["esm", "cjs"],
	dts: true,
	outDir: "dist",
	clean: true,
	platform: "node",
});
