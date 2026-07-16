import { NextResponse } from "next/server";
import { getProduct, type Producto } from "@plataforma/products";
import type { Bloque } from "@/lib/ebook/generarEbook";
import { intercalarFotos } from "@/lib/ebook/fotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

function renderUrl(): string {
  return (
    process.env.EBOOK_RENDER_URL ||
    process.env.EBOOKFORGE_URL ||
    "http://localhost:8600"
  );
}

// Vista previa (HTML) de UN módulo del ebook con su tema. Rápida: no genera PDF.
// Tolerante: si una foto no se puede descargar, se omite (el texto se ve igual).
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

  const eb = producto.ebook;
  const index = Number(body.index);
  const cap = eb?.capitulos?.[index];
  if (!cap)
    return NextResponse.json({ error: "Capítulo no encontrado." }, { status: 400 });
  if (!cap.bloques?.length)
    return NextResponse.json({ error: "Este módulo aún no está redactado." }, { status: 400 });

  // Bloques del módulo con las fotos repartidas ENTRE los textos (igual que en
  // el PDF final, para que la vista previa muestre el diseño de verdad).
  const fotos = cap.fotos ?? [];
  const bloques: Bloque[] = intercalarFotos(cap.bloques, fotos);

  const doc = {
    title: eb.idea?.titulo || cap.titulo,
    theme: eb.tema || "capital",
    blocks: bloques,
  };

  const form = new FormData();
  form.append("content", JSON.stringify(doc));
  form.append("theme", doc.theme);
  // Adjunta las fotos que SÍ se puedan descargar (las rotas se omiten).
  for (const f of fotos) {
    try {
      const r = await fetch(f.url);
      if (r.ok) form.append("images", new Blob([await r.arrayBuffer()]), f.nombre);
    } catch {
      /* foto no disponible: se omite del preview */
    }
  }

  let res: Response;
  try {
    res = await fetch(`${renderUrl()}/preview`, { method: "POST", body: form });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al servicio de ebooks (${renderUrl()}).` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `El servicio de ebooks falló al previsualizar (${res.status}). ${detalle.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const html = await res.text();
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
