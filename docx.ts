import { docxToHtml } from "./packages/docx/src";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (p: string) => join(__dirname, p);
const fontsDir = load("contract.docx");

docxToHtml(readFileSync(fontsDir)).then((v) => {
  console.log(v.html);
});
