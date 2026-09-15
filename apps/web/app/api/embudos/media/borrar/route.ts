import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { leerVpsConfig, eliminarImagen } from "@/lib/vps/upload";
import { SLOTS_MEDIA, columnasSlot } from "@/lib/embudos/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MediaRow = Record<string, unknown> & { producto?: string };

// Borra la media de un producto: un slot ({producto, slot}) o TODA ({producto, todo:true}).
// Limpia el original en `img` y vacía las columnas del slot en media_bots. Vaciar TODO
// además suelta el número (phone_id/capi_token) para poder migrar el producto a otro
// número (los media_id están atados al número que los emitió).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: { producto?: string; slot?: string; todo?: boolean } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const producto = String(body.producto ?? "").trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  const slot = String(body.slot ?? "").trim();
  const slots = body.todo ? [...SLOTS_MEDIA] : columnasSlot(slot) ? [slot] : [];
  if (!slots.length)
    return NextResponse.json({ error: "Slot inválido." }, { status: 400 });

  // Fila actual: necesaria para saber qué originales borrar de img.
  let fila: MediaRow | null = null;
  try {
    const filas = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
    fila = filas[0] ?? null;
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
  if (!fila) return NextResponse.json({ media: null }); // no hay nada que borrar

  // Borra los originales de img (best-effort) y arma el vaciado de columnas.
  const cfg = await leerVpsConfig();
  const cambios: Record<string, unknown> = { producto };
  for (const s of slots) {
    const c = columnasSlot(s)!;
    const url = String(fila[c.url] ?? "").trim();
    if (url) await eliminarImagen(url, cfg).catch(() => {});
    cambios[c.url] = "";
    cambios[c.media_id] = "";
    cambios[c.caption] = "";
    if (c.filename) cambios[c.filename] = "";
  }
  // Vaciar TODO suelta el número para poder migrar el producto a otro.
  if (body.todo) {
    cambios.phone_id = "";
    cambios.capi_token = "";
  }

  try {
    const guardado = await upsertRow<MediaRow>("media_bots", cambios, "producto");
    if (guardado) delete (guardado as Record<string, unknown>).capi_token;
    return NextResponse.json({ media: guardado });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error borrando la media.";
    return NextResponse.json({ error: msg }, { status });
  }
}
