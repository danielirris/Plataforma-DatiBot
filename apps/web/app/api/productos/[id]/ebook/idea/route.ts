import { NextResponse } from "next/server";
import { getProduct, type Producto } from "@plataforma/products";
import { generarIdea } from "@/lib/ebook/generarEbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Fase 1: genera la IDEA del ebook desde la oferta del producto.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  if (!producto.oferta)
    return NextResponse.json(
      { error: "El producto aún no tiene oferta (paso 4). El ebook nace de la oferta." },
      { status: 400 },
    );

  try {
    const idea = await generarIdea(producto);
    if (!idea.titulo) throw new Error("La IA no devolvió un título.");
    return NextResponse.json({ idea });
  } catch (e) {
    console.error("[ebook/idea] fallo:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar la idea" },
      { status: 502 },
    );
  }
}
