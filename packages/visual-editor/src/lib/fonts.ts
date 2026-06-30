function detectDescriptors(src: string): FontFaceDescriptors {
  // @fontsource: "inter-all-400-normal.woff" → { weight: "400" }
  const fsMatch = src.match(/-(\d{3})-(?:normal|italic)/)
  if (fsMatch) return { weight: fsMatch[1] }
  // TTF suffix: "calibrib.ttf" → bold, "calibril.ttf" → light, "calibriz.ttf" → bold italic
  const ttfMatch = src.match(/([a-z]+?)([bBiIzZlL]*)\.ttf(?:\?|$)/)
  if (ttfMatch) {
    const sfx = ttfMatch[2].toLowerCase()
    const weight = sfx.includes('b') || sfx === 'z' ? '700' : sfx.includes('l') ? '300' : undefined
    const style = sfx.includes('i') || sfx === 'z' ? 'italic' : undefined
    return { ...(weight ? { weight } : {}), ...(style ? { style } : {}) }
  }
  return {}
}

export async function loadFonts(fontMap: Record<string, string[]>): Promise<void> {
  await Promise.all(
    Object.entries(fontMap).flatMap(([family, srcs]) =>
      srcs.map(async src => {
        const face = new FontFace(family, `url(${src})`, detectDescriptors(src))
        await face.load()
        document.fonts.add(face)
      })
    )
  )
}

export const FONT_FAMILIES = [
  'Noto Sans Khmer',
  'Inter',
  'KhmerOSsiemreap',
  'Kh-Siemreap',
  'Khmer-OS-Muol-Light',
  'Calibri',
  'KhmerBursa',
]
