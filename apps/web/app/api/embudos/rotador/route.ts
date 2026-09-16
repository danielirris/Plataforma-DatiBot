import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRows,
  deleteRows,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { type RotadorRow } from "@/lib/embudos/types";
import { toProductoId } from "@/lib/producto/id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lee las variantes de rotador de un producto.
export async function GET(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ configurado: false, filas: [] }, { status: 200 });

  const producto = toProductoId(new URL(req.url).searchParams.get("producto") ?? "");
  if (!producto)
    return NextResponse.json({ error: "Falta el parámetro producto." }, { status: 400 });

  try {
    const filas = await selectRows<RotadorRow>("mensajes_rotador", {
      producto: `eq.${producto}`,
      order: "campo.asc,variante.asc",
    });
    return NextResponse.json({ configurado: true, filas });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo el rotador.";
    return NextResponse.json({ configurado: true, filas: [], error: msg }, { status });
  }
}

// Guarda el estado COMPLETO del rotador de un producto: upsert de lo enviado +
// borrado de lo que ya no está (para que quitar variantes/campos se refleje).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: {
    producto?: string;
    filas?: { campo?: string; variante?: number; texto?: string }[];
    vaciar?: boolean;
  } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const producto = toProductoId(String(body.producto ?? ""));
  if (!producto)
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  // ⛔ Salvaguarda anti-borrado (igual que en /pasos): sin filas y sin `vaciar:true`
  // NO se ejecuta el borrado-por-diff que dejaría el rotador vacío. Un embudo sin
  // variantes es legítimo, pero el constructor lo marca siempre con vaciar:true.
  const filasAusentes = !Array.isArray(body.filas) || body.filas.length === 0;
  if (filasAusentes && body.vaciar !== true)
    return NextResponse.json(
      { error: "No llegaron variantes. Para vaciar el rotador a propósito envía vaciar:true." },
      { status: 400 },
    );

  // Normaliza: solo variantes con campo y texto no vacíos.
  const deseadas: RotadorRow[] = [];
  for (const f of body.filas ?? []) {
    const campo = String(f.campo ?? "").trim();
    const texto = String(f.texto ?? "").trim();
    const variante = Number(f.variante);
    if (!campo || !texto || !Number.isFinite(variante)) continue;
    deseadas.push({ producto, campo, variante, texto });
  }

  try {
    // 1) Upsert de lo enviado (primero, para no perder nada si algo falla).
    if (deseadas.length)
      await upsertRows<RotadorRow>(
        "mensajes_rotador",
        deseadas as unknown as Record<string, unknown>[],
        "producto,campo,variante",
      );

    // 2) Borrar lo que estaba y ya no está (diff por campo+variante).
    const actuales = await selectRows<RotadorRow>("mensajes_rotador", {
      producto: `eq.${producto}`,
    });
    const enviadas = new Set(deseadas.map((d) => `${d.campo} ${d.variante}`));
    for (const a of actuales) {
      if (!enviadas.has(`${a.campo} ${a.variante}`)) {
        await deleteRows("mensajes_rotador", {
          producto: `eq.${producto}`,
          campo: `eq.${a.campo}`,
          variante: `eq.${a.variante}`,
        });
      }
    }

    return NextResponse.json({ ok: true, guardadas: deseadas.length });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el rotador.";
    return NextResponse.json({ error: msg }, { status });
  }
}
