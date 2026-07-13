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

// Explicit allowlist rather than `origin: true` (reflects any origin) —
// this API is served cross-origin from a static GitHub Pages frontend, so
// an open policy would let any site on the internet call it. Extra origins
// (a staging domain, a custom production domain) can be added without a
// code change via the comma-separated CORS_ORIGINS env var.
const defaultAllowedOrigins = [
  "http://localhost:5174",
  "https://chanphiromsok.github.io",
];
const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...(process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []),
]);
app.register(cors, {
  origin(origin, callback) {
    // No Origin header (curl, same-origin, server-to-server) is allowed
    // through; browser cross-origin requests are checked against the list.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed`), false);
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

// Mounted under /api so the same path (`/api/report/export/...`) works
// whether a request reaches this server directly in production or via the
// dev server's Vite proxy at packages/visual-editor/vite.config.ts.
app.register(
  async (instance) => {
    await registerReportRoutes(instance);
  },
  { prefix: "/api" },
);
app.get("/health", async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
console.log(`komnour server → http://localhost:${port}`);
