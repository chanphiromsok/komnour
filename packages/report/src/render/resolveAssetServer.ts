import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadImage } from "skia-canvas";
import type { Asset } from "../model/types";
import type { ResolvedAsset } from "./adapter";

export async function resolveAssetServer(asset: Asset): Promise<ResolvedAsset> {
	const bytes = await readAssetBytes(asset.url);
	const image = await loadImage(Buffer.from(bytes));
	return {
		bytes,
		width: asset.width ?? image.width,
		height: asset.height ?? image.height,
	};
}

async function readAssetBytes(url: string): Promise<Uint8Array> {
	if (url.startsWith("data:")) return readDataUrl(url);
	if (url.startsWith("file:")) {
		return new Uint8Array(await readFile(fileURLToPath(url)));
	}
	if (/^https?:\/\//i.test(url)) {
		const response = await fetchUrl(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch image asset: ${response.status}`);
		}
		return new Uint8Array(await response.arrayBuffer());
	}
	return new Uint8Array(await readFile(url));
}

/**
 * Prefers the platform's own global `fetch` (stable since Node 18) and only
 * falls back to the `node-fetch` dependency — imported lazily, so it costs
 * nothing at all on a modern Node that never needs it — on Node 16/17,
 * which have no global fetch at all. This is the one thing in this package
 * that would otherwise hard-require Node 18+.
 */
async function fetchUrl(url: string): Promise<{
	ok: boolean;
	status: number;
	arrayBuffer(): Promise<ArrayBuffer>;
}> {
	if (typeof fetch === "function") return fetch(url);
	const { default: nodeFetch } = await import("node-fetch");
	return nodeFetch(url);
}

function readDataUrl(url: string): Uint8Array {
	const commaIndex = url.indexOf(",");
	if (commaIndex === -1) throw new Error("Invalid data URL image asset.");
	const header = url.slice(0, commaIndex);
	const payload = url.slice(commaIndex + 1);
	if (header.endsWith(";base64")) return Buffer.from(payload, "base64");
	return Buffer.from(decodeURIComponent(payload), "utf8");
}
