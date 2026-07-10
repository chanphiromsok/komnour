import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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
const devApiProxyPort = Number(new URL(devApiProxyTarget).port || 80);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Resolves true if something is already listening on `port` (i.e. don't spawn a second one). */
function isPortTaken(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({ port, host: "127.0.0.1" });
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
}

/**
 * Runs `pnpm --filter @komnour/server dev` as a child process for the
 * lifetime of `vite dev`/`vite preview`, so the PDF export button and the
 * "verify render" PNG diff — the two things that still need real Skia on
 * the server, unlike ordinary page preview, which now renders entirely
 * client-side via a Worker (see renderWorker.ts) — work from a single
 * command instead of requiring a second terminal. Only spawns when nothing
 * is already listening on the proxy target port, so it stays out of the way
 * of anyone who does run the server separately (or a different instance of
 * it) — the auto-spawned copy skips itself instead of crashing on
 * EADDRINUSE.
 */
function komnourServerDevPlugin(): Plugin {
	let child: ChildProcess | null = null;

	async function start(label: string) {
		if (await isPortTaken(devApiProxyPort)) {
			console.log(
				`[komnour-server] something is already listening on :${devApiProxyPort} — not starting a second @komnour/server (${label}).`,
			);
			return;
		}
		console.log(`[komnour-server] starting @komnour/server on :${devApiProxyPort} (${label})...`);
		// shell: true is required on Windows — `pnpm` there resolves to
		// pnpm.cmd, not a directly-executable binary, so spawn("pnpm", ...)
		// fails with ENOENT without a shell to resolve it. An `error` listener
		// is likewise required on every platform: spawn errors (missing pnpm,
		// permissions, etc.) emit an 'error' event that Node rethrows and
		// crashes the whole process — including this Vite dev server — if
		// nothing is listening for it.
		child = spawn("pnpm", ["--filter", "@komnour/server", "dev"], {
			cwd: repoRoot,
			stdio: "inherit",
			shell: true,
			env: { ...process.env, PORT: String(devApiProxyPort) },
		});
		child.on("error", (err) => {
			console.error(
				`[komnour-server] failed to start (${label}) — PDF export and verify-render won't work until @komnour/server is running some other way: ${err.message}`,
			);
		});
		child.on("exit", (code, signal) => {
			if (code !== null && code !== 0) {
				console.error(`[komnour-server] exited with code ${code}${signal ? ` (${signal})` : ""}`);
			}
		});
	}

	function stop() {
		child?.kill();
		child = null;
	}

	return {
		name: "komnour-server-dev",
		apply: "serve",
		configureServer(server) {
			start("vite dev");
			server.httpServer?.once("close", stop);
		},
		configurePreviewServer(server) {
			start("vite preview");
			server.httpServer?.once("close", stop);
		},
	};
}

export default defineConfig(({ command }) => ({
	// GitHub Pages serves this app from /komnour/, so every built asset URL
	// must be prefixed with it — the dev server still serves from the root.
	base: command === "build" ? "/komnour/" : "/",
	plugins: [komnourServerDevPlugin(), tailwindcss(), react()],
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
	// `vite preview` (sanity-checking a production build locally) runs a
	// separate static server from `vite dev` — Vite does NOT share the
	// `server.proxy` config with it, so without this, /api requests would
	// 404/405 against vite's own static server even though `server.proxy`
	// above is set correctly.
	preview: {
		proxy: {
			"/api": {
				target: devApiProxyTarget,
				changeOrigin: true,
			},
		},
	},
}));
