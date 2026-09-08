import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { type NumeroBot } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista los números configurados (tabla `numeros` en Supabase).
export async function GET() {
  if (!supabaseConfigurado())
    return NextResponse.json(
      { configurado: false, numeros: [], error: "Supabase no configurado." },
      { status: 200 },
    );
  try {
    const numeros = await selectRows<NumeroBot>("numeros", {
      order: "numero_whatsapp.asc",
    });
    return NextResponse.json({ configurado: true, numeros });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error leyendo números.";
    return NextResponse.json({ configurado: true, numeros: [], error: msg }, { status });
  }
}

const CAMPOS: (keyof NumeroBot)[] = [
  "phone_id",
  "nombre",
  "numero_whatsapp",
  "waba_id",
  "capi_token",
  "account_id",
  "credencial_wa",
  "pais",
  "producto_activo",
];

// Crea o actualiza un número (upsert por phone_id).
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body: Partial<NumeroBot> = {};
  try {
    body = ((await req.json()) as Partial<NumeroBot>) ?? {};
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const phone_id = String(body.phone_id ?? "").trim();
  const numero = String(body.numero_whatsapp ?? "").trim();
  if (!phone_id)
    return NextResponse.json({ error: "El phone_id es obligatorio." }, { status: 400 });
  if (!numero)
    return NextResponse.json({ error: "El número de WhatsApp es obligatorio." }, { status: 400 });

  // Solo persistimos los campos conocidos (evita meter columnas extra por error).
  const fila: Record<string, unknown> = {};
  for (const c of CAMPOS) fila[c] = String(body[c] ?? "").trim();

  try {
    const guardado = await upsertRow<NumeroBot>("numeros", fila, "phone_id");
    return NextResponse.json({ numero: guardado });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el número.";
    return NextResponse.json({ error: msg }, { status });
  }
}
