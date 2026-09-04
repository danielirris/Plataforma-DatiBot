import { NextResponse } from "next/server";
import { deleteRows, supabaseConfigurado, SupabaseError } from "@/lib/embudos/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ phone_id: string }> };

// Borra un número por su phone_id.
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  const { phone_id } = await params;
  const id = String(phone_id ?? "").trim();
  if (!id) return NextResponse.json({ error: "phone_id vacío." }, { status: 400 });

  try {
    await deleteRows("numeros", { phone_id: `eq.${id}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error borrando el número.";
    return NextResponse.json({ error: msg }, { status });
  }
}
