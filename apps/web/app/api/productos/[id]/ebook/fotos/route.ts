import { NextResponse } from "next/server";
import { getProduct, type Producto, type EbookFoto } from "@plataforma/products";
import { readConfig } from "@plataforma/config";
import { generarEscena } from "@/lib/ai/imageProvider";
import { leerVpsConfig, faltantesVps, subirImagen } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Fotos realistas del ebook con Gemini. index = -1 → portada; si no, capítulo.
// Las fotos se suben al servidor de imágenes y el bloque `image` del motor las
// referencia por nombre de archivo al renderizar.

function promptFoto(
  titulo: string,
  contexto: string,
  esPortada: boolean,
): string {
  const base = esPortada
    ? `Fotografía de portada para el ebook «${titulo}». ${contexto}`
    : `Fotografía para el capítulo «${titulo}» de un ebook. ${contexto}`;
  return `${base}
Estilo OBLIGATORIO: fotografía REAL tomada con cámara profesional — luz natural suave, composición apetitosa/atractiva, enfoque nítido con fondo levemente desenfocado, colores fieles. Si es comida o recetas: estilismo gastronómico realista (ingredientes frescos, vajilla sencilla, mesa de madera o superficie neutra).
PROHIBIDO: texto, letras, logos, marcas de agua, ilustración, dibujo, render 3D, aspecto artificial o plástico.`;
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; index?: number; cantidad?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const idea = producto.ebook?.idea;
  if (!idea?.titulo)
    return NextResponse.json(
      { error: "Primero genera la idea del ebook (Fase 1)." },
      { status: 400 },
    );

  const geminiKey = (await readConfig())["ia"]?.["gemini_api_key"] ?? "";
  if (!geminiKey)
    return NextResponse.json(
      { error: "Falta la Gemini API Key (IA_GEMINI_API_KEY)." },
      { status: 502 },
    );
  const vps = await leerVpsConfig();
  const faltan = faltantesVps(vps);
  if (faltan.length)
    return NextResponse.json(
      { error: "Falta configurar el servidor de imágenes: " + faltan.join(", ") },
      { status: 502 },
    );

  const index = Number(body.index);
  const esPortada = index === -1;
  const capitulos = producto.ebook?.capitulos ?? [];
  if (!esPortada && (!Number.isInteger(index) || index < 0 || index >= capitulos.length))
    return NextResponse.json({ error: "Índice de capítulo inválido." }, { status: 400 });

  const cap = esPortada ? null : capitulos[index];
  const cantidad = esPortada
    ? 1
    : Math.min(4, Math.max(1, Number(body.cantidad) || cap?.num_fotos || 1));

  const titulo = esPortada ? idea.titulo : cap!.titulo;
  const contexto = esPortada
    ? `Tema del libro: ${idea.concepto}`
    : `${cap!.resumen}. Libro: «${idea.titulo}» (${idea.concepto.slice(0, 160)})`;

  const baseId = (producto.productoId || producto.id || "prod").replace(/[^a-zA-Z0-9_-]/g, "");
  const stamp = Date.now();
  const fotos: EbookFoto[] = [];
  const errores: string[] = [];

  // Secuencial: evita rate limits de imagen y da errores claros.
  for (let k = 0; k < cantidad; k++) {
    try {
      const variacion = cantidad > 1 ? ` Variación ${k + 1} de ${cantidad}: cambia el encuadre y los elementos.` : "";
      const buf = await generarEscena(promptFoto(titulo, contexto, esPortada) + variacion, geminiKey);
      const nombre = `eb-${baseId}-${esPortada ? "portada" : `cap${index + 1}`}-${k + 1}-${stamp}.jpg`;
      const url = await subirImagen(buf, nombre, vps);
      fotos.push({ url, nombre });
    } catch (e) {
      errores.push(e instanceof Error ? e.message : "error");
    }
  }

  if (!fotos.length)
    return NextResponse.json(
      { error: "No se pudo generar ninguna foto: " + errores.join("; ") },
      { status: 502 },
    );
  return NextResponse.json({ fotos, errores });
}
