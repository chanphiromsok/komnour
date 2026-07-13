import { useRef, useState } from "react";
import { readFileAsDataUrl } from "#/lib/readFileAsDataUrl";
import { NumberField } from "#/features/designer/properties/NumberField";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { DialogShell } from "./DialogShell";

const FONT_FILE_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];

function isFontFile(file: File): boolean {
	const name = file.name.toLowerCase();
	return FONT_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** "my-cool_Font.ttf" → "my cool Font", a reasonable starting point for the family name field. */
function guessFamilyFromFilename(filename: string): string {
	return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

export function ImportFontDialog({ onClose }: { onClose: () => void }) {
	const addCustomFont = useDesignerStore((s) => s.addCustomFont);
	const [file, setFile] = useState<File | null>(null);
	const [family, setFamily] = useState("");
	const [weight, setWeight] = useState(400);
	const [style, setStyle] = useState<"normal" | "italic">("normal");
	const [error, setError] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const picked = event.target.files?.[0];
		event.target.value = "";
		if (!picked) return;
		if (!isFontFile(picked)) {
			setError("Pick a .ttf, .otf, .woff, or .woff2 file.");
			return;
		}
		setError(null);
		setFile(picked);
		if (!family) setFamily(guessFamilyFromFilename(picked.name));
	}

	async function handleImport() {
		if (!file || !family.trim()) return;
		setImporting(true);
		setError(null);
		try {
			const dataUrl = await readFileAsDataUrl(file);
			// Parsed (not added to any FontFaceSet — the render Worker owns that,
			// registering straight from document.fonts on its next render) purely
			// so a corrupt/unsupported font file fails here with a clear message
			// instead of silently producing a blank text node afterward.
			const probe = new FontFace(family, `url("${dataUrl}")`, {
				weight: String(weight),
				style,
			});
			await probe.load();
			addCustomFont({ family, weight, style, dataUrl });
			onClose();
		} catch (err) {
			setError(
				err instanceof Error
					? `Could not load that font: ${err.message}`
					: "Could not load that font.",
			);
		} finally {
			setImporting(false);
		}
	}

	return (
		<DialogShell title="Import font" onClose={onClose}>
			<p className="text-neutral-500 text-xs">
				Pick a font file from your machine (.ttf, .otf, .woff, .woff2). It's
				embedded directly in the document — same as a dropped image — so it
				travels with exports and JSON downloads, and shows up in every font
				family picker in the editor.
			</p>

			<div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
					className="hidden"
					onChange={handleFileChange}
				/>
				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					className="rounded border border-neutral-300 px-3 py-1.5 text-neutral-700 text-sm hover:bg-neutral-50"
				>
					Choose file…
				</button>
				{file && (
					<span className="ml-2 text-neutral-500 text-xs">{file.name}</span>
				)}
			</div>

			<label className="flex flex-col gap-1 text-neutral-500 text-xs">
				Family name
				<input
					type="text"
					value={family}
					onChange={(event) => setFamily(event.target.value)}
					placeholder="e.g. My Custom Font"
					className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
				/>
			</label>

			<div className="grid grid-cols-2 gap-2">
				<NumberField label="Weight" value={weight} min={100} max={900} step={100} onChange={setWeight} />
				<label className="flex flex-col gap-1 text-neutral-500 text-xs">
					Style
					<select
						value={style}
						onChange={(event) =>
							setStyle(event.target.value as "normal" | "italic")
						}
						className="rounded border border-neutral-300 px-2 py-1 text-neutral-900 text-sm"
					>
						<option value="normal">Normal</option>
						<option value="italic">Italic</option>
					</select>
				</label>
			</div>

			{error && <p className="text-red-600 text-xs">{error}</p>}

			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={onClose}
					className="rounded px-3 py-1.5 text-neutral-600 text-sm hover:bg-neutral-100"
				>
					Cancel
				</button>
				<button
					type="button"
					disabled={!file || !family.trim() || importing}
					onClick={handleImport}
					className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
				>
					{importing ? "Importing…" : "Import"}
				</button>
			</div>
		</DialogShell>
	);
}
