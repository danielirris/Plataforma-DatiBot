import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sube el VIDEO-GANCHO que abre un anuncio (uno por anuncio, opcional). Se guarda en
// disco del web y luego /api/editor/jobs lo pasa al extractor por la red interna
// (multipart). Cuerpo crudo (sin FormData) para que el proxy no lo corte.

// Debe coincidir con el DIR_HOOK de /api/editor/jobs (una ruta de Next solo puede
// exportar handlers, por eso no se comparte por import).
const DIR_HOOK = path.join(os.tmpdir(), "datibot-hooks");
const MAX = 120 * 1024 * 1024; // 120 MB (un gancho corto cabe de sobra)
const EXT_OK = [".mp4", ".mov", ".mkv"];

export async function POST(req: Request) {
  const u = new URL(req.url);
  const original = (u.searchParams.get("name") ?? "gancho.mp4").slice(0, 180);
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

  await mkdir(DIR_HOOK, { recursive: true });
  const nombre = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await writeFile(path.join(DIR_HOOK, nombre), buf);

  return NextResponse.json({ hook: nombre, original, bytes: buf.length });
}
