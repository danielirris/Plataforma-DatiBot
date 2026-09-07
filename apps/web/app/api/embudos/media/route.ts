import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MediaRow = Record<string, unknown> & { producto?: string };

// Columnas de caption que la app puede editar sin re-subir el archivo.
const CAPTIONS = [
  "video_caption",
  "pdf_1_caption",
  "pdf_2_caption",
  "pdf_3_caption",
  "pdf_4_caption",
  "pdf_5_caption",
  "pdf_6_caption",
];

// Lee la fila de media de un producto.
export async function GET(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ configurado: false, media: null }, { status: 200 });

  const producto = new URL(req.url).searchParams.get("producto")?.trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
    return NextResponse.json({ configurado: true, media: filas[0] ?? null });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo la media.";
    return NextResponse.json({ configurado: true, media: null, error: msg }, { status });
  }
}

// Guarda solo los captions (sin re-subir archivos).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: { producto?: string; campos?: Record<string, string> } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const producto = String(body.producto ?? "").trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  const fila: Record<string, unknown> = { producto };
  for (const c of CAPTIONS) {
    if (body.campos && c in body.campos) fila[c] = String(body.campos[c] ?? "");
  }

  try {
    const guardado = await upsertRow<MediaRow>("media_bots", fila, "producto");
    return NextResponse.json({ media: guardado });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando los captions.";
    return NextResponse.json({ error: msg }, { status });
  }
}
