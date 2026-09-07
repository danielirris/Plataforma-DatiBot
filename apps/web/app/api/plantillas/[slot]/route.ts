import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { esSlotValido, plantillasDir, rutaPlantilla } from "@/lib/plantillas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ slot: string }> };

// Descarga la plantilla como archivo .json.
export async function GET(_req: Request, { params }: Ctx) {
  const { slot } = await params;
  if (!esSlotValido(slot))
    return NextResponse.json({ error: "Plantilla no válida." }, { status: 400 });
  let contenido: string;
  try {
    contenido = await fs.readFile(rutaPlantilla(slot), "utf8");
  } catch {
    return NextResponse.json(
      { error: "Esa plantilla aún no se ha subido." },
      { status: 404 },
    );
  }
  return new NextResponse(contenido, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slot}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

// Sube (reemplaza) la plantilla. Acepta el archivo .json en multipart (campo "archivo").
export async function POST(req: Request, { params }: Ctx) {
  const { slot } = await params;
  if (!esSlotValido(slot))
    return NextResponse.json({ error: "Plantilla no válida." }, { status: 400 });

  let texto = "";
  try {
    const form = await req.formData();
    const archivo = form.get("archivo");
    if (archivo instanceof File) texto = await archivo.text();
  } catch {
    /* intentará leer como texto plano abajo */
  }
  if (!texto) {
    try {
      texto = await req.text();
    } catch {
      /* nada */
    }
  }
  texto = texto.trim();
  if (!texto)
    return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });

  // Validamos que sea JSON (los workflows de n8n lo son).
  try {
    JSON.parse(texto);
  } catch {
    return NextResponse.json(
      { error: "El archivo no es un JSON válido (exporta el workflow de n8n)." },
      { status: 400 },
    );
  }

  try {
    await fs.mkdir(plantillasDir(), { recursive: true });
    await fs.writeFile(path.join(plantillasDir(), `${slot}.json`), texto, "utf8");
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar: " + (e instanceof Error ? e.message : "?") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
