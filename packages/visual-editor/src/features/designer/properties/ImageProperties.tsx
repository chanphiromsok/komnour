import { useEffect, useRef, useState } from "react";
import { imageFileToAsset } from "#/features/designer/assets/imageFiles";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import type { ImageNode, NodeId } from "@komnour/report/src/model/types";

const FITS: ImageNode["fit"][] = ["contain", "cover", "fill"];

export function ImageProperties({ nodeId }: { nodeId: NodeId }) {
	const node = useDesignerStore(
		(s) => s.document.nodes[nodeId] as ImageNode | undefined,
	);
	const asset = useDesignerStore((s) =>
		node ? s.document.assets[node.assetId] : undefined,
	);
	const updateNode = useDesignerStore((s) => s.updateNode);
	const setImageAsset = useDesignerStore((s) => s.setImageAsset);
	const [urlInput, setUrlInput] = useState("");
	const [localImageError, setLocalImageError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const isEmbeddedImage = asset?.url?.startsWith("data:image/") ?? false;

	useEffect(() => {
		setUrlInput(isEmbeddedImage ? "" : (asset?.url ?? ""));
	}, [asset?.url, isEmbeddedImage]);

	if (!node || node.type !== "image") return null;

	async function handleLocalImageChange(
		event: React.ChangeEvent<HTMLInputElement>,
	) {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			setLocalImageError(null);
			const imageAsset = await imageFileToAsset(file);
			setImageAsset(nodeId, imageAsset.url, {
				width: imageAsset.width,
				height: imageAsset.height,
			});
			event.target.value = "";
		} catch (err) {
			setLocalImageError(err instanceof Error ? err.message : String(err));
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-2 text-neutral-500 text-xs">
				<div className="font-medium text-neutral-700">Image source</div>
				<div className="flex h-28 items-center justify-center overflow-hidden rounded border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
					{asset?.url ? (
						<img
							src={asset.url}
							alt=""
							className="h-full w-full object-contain"
							draggable={false}
						/>
					) : (
						<span className="text-neutral-400">No image selected</span>
					)}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={handleLocalImageChange}
					className="hidden"
				/>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						className="flex-1 rounded border border-blue-500 bg-blue-50 px-2 py-1 font-medium text-blue-700 text-xs hover:bg-blue-100"
					>
						Choose image
					</button>
					{asset?.url && (
						<button
							type="button"
							onClick={() => setImageAsset(nodeId, "")}
							className="rounded border border-neutral-300 px-2 py-1 text-neutral-700 text-xs hover:bg-neutral-50"
						>
							Clear
						</button>
					)}
				</div>
				<span className="text-neutral-400">
					You can also drag an image from Finder directly onto the page.
				</span>
				{localImageError && (
					<span className="text-red-600">{localImageError}</span>
				)}
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Remote image URL
				<input
					type="text"
					value={urlInput}
					onChange={(event) => setUrlInput(event.target.value)}
					onBlur={(event) => {
						const url = event.target.value.trim();
						if (url) setImageAsset(nodeId, url);
						else if (!isEmbeddedImage) setImageAsset(nodeId, "");
					}}
					placeholder={
						isEmbeddedImage ? "Embedded local image" : "https://..."
					}
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				/>
			</label>

			<div className="flex flex-col gap-1 text-neutral-500 text-xs">
				Fit
				<div className="flex gap-1">
					{FITS.map((fit) => (
						<button
							key={fit}
							type="button"
							onClick={() => updateNode(nodeId, { fit })}
							className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${
								node.fit === fit
									? "border-blue-500 bg-blue-50 text-blue-700"
									: "border-neutral-300 text-neutral-700"
							}`}
						>
							{fit}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
