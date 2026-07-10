import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Dev-only: proxies /api straight through to the real @komnour/server
 * Fastify instance instead of reimplementing the export routes as Vite
 * middleware. Dev and production hit the exact same server code this way —
 * no second implementation to keep in sync, and no risk of the classic
 * "works against Vite's dev server, 405s once it's static-hosted" trap.
 * Override with VITE_DEV_API_PROXY_TARGET if the server runs somewhere
 * other than its default port (see packages/server's PORT env var).
 */
const devApiProxyTarget =
	process.env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig(({ command }) => ({
	// GitHub Pages serves this app from /komnour/, so every built asset URL
	// must be prefixed with it — the dev server still serves from the root.
	base: command === "build" ? "/komnour/" : "/",
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			"#": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 5174,
		fs: { allow: ["../.."] },
		proxy: {
			"/api": {
				target: devApiProxyTarget,
				changeOrigin: true,
			},
		},
	},
}));
