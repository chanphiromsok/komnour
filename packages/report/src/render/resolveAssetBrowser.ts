import type { Asset } from "../model/types";
import type { ResolvedAsset } from "./adapter";

/**
 * Browser-only asset resolver: fetches the asset's URL and decodes both its
 * raw bytes (for CanvasAdapter's `MakeImageFromEncoded`) and its natural
 * dimensions (for contain/cover/fill fit math), matching what SkiaAdapter
 * gets server-side by reading the file directly.
 */
export async function resolveAssetBrowser(
	asset: Asset,
): Promise<ResolvedAsset> {
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
