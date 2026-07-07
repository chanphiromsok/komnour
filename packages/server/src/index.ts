import Fastify from "fastify";
import cors from "@fastify/cors";
import { join } from "node:path";
import { renderToBuffer, renderToPages, sanitize } from "@komnour/core";
import { Font } from "sone";
import { registerReportRoutes } from "./reportRoutes";

const glyphFonts = join(import.meta.dirname, "../../glyphs/fonts");

Font.load("KhmerOSsiemreap", join(glyphFonts, "KhmerOsSiemreab/KhmerOSsiemreap.ttf"));
Font.load("Kh-Siemreap",     join(glyphFonts, "KhSiemreap/Kh-Siemreap.ttf"));
Font.load("Khmer-OS-Muol-Light", join(glyphFonts, "KhmerOSMuolLight/Khmer-OS-Muol-Light.ttf"));
Font.load("Wingdings2",      join(glyphFonts, "KhmerWing2/wingdings2.ttf"));

const app = Fastify({ logger: false });
app.register(cors, { origin: true });
registerReportRoutes(app);
app.get("/health", async () => ({ ok: true }));

// POST /render  body: { html, format? }  → image/png or application/pdf
app.post<{ Body: { html: string; format?: "png" | "pdf" } }>(
  "/render",
  {
    config: { rawBody: false },
  },
  async (req, reply) => {
    const { html, format = "png" } = req.body;
    if (!html || typeof html !== "string") {
      return reply.status(400).send({ error: "html is required" });
    }

    try {
      const buf = await renderToBuffer(html, format);
      const contentType = format === "pdf" ? "application/pdf" : "image/png";
      reply.header("Content-Type", contentType);
      return reply.send(buf);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  },
);

// POST /preview-pages  body: { html }  → { pages: string[] }  (base64 PNG per page)
app.post<{ Body: { html: string } }>("/preview-pages", async (req, reply) => {
  const { html } = req.body;
  if (!html) return reply.status(400).send({ error: "html is required" });
  try {
    const buffers = await renderToPages(html);
    return { pages: buffers.map((b) => b.toString("base64")) };
  } catch (err: any) {
    return reply.status(500).send({ error: err.message });
  }
});

// POST /sanitize  body: { html }  → { html, warnings }
app.post<{ Body: { html: string } }>("/sanitize", async (req, reply) => {
  const { html } = req.body;
  if (!html) return reply.status(400).send({ error: "html is required" });
  return sanitize(html);
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
console.log(`komnour server → http://localhost:${port}`);
