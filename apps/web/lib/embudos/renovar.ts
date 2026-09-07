// Renovación de la media de WhatsApp (los media_id caducan ~30 días). Re-descarga el
// original desde `img` (url guardada) y lo vuelve a subir a WhatsApp para refrescar el
// media_id. Lo usan: el botón manual (ruta /api/embudos/media/renovar) y el renovador
// automático (instrumentation.ts, corre solo cada día y solo toca lo vencido).
import { selectRows, upsertRow, supabaseConfigurado } from "./supabase";
import { SLOTS_MEDIA, columnasSlot, mimeDe, subirMediaWhatsApp } from "./media";
import { type NumeroBot } from "./types";

export const DIAS_RENOVAR = 20;

type MediaRow = Record<string, unknown> & {
  producto?: string;
  phone_id?: string;
  capi_token?: string;
};

export type ResultadoRenovar = { producto: string; renovados: number; errores: string[] };

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

// Renueva una fila: re-descarga cada archivo de su url y lo re-sube a WhatsApp.
export async function renovarFila(row: MediaRow): Promise<ResultadoRenovar> {
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

// Renueva toda la media de UN producto (botón manual).
export async function renovarProducto(producto: string): Promise<ResultadoRenovar[]> {
  if (!supabaseConfigurado()) return [];
  const filas = await selectRows<MediaRow>("media_bots", { producto: `eq.${producto}` });
  const out: ResultadoRenovar[] = [];
  for (const f of filas) out.push(await renovarFila(f));
  return out;
}

// Renueva SOLO la media vencida (más de `dias` sin refrescar). Lo llama el cron interno.
export async function renovarVencidas(dias = DIAS_RENOVAR): Promise<{
  corrio: boolean;
  resultados: ResultadoRenovar[];
}> {
  if (!supabaseConfigurado()) return { corrio: false, resultados: [] };
  const limite = new Date(Date.now() - dias * 86400_000).toISOString();
  let filas: MediaRow[] = [];
  try {
    filas = await selectRows<MediaRow>("media_bots", { media_actualizado_at: `lt.${limite}` });
  } catch {
    return { corrio: false, resultados: [] };
  }
  const resultados: ResultadoRenovar[] = [];
  for (const f of filas) resultados.push(await renovarFila(f));
  return { corrio: true, resultados };
}
