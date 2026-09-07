import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { PLANTILLAS, rutaPlantilla } from "@/lib/plantillas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista qué plantillas están cargadas (para mostrar el botón de descarga).
export async function GET() {
  const disponibles: Record<string, boolean> = {};
  for (const p of PLANTILLAS) {
    try {
      await fs.access(rutaPlantilla(p.slot));
      disponibles[p.slot] = true;
    } catch {
      disponibles[p.slot] = false;
    }
  }
  return NextResponse.json({ plantillas: PLANTILLAS, disponibles });
}
