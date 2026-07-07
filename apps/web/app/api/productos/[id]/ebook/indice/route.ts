import { NextResponse } from "next/server";
import { getProduct, type Producto } from "@plataforma/products";
import { generarIndice } from "@/lib/ebook/generarEbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Fase 2: genera el ÍNDICE (capítulos) a partir de la idea aprobada.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; capitulos?: number } = {};
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
      { error: "Primero genera y guarda la idea del ebook (Fase 1)." },
      { status: 400 },
    );

  const n = Math.min(20, Math.max(4, Number(body.capitulos) || 10));
  try {
    const capitulos = await generarIndice(producto, idea, n);
    if (!capitulos.length) throw new Error("La IA no devolvió capítulos.");
    return NextResponse.json({ capitulos });
  } catch (e) {
    console.error("[ebook/indice] fallo:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar el índice" },
      { status: 502 },
    );
  }
}
