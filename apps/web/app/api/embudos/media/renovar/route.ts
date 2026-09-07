import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { SLOTS_MEDIA, columnasSlot, mimeDe, subirMediaWhatsApp } from "@/lib/embudos/media";
import { type NumeroBot } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type MediaRow = Record<string, unknown> & { producto?: string; phone_id?: string; capi_token?: string };

// Días tras los cuales conviene renovar (los media_id caducan ~30 días sin uso).
const DIAS_RENOVAR = 20;

async function tokenDeNumero(phone_id: string, fallback: string): Promise<string> {
  try {
    const nums = await selectRows<NumeroBot>("numeros", { phone_id: `eq.${phone_id}` });
    const t = String(nums[0]?.capi_token ?? "").trim();
    if (t) return t;
  } catch {
    /* usa el fallback */
  }
  return fallback;
}

// Renueva una fila: re-descarga cada archivo de su url y re-sube a WhatsApp.
async function renovarFila(row: MediaRow): Promise<{ producto: string; renovados: number; errores: string[] }> {
  const producto = String(row.producto ?? "");
  const phone_id = String(row.phone_id ?? "").trim();
  const errores: string[] = [];
  if (!phone_id) return { producto, renovados: 0, errores: ["sin phone_id"] };

  const token = await tokenDeNumero(phone_id, String(row.capi_token ?? ""));
  if (!token) return { producto, renovados: 0, errores: ["sin token"] };

  const cambios: Record<string, unknown> = { producto };
  let renovados = 0;

  for (const slot of SLOTS_MEDIA) {
    const cols = columnasSlot(slot)!;
    const url = String(row[cols.url] ?? "").trim();
    if (!url) continue;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`descarga ${r.status}`);
      const buffer = Buffer.from(await r.arrayBuffer());
      const nombre = String(row[cols.filename ?? ""] ?? url.split("/").pop() ?? `${slot}.bin`);
      const mediaId = await subirMediaWhatsApp(phone_id, token, buffer, nombre, mimeDe(nombre));
      cambios[cols.media_id] = mediaId;
      renovados += 1;
    } catch (e) {
      errores.push(`${slot}: ${e instanceof Error ? e.message : "?"}`);
    }
  }

  if (renovados > 0) {
    cambios.media_actualizado_at = new Date().toISOString();
    await upsertRow("media_bots", cambios, "producto");
  }
  return { producto, renovados, errores };
}

// POST { producto? }: renueva ese producto; sin producto, renueva los vencidos (cron).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: { producto?: string } = {};
  try {
    body = ((await req.json().catch(() => ({}))) as typeof body) ?? {};
  } catch {
    /* opcional */
  }
  const producto = String(body.producto ?? "").trim();

  try {
    let filas: MediaRow[];
    if (producto) {
      filas = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
    } else {
      const limite = new Date(Date.now() - DIAS_RENOVAR * 86400_000).toISOString();
      filas = await selectRows<MediaRow>("media_bots", {
        media_actualizado_at: `lt.${limite}`,
      });
    }
    const resultados = [];
    for (const f of filas) resultados.push(await renovarFila(f));
    return NextResponse.json({ ok: true, resultados });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error renovando la media.";
    return NextResponse.json({ error: msg }, { status });
  }
}
