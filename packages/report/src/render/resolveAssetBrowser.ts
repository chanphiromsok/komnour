import type { Asset } from "../model/types";
import type { ResolvedAsset } from "./adapter";

/**
 * Keyed by URL so an image already being (or having been) fetched/decoded is
 * never re-fetched. Without this, an interactive canvas that re-renders on
 * every pointermove (e.g. dragging/resizing a node) would refetch and
 * redecode every image node's bytes on every frame, which both wastes
 * network/CPU and widens the async window in which overlapping renders can
 * race on the shared canvas surface (see DesignerCanvas's `shouldAbort`).
 */
const assetCache = new Map<string, Promise<ResolvedAsset>>();

/**
 * Browser-only asset resolver: fetches the asset's URL and decodes both its
 * raw bytes (for CanvasAdapter's `MakeImageFromEncoded`) and its natural
 * dimensions (for contain/cover/fill fit math), matching what SkiaAdapter
 * gets server-side by reading the file directly.
 */
export function resolveAssetBrowser(asset: Asset): Promise<ResolvedAsset> {
	const cached = assetCache.get(asset.url);
	if (cached) return cached;

	const promise = fetchAndDecode(asset).catch((err) => {
		// A failed fetch shouldn't poison the cache forever (e.g. a transient
		// network error) — let the next render try again.
		assetCache.delete(asset.url);
		throw err;
	});
	assetCache.set(asset.url, promise);
	return promise;
}

async function fetchAndDecode(asset: Asset): Promise<ResolvedAsset> {
	const response = await fetch(asset.url);
	if (!response.ok) {
		throw new Error(`Failed to fetch image asset: ${response.status}`);
	}
	const blob = await response.blob();
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const bitmap = await createImageBitmap(blob);
	const resolved: ResolvedAsset = {
		bytes,
		width: bitmap.width,
		height: bitmap.height,
	};
	bitmap.close();
	return resolved;
}
