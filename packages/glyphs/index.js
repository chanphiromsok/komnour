const fontkit = require("fontkit");
const fs = require("fs");
const path = require("path");

const fontPath = process.argv[2];
const outputPath = process.argv[3] || path.join(process.cwd(), "glyphmap.json");

if (!fontPath) {
  console.error("Usage: node glyphs.js ./MyFont.ttf [glyphmap.json]");
  process.exit(1);
}

if (!fs.existsSync(fontPath)) {
  console.error(`Font not found: ${fontPath}`);
  process.exit(1);
}

const font = fontkit.openSync(fontPath);

function lazyGet(array, index) {
  return typeof array.get === "function" ? array.get(index) : array[index];
}

// Same intent as fontTools cmapTable.isUnicode().
function isUnicodeCmap(subtable) {
  return (
    subtable.platformID === 0 ||
    (subtable.platformID === 3 &&
      (subtable.encodingID === 0 ||
        subtable.encodingID === 1 ||
        subtable.encodingID === 10))
  );
}

function format0Mappings(table) {
  const mappings = [];

  for (let codePoint = 0; codePoint < table.codeMap.length; codePoint++) {
    mappings.push({
      codePoint,
      glyphId: lazyGet(table.codeMap, codePoint),
    });
  }

  return mappings;
}

function format4Mappings(table) {
  const mappings = [];

  for (let segment = 0; segment < table.segCount; segment++) {
    const start = lazyGet(table.startCode, segment);
    const end = lazyGet(table.endCode, segment);
    const delta = lazyGet(table.idDelta, segment);
    const rangeOffset = lazyGet(table.idRangeOffset, segment);

    if (start === 0xffff && end === 0xffff) {
      continue;
    }

    for (let codePoint = start; codePoint <= end; codePoint++) {
      let glyphId;

      if (rangeOffset === 0) {
        glyphId = (codePoint + delta) & 0xffff;
      } else {
        const glyphIndex =
          rangeOffset / 2 + (codePoint - start) - (table.segCount - segment);
        glyphId = lazyGet(table.glyphIndexArray, glyphIndex) || 0;

        if (glyphId !== 0) {
          glyphId = (glyphId + delta) & 0xffff;
        }
      }

      mappings.push({ codePoint, glyphId });
    }
  }

  return mappings;
}

function format12Mappings(table) {
  const mappings = [];

  for (let index = 0; index < table.groups.length; index++) {
    const group = lazyGet(table.groups, index);

    for (
      let codePoint = group.startCharCode;
      codePoint <= group.endCharCode;
      codePoint++
    ) {
      mappings.push({
        codePoint,
        glyphId: group.glyphID + (codePoint - group.startCharCode),
      });
    }
  }

  return mappings;
}

function getMappings(table) {
  switch (table.version) {
    case 0:
      return format0Mappings(table);
    case 4:
      return format4Mappings(table);
    case 12:
      return format12Mappings(table);
    default:
      return [];
  }
}

function getGlyphName(glyphId) {
  const glyph = font.getGlyph(glyphId);
  return glyph.name || `glyph_${glyphId}`;
}

const glyphMap = {};
let processedTables = 0;
let skippedMissingGlyphs = 0;
let overwrittenConflicts = 0;

for (const cmap of font.cmap?.tables || []) {
  if (!isUnicodeCmap(cmap)) {
    continue;
  }

  processedTables++;

  for (const { codePoint, glyphId } of getMappings(cmap.table)) {
    if (!glyphId) {
      skippedMissingGlyphs++;
      continue;
    }

    const glyphName = getGlyphName(glyphId);

    // Match the Python version: if multiple Unicode cmap tables map the same
    // glyph name, the later table wins instead of creating duplicate keys.
    if (glyphMap[glyphName] !== undefined && glyphMap[glyphName] !== codePoint) {
      overwrittenConflicts++;
    }

    glyphMap[glyphName] = codePoint;
  }
}

const sortedGlyphMap = Object.fromEntries(
  Object.entries(glyphMap).sort(([a], [b]) => a.localeCompare(b))
);

fs.writeFileSync(outputPath, JSON.stringify(sortedGlyphMap, null, 2), "utf8");

console.log(`Glyphmap saved to ${outputPath}`);
console.log("Unicode cmap tables:", processedTables);
console.log("Glyphs:", Object.keys(sortedGlyphMap).length);
console.log("Skipped missing glyphs:", skippedMissingGlyphs);
console.log("Resolved conflicts by overwrite:", overwrittenConflicts);
