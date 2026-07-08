import type { Asset } from "../model/types";
import type { ResolvedAsset } from "./adapter";

/**
 * Keyed by URL so an image already being (or having been) fetched/decoded is
 * never re-fetched. Without this, an interactive canvas that re-renders on
 * every pointermove (e.g. dragging/resizing a node) would refetch and
 * redecode every image node's bytes on every frame, which both wastes
 * network/CPU and widens the async window in which overlapping renders can
 * race on the shared canvas surface (see DesignerCanvas's `shouldAbort`).
 *
 * Bounded LRU, not an unbounded cache: each entry pins a full decoded
 * `ArrayBuffer` of the source image's raw bytes, so caching every distinct
 * URL ever seen in a session (e.g. after swapping an image node's URL a few
 * times while experimenting) would grow memory without limit. A `Map`
 * preserves insertion order, so re-inserting a key on cache hit bumps it to
 * the end and the oldest key is always the true least-recently-used one.
 */
const assetCache = new Map<string, Promise<ResolvedAsset>>();
const MAX_CACHED_ASSETS = 24;

/**
 * Browser-only asset resolver: fetches the asset's URL and decodes both its
 * raw bytes (for CanvasAdapter's `MakeImageFromEncoded`) and its natural
 * dimensions (for contain/cover/fill fit math), matching what SkiaAdapter
 * gets server-side by reading the file directly.
 */
export function resolveAssetBrowser(asset: Asset): Promise<ResolvedAsset> {
	const cached = assetCache.get(asset.url);
	if (cached) {
		assetCache.delete(asset.url);
		assetCache.set(asset.url, cached);
		return cached;
	}

	const promise = fetchAndDecode(asset).catch((err) => {
		// A failed fetch shouldn't poison the cache forever (e.g. a transient
		// network error) — let the next render try again.
		assetCache.delete(asset.url);
		throw err;
	});
	assetCache.set(asset.url, promise);
	while (assetCache.size > MAX_CACHED_ASSETS) {
		const oldestKey = assetCache.keys().next().value;
		if (oldestKey === undefined) break;
		assetCache.delete(oldestKey);
	}
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
