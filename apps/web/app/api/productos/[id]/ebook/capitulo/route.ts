import { NextResponse } from "next/server";
import { getProduct, type Producto } from "@plataforma/products";
import { generarCapitulo } from "@/lib/ebook/generarEbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Ctx = { params: Promise<{ id: string }> };

// Fase 3: redacta UN capítulo (bloques del motor) según idea + índice.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; index?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const idea = producto.ebook?.idea;
  const capitulos = producto.ebook?.capitulos ?? [];
  const index = Number(body.index);
  if (!idea?.titulo || !capitulos.length)
    return NextResponse.json(
      { error: "Faltan la idea o el índice del ebook (Fases 1 y 2)." },
      { status: 400 },
    );
  if (!Number.isInteger(index) || index < 0 || index >= capitulos.length)
    return NextResponse.json({ error: "Índice de capítulo inválido." }, { status: 400 });

  try {
    const bloques = await generarCapitulo(producto, idea, capitulos, index);
    if (!bloques.length) throw new Error("La IA no devolvió bloques.");
    return NextResponse.json({ bloques });
  } catch (e) {
    console.error("[ebook/capitulo] fallo:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al redactar el capítulo" },
      { status: 502 },
    );
  }
}
