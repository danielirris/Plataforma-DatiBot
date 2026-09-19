import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { type ProductoBot } from "@/lib/embudos/types";
import { toProductoId } from "@/lib/producto/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La config del bot vive en la tabla `config_bots` de Supabase (NO en `productos`, que
// es el catálogo de precios/negocio y no tiene columnas de mensajes/prompts). La ruta se
// sigue llamando "productos" por la URL, pero lee/escribe `config_bots`.
// Columnas de texto de `config_bots` (todas menos la clave y precio_base numérico).
const CAMPOS_TEXTO: (keyof ProductoBot)[] = [
  "pixel_id",
  "page_id",
  "msg_bienvenida",
  "msg_cobro",
  "msg_bonos_intro",
  "msg_datos_pago",
  "msg_felicitacion",
  "system_prompt_convencer",
  "system_prompt_cobrar",
  "titular_cuenta",
  "numero_cuenta",
  "metodo_pago",
  "metodos_pago_texto",
  "brec_alias",
  "moneda",
  "moneda_simbolo",
  "validacion_titular",
  "validacion_cuenta_hint",
  "validacion_alias",
  "nivel_1_texto",
  "nivel_2_texto",
  "nivel_3_texto",
  "nivel_4_texto",
  "nivel_5_texto",
  "nivel_6_texto",
  "nivel_7_texto",
];

// Columnas NUMÉRICAS (se guardan con coercePrecio → número o null). El monto mínimo de
// cada nivel de entrega cambia por país, igual que precio_base.
const CAMPOS_NUM: (keyof ProductoBot)[] = [
  "precio_base",
  "nivel_1_min",
  "nivel_2_min",
  "nivel_3_min",
  "nivel_4_min",
  "nivel_5_min",
  "nivel_6_min",
  "nivel_7_min",
];

// Lee las filas (una por país) de un producto.
export async function GET(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ configurado: false, filas: [] }, { status: 200 });

  const producto = toProductoId(new URL(req.url).searchParams.get("producto") ?? "");
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<ProductoBot>("config_bots", {
      producto: `eq.${producto}`,
      order: "pais.asc",
    });
    return NextResponse.json({ configurado: true, filas });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo el producto.";
    return NextResponse.json({ configurado: true, filas: [], error: msg }, { status });
  }
}

function coercePrecio(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Upsert de las filas del producto (una por país). onConflict = (producto, pais).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: { filas?: Partial<ProductoBot>[] } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const entradas = Array.isArray(body.filas) ? body.filas : [];
  if (!entradas.length)
    return NextResponse.json({ error: "No hay filas para guardar." }, { status: 400 });

  const filas: Record<string, unknown>[] = [];
  for (const f of entradas) {
    const producto = toProductoId(String(f.producto ?? ""));
    const pais = String(f.pais ?? "").trim();
    if (!producto || !pais) continue; // sin clave completa no se puede upsertar
    // Guardado PARCIAL (patch): la clave siempre; el resto SOLO si el front lo mandó
    // (campo que el usuario cambió). Columna ausente → no se incluye → merge-duplicates
    // NO la toca y Supabase la conserva. Columna presente con "" → borrado intencional.
    const fila: Record<string, unknown> = { producto, pais };
    for (const c of CAMPOS_TEXTO) {
      if (Object.prototype.hasOwnProperty.call(f, c)) fila[c] = String(f[c] ?? "");
    }
    for (const c of CAMPOS_NUM) {
      if (Object.prototype.hasOwnProperty.call(f, c)) fila[c] = coercePrecio(f[c]);
    }
    filas.push(fila);
  }
  if (!filas.length)
    return NextResponse.json(
      { error: "Faltan producto y país en las filas." },
      { status: 400 },
    );

  // Un upsert POR PAÍS (no en lote): con el guardado parcial cada fila puede llevar un
  // set de columnas distinto, y PostgREST rechaza un insert en lote con claves
  // heterogéneas (PGRST102 "All object keys must match"). Fila por fila lo evita.
  // Trade-off aceptado: N transacciones en vez de 1 (config de admin, baja frecuencia).
  try {
    const guardadas: ProductoBot[] = [];
    for (const fila of filas) {
      const g = await upsertRow<ProductoBot>("config_bots", fila, "producto,pais");
      if (g) guardadas.push(g);
    }
    return NextResponse.json({ filas: guardadas });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el producto.";
    return NextResponse.json({ error: msg }, { status });
  }
}
