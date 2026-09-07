import { NextResponse } from "next/server";
import { readConfig } from "@plataforma/config";
import { PAISES_EMBUDO } from "@/lib/embudo/paises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve los precios globales (montos de la escalera por país). Se guardan en
// Configuración (clave `precios` del almacén, comma-separados por país); si un país
// no está configurado, se usan los montos por defecto de PAISES_EMBUDO. Devuelve SOLO
// los precios (no el resto del config) para no exponer nada sensible al navegador.
export async function GET() {
  const precios: Record<string, number[]> = {};
  for (const p of PAISES_EMBUDO) precios[p.codigo] = [...p.montos];

  try {
    const cfg = await readConfig();
    const guardados = cfg?.precios as Record<string, string> | undefined;
    if (guardados) {
      for (const p of PAISES_EMBUDO) {
        const raw = guardados[p.codigo];
        if (!raw) continue;
        const nums = raw.split(",").map((s) => Number(String(s).trim()));
        // Mezcla por posición: usa el valor guardado si es válido, si no el default.
        precios[p.codigo] = p.montos.map((d, i) => (Number.isFinite(nums[i]) ? nums[i] : d));
      }
    }
  } catch {
    /* si falla la lectura, quedan los defaults */
  }

  return NextResponse.json({ precios });
}
