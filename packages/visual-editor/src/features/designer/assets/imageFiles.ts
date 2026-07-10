import { readFileAsDataUrl } from "#/lib/readFileAsDataUrl";

export interface ImageFileAsset {
	url: string;
	width: number;
	height: number;
}

export function isImageFile(file: File): boolean {
	return file.type.startsWith("image/");
}

export async function imageFileToAsset(file: File): Promise<ImageFileAsset> {
	const [url, bitmap] = await Promise.all([
		readFileAsDataUrl(file),
		createImageBitmap(file),
	]);
	const asset = {
		url,
		width: bitmap.width,
		height: bitmap.height,
	};
	bitmap.close();
	return asset;
}
