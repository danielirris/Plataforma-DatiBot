import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { leerVpsConfig } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

// Sirve una imagen/video escrito por subirImagen desde el volumen local del web.
// Es PÚBLICA (excluida del Basic Auth en middleware) para que n8n, los ebooks y
// los anuncios puedan cargarla. Sirve por STREAMING (nunca carga el archivo entero en
// RAM) y soporta Range (206) para que los videos se puedan buscar/seek sin re-descargar.
export async function GET(req: Request, { params }: Ctx) {
  const { name } = await params;
  const dir = (await leerVpsConfig()).localDir || process.env.VPS_LOCAL_DIR || "";
  if (!dir)
    return NextResponse.json({ error: "Servidor de imágenes no configurado." }, { status: 500 });

  // Solo el nombre de archivo (sin rutas): evita path traversal.
  const base = path.basename(name);
  if (base !== name || base.includes("..")) {
    return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
  }
  const full = path.join(dir.replace(/\/+$/, ""), base);
  const ext = path.extname(base).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";

  let size: number;
  try {
    const st = await stat(full);
    if (!st.isFile()) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    size = st.size;
  } catch {
    return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    // Evita que el navegador adivine el tipo (no servir HTML/SVG ejecutable por error).
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };

  // Petición con Range (típico en <video>): responde 206 con solo el trozo pedido.
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) {
        return new NextResponse("Rango no satisfacible", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
        });
      }
      const stream = createReadStream(full, { start, end });
      return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  const stream = createReadStream(full);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
