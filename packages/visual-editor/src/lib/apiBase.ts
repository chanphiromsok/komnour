/**
 * In dev, requests go to "/api" and Vite proxies them to the local
 * @komnour/server instance (see vite.config.ts) — never to a hardcoded host,
 * so this works regardless of what port/domain dev is served from. In a
 * production build there's no dev server to proxy through (GitHub Pages is
 * static hosting), so the real backend origin must be baked in at build time
 * via VITE_API_BASE_URL. Throwing when it's missing turns a silent
 * "requests 404 against GitHub Pages" failure into a build-time-obvious one.
 */
export const API_BASE_URL: string = import.meta.env.DEV
	? "/api"
	: (import.meta.env.VITE_API_BASE_URL ?? "");

if (!import.meta.env.DEV && !API_BASE_URL) {
	throw new Error(
		"VITE_API_BASE_URL is required in production — set it in packages/visual-editor/.env.production (see .env.production.example).",
	);
}

/** Joins `path` onto API_BASE_URL with exactly one slash between them, however either is written. */
export function buildApiUrl(path: string): string {
	return `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
