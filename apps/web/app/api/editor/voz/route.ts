import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sube la LOCUCIÓN (audio) que se le pondrá al video. Se guarda en disco del web
// y luego /api/editor/jobs se la pasa al extractor por la red interna.
// Cuerpo crudo (sin FormData) para que el proxy no lo corte.

// Debe coincidir con el DIR_VOZ de /api/editor/jobs (una ruta de Next solo
// puede exportar handlers, por eso no se comparte por import).
const DIR_VOZ = path.join(os.tmpdir(), "datibot-voz");
const MAX = 60 * 1024 * 1024; // 60 MB (una locución larga cabe de sobra)
const EXT_OK = [".mp3", ".m4a", ".wav", ".aac", ".ogg"];

export async function POST(req: Request) {
  const u = new URL(req.url);
  const original = (u.searchParams.get("name") ?? "voz.mp3").slice(0, 180);
  const ext = path.extname(original).toLowerCase();
  if (!EXT_OK.includes(ext))
    return NextResponse.json(
      { error: `Audio no soportado (${ext || "sin extensión"}). Usa: ${EXT_OK.join(", ")}.` },
      { status: 400 },
    );

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length)
    return NextResponse.json({ error: "El archivo de audio llegó vacío." }, { status: 400 });
  if (buf.length > MAX)
    return NextResponse.json({ error: "El audio supera el máximo (60 MB)." }, { status: 413 });

  await mkdir(DIR_VOZ, { recursive: true });
  const nombre = `voz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  await writeFile(path.join(DIR_VOZ, nombre), buf);

  return NextResponse.json({ voz: nombre, original, bytes: buf.length });
}
