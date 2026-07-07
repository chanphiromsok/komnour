import Fastify from "fastify";
import cors from "@fastify/cors";
import { join } from "node:path";
import { Font } from "sone";
import { registerReportRoutes } from "./reportRoutes";

const glyphFonts = join(import.meta.dirname, "../../glyphs/fonts");

Font.load(
  "KhmerOSsiemreap",
  join(glyphFonts, "KhmerOsSiemreab/KhmerOSsiemreap.ttf"),
);
Font.load("Kh-Siemreap", join(glyphFonts, "KhSiemreap/Kh-Siemreap.ttf"));
Font.load(
  "Khmer-OS-Muol-Light",
  join(glyphFonts, "KhmerOSMuolLight/Khmer-OS-Muol-Light.ttf"),
);
Font.load("Wingdings2", join(glyphFonts, "KhmerWing2/wingdings2.ttf"));

const app = Fastify({ logger: false });
app.register(cors, { origin: true });
registerReportRoutes(app);
app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
console.log(`komnour server → http://localhost:${port}`);
