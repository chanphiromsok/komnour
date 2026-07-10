import { useMemo } from "react";
import { useDesignerStore } from "#/features/designer/store/reportStore";
import { FONT_MANIFEST } from "@komnour/report/src/fonts/manifest";

export const BUILTIN_FONT_FAMILIES = [
	...new Set(FONT_MANIFEST.map((f) => f.family)),
];

/** Unlikely to appear inside a real font family name — plain space isn't safe since names like "Noto Sans Khmer" contain one. */
const SEPARATOR = "|||";

/**
 * Built-in families plus whatever the user has imported into this document
 * (see ImportFontDialog / addCustomFont) — the single list every font-family
 * picker in the app should render, so an imported font shows up everywhere
 * a font can be chosen, not just wherever it happened to be imported from.
 *
 * The store selector reduces to a joined string (a stable primitive) rather
 * than returning a freshly-allocated array — zustand re-renders whenever a
 * selector's *output* differs by Object.is, and a new array reference on
 * every unrelated store update would defeat that even when the actual set
 * of custom families hasn't changed.
 */
export function useFontFamilies(): string[] {
	const customFamiliesKey = useDesignerStore((s) =>
		[...new Set(Object.values(s.document.fonts).map((f) => f.family))]
			.sort()
			.join(SEPARATOR),
	);
	return useMemo(() => {
		if (!customFamiliesKey) return BUILTIN_FONT_FAMILIES;
		const families = new Set(BUILTIN_FONT_FAMILIES);
		for (const family of customFamiliesKey.split(SEPARATOR)) {
			families.add(family);
		}
		return [...families];
	}, [customFamiliesKey]);
}
