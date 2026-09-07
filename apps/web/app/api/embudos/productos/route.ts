import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRows,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { type ProductoBot } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Columnas de texto de `productos` (todas menos la clave y precio_base numérico).
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
];

// Lee las filas (una por país) de un producto.
export async function GET(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ configurado: false, filas: [] }, { status: 200 });

  const producto = new URL(req.url).searchParams.get("producto")?.trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<ProductoBot>("productos", {
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
    const producto = String(f.producto ?? "").trim();
    const pais = String(f.pais ?? "").trim();
    if (!producto || !pais) continue; // sin clave completa no se puede upsertar
    const fila: Record<string, unknown> = { producto, pais };
    for (const c of CAMPOS_TEXTO) fila[c] = String(f[c] ?? "");
    fila.precio_base = coercePrecio(f.precio_base);
    filas.push(fila);
  }
  if (!filas.length)
    return NextResponse.json(
      { error: "Faltan producto y país en las filas." },
      { status: 400 },
    );

  try {
    const guardadas = await upsertRows<ProductoBot>("productos", filas, "producto,pais");
    return NextResponse.json({ filas: guardadas });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el producto.";
    return NextResponse.json({ error: msg }, { status });
  }
}
