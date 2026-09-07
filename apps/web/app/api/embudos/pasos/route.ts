import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRows,
  deleteRows,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { type PasoEmbudo } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lee los pasos del embudo de un producto.
export async function GET(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ configurado: false, filas: [] }, { status: 200 });

  const producto = new URL(req.url).searchParams.get("producto")?.trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<PasoEmbudo>("pasos_embudo", {
      producto: `eq.${producto}`,
      order: "estado.asc,orden.asc",
    });
    return NextResponse.json({ configurado: true, filas });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo el embudo.";
    return NextResponse.json({ configurado: true, filas: [], error: msg }, { status });
  }
}

const num = (v: unknown, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
};

// Guarda el estado COMPLETO del embudo de un producto: upsert por (producto,estado,orden)
// + borrado por diff de los pasos que ya no están (posicional).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: { producto?: string; filas?: Partial<PasoEmbudo>[] } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const producto = String(body.producto ?? "").trim();
  if (!producto)
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  const deseadas: PasoEmbudo[] = [];
  for (const f of body.filas ?? []) {
    const estado = String(f.estado ?? "").trim();
    const tipo = String(f.tipo ?? "").trim();
    if (!estado || !tipo) continue;
    deseadas.push({
      producto,
      estado,
      orden: num(f.orden, deseadas.length + 1),
      tipo,
      contenido: String(f.contenido ?? ""),
      fuente: String(f.fuente ?? ""),
      delay_segundos: num(f.delay_segundos, 0),
    });
  }

  try {
    if (deseadas.length)
      await upsertRows<PasoEmbudo>(
        "pasos_embudo",
        deseadas as unknown as Record<string, unknown>[],
        "producto,estado,orden",
      );

    // Borra los pasos que ya no están (por posición estado+orden).
    const actuales = await selectRows<PasoEmbudo>("pasos_embudo", {
      producto: `eq.${producto}`,
    });
    const enviadas = new Set(deseadas.map((d) => `${d.estado} ${d.orden}`));
    for (const a of actuales) {
      if (!enviadas.has(`${a.estado} ${a.orden}`)) {
        await deleteRows("pasos_embudo", {
          producto: `eq.${producto}`,
          estado: `eq.${a.estado}`,
          orden: `eq.${a.orden}`,
        });
      }
    }

    return NextResponse.json({ ok: true, guardados: deseadas.length });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el embudo.";
    return NextResponse.json({ error: msg }, { status });
  }
}
