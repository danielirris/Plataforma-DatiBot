import { NextResponse } from "next/server";
import { supabaseConfigurado, SupabaseError } from "@/lib/embudos/supabase";
import { renovarProducto, renovarVencidas } from "@/lib/embudos/renovar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { producto? }: renueva ese producto; sin producto, renueva los vencidos (>20 días).
// Lo usa el botón manual y también se puede apuntar un cron aquí (aunque ya corre solo,
// ver apps/web/instrumentation.ts).
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
    if (producto) {
      const resultados = await renovarProducto(producto);
      return NextResponse.json({ ok: true, resultados });
    }
    const { resultados } = await renovarVencidas();
    return NextResponse.json({ ok: true, resultados });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error renovando la media.";
    return NextResponse.json({ error: msg }, { status });
  }
}
