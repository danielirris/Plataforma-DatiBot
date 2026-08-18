import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sube el VIDEO-GUÍA que se sobrepone (PiP) al anuncio. Se guarda en disco del web
// y luego /api/editor/jobs lo pasa al extractor por la red interna (multipart, clave
// "guias"). Cuerpo crudo (sin FormData) para que el proxy no lo corte.

// Debe coincidir con el DIR_GUIA de /api/editor/jobs (una ruta de Next solo puede
// exportar handlers, por eso no se comparte por import).
const DIR_GUIA = path.join(os.tmpdir(), "datibot-guias");
const MAX = 120 * 1024 * 1024; // 120 MB
const EXT_OK = [".mp4", ".mov", ".webm", ".m4v", ".mkv"];

export async function POST(req: Request) {
  const u = new URL(req.url);
  const original = (u.searchParams.get("name") ?? "guia.mp4").slice(0, 180);
  const ext = path.extname(original).toLowerCase();
  if (!EXT_OK.includes(ext))
    return NextResponse.json(
      { error: `Video no soportado (${ext || "sin extensión"}). Usa: ${EXT_OK.join(", ")}.` },
      { status: 400 },
    );

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length)
    return NextResponse.json({ error: "El video llegó vacío." }, { status: 400 });
  if (buf.length > MAX)
    return NextResponse.json({ error: "El video supera el máximo (120 MB)." }, { status: 413 });

  await mkdir(DIR_GUIA, { recursive: true });
  const nombre = `guia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await writeFile(path.join(DIR_GUIA, nombre), buf);

  return NextResponse.json({ guia: nombre, original, bytes: buf.length });
}
