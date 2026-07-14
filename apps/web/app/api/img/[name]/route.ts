import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
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
// los anuncios puedan cargarla. Así el web escribe Y sirve: sin depender de que
// nginx comparta el volumen.
export async function GET(_req: Request, { params }: Ctx) {
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

  try {
    const buf = await readFile(full);
    const ext = path.extname(base).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Imagen no encontrada." }, { status: 404 });
  }
}
