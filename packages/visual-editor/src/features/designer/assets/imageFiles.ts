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

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") resolve(reader.result);
			else reject(new Error("Selected file could not be read as an image URL."));
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Selected file could not be read."));
		reader.readAsDataURL(file);
	});
}
