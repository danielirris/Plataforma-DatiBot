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
    // El capi_token (System User de Meta) NUNCA viaja al navegador. Enviamos solo un
    // flag de si está configurado; el form lo reescribe solo si el usuario teclea uno.
    const safe = numeros.map((n) => {
      const { capi_token, ...rest } = n;
      return {
        ...rest,
        capi_token: "",
        capi_token_set: Boolean(capi_token && String(capi_token).trim()),
      };
    });
    return NextResponse.json({ configurado: true, numeros: safe });
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
  "cuenta_publicitaria",
  "perfil",
  "aplicacion",
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

  // Guardado PARCIAL (patch): construimos la fila SOLO con las columnas que el front
  // realmente mandó (las que el usuario cambió respecto a lo cargado) + la clave. Una
  // columna AUSENTE del body no se incluye → el upsert (merge-duplicates) NO la toca y
  // Supabase conserva su valor. Una columna PRESENTE con "" es un borrado intencional y
  // sí se escribe. Así editar un solo campo ya no borra los demás.
  const fila: Record<string, unknown> = { phone_id };
  for (const c of CAMPOS) {
    if (c === "phone_id") continue; // ya está (PK, no editable)
    if (c === "capi_token") {
      // El form no recibe el token guardado (S2): si llega vacío/ausente, NO lo pisamos —
      // el merge-duplicates conserva el valor de la base. Solo lo escribimos si el
      // usuario tecleó uno nuevo.
      const t = String(body.capi_token ?? "").trim();
      if (t) fila.capi_token = t;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(body, c)) {
      fila[c] = String(body[c] ?? "").trim();
    }
  }

  try {
    const guardado = await upsertRow<NumeroBot>("numeros", fila, "phone_id");
    return NextResponse.json({ numero: guardado });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando el número.";
    return NextResponse.json({ error: msg }, { status });
  }
}
