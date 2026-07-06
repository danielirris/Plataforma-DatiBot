import { NextResponse } from "next/server";
import {
  TIPOS_IMAGEN,
  type Producto,
  type TipoImagen,
} from "@plataforma/products";
import { readConfig } from "@plataforma/config";
import { promptDeEscena } from "@/lib/ai/imagePrompts";
import { generarEscena, superponerOverlay } from "@/lib/ai/imageProvider";
import { leerVpsConfig, faltantesVps, subirImagen } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  producto: Producto;
  /** si viene, solo se generan estos tipos (regenerar por tipo) */
  tipos?: TipoImagen[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const p = body?.producto;
  if (!p?.nombre) {
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });
  }

  const store = await readConfig();
  const geminiKey = store["ia"]?.["gemini_api_key"] ?? "";
  const reglasImagen = store["ia"]?.["image_estilo"] ?? "";
  if (!geminiKey) {
    return NextResponse.json(
      { error: "Falta la Gemini API Key (grupo «Generación con IA»)." },
      { status: 502 },
    );
  }
  const vps = await leerVpsConfig();
  const faltan = faltantesVps(vps);
  if (faltan.length) {
    return NextResponse.json(
      { error: "Faltan datos del VPS en Configuración: " + faltan.join(", ") },
      { status: 502 },
    );
  }

  const tipos = body.tipos?.length ? body.tipos : TIPOS_IMAGEN;
  const identidad = [p.identidad?.promesa, p.identidad?.posicionamiento]
    .filter(Boolean)
    .join(" · ");
  const baseId = p.productoId || p.id || "prod";
  const stamp = Date.now();

  const imagenes: Record<string, string> = {};
  const errores: Record<string, string> = {};

  // Secuencial: evita rate limits y da errores claros por tipo.
  for (const tipo of tipos) {
    try {
      const prompt = promptDeEscena(tipo, p.nombre, identidad, reglasImagen);
      const escena = await generarEscena(prompt, geminiKey);
      const conTexto = await superponerOverlay(escena, p.overlays?.[tipo] ?? "");
      const nombre = `${baseId}-${tipo}-${stamp}.jpg`.replace(/[^a-zA-Z0-9._-]/g, "");
      imagenes[tipo] = await subirImagen(conTexto, nombre, vps);
    } catch (e) {
      errores[tipo] = e instanceof Error ? e.message : "error";
    }
  }

  return NextResponse.json({ imagenes, errores });
}
