import { NextResponse } from "next/server";
import {
  selectRows,
  updateRows,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { toProductoId } from "@/lib/producto/id";

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

  const producto = toProductoId(new URL(req.url).searchParams.get("producto") ?? "");
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
    const row = filas[0] ?? null;
    // El capi_token no lo usa el cliente y es SENSIBLE: no debe salir del servidor.
    if (row) delete (row as Record<string, unknown>).capi_token;
    return NextResponse.json({ configurado: true, media: row });
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

  const producto = toProductoId(String(body.producto ?? ""));
  if (!producto)
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  // Los captions van SOBRE una media ya subida. Verificamos que la fila EXISTA y luego
  // usamos PATCH (no upsert): así NO incluimos phone_id (NOT NULL). Un upsert que omite
  // phone_id falla AUNQUE la fila exista, porque Postgres valida NOT NULL sobre la fila
  // propuesta para INSERT antes de resolver el ON CONFLICT a UPDATE. Si no hay fila,
  // guiamos a subir el archivo primero (la subida ya guarda el caption con la media).
  let existentes: MediaRow[] = [];
  try {
    existentes = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo la media.";
    return NextResponse.json({ error: msg }, { status });
  }
  if (!existentes.length)
    return NextResponse.json(
      {
        error:
          "Todavía no hay media para este producto. Sube primero el archivo — el caption se guarda junto con él.",
      },
      { status: 400 },
    );

  const cambios: Record<string, unknown> = {};
  for (const c of CAPTIONS) {
    if (body.campos && c in body.campos) cambios[c] = String(body.campos[c] ?? "");
  }
  if (!Object.keys(cambios).length) {
    const g = { ...existentes[0] } as Record<string, unknown>;
    delete g.capi_token;
    return NextResponse.json({ media: g });
  }

  try {
    const filas = await updateRows<MediaRow>("media_bots", cambios, { producto: `eq.${producto}` });
    const guardado = filas[0];
    if (guardado) delete (guardado as Record<string, unknown>).capi_token;
    return NextResponse.json({ media: guardado });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando los captions.";
    return NextResponse.json({ error: msg }, { status });
  }
}
