import { NextResponse } from "next/server";
import { getProduct, type Producto, type EbookFoto } from "@plataforma/products";
import type { Bloque } from "@/lib/ebook/generarEbook";
import { intercalarFotos } from "@/lib/ebook/fotos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Ensambla el ebook (idea + capítulos redactados + fotos) y lo manda al
// servicio de ebooks a renderizar. Devuelve el PDF.

function renderUrl(): string {
  return (
    process.env.EBOOK_RENDER_URL ||
    process.env.EBOOKFORGE_URL ||
    "http://localhost:8600"
  );
}

function slug(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "ebook"
  );
}

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

  const eb = producto.ebook;
  const idea = eb?.idea;
  if (!idea?.titulo || !eb.capitulos.length)
    return NextResponse.json(
      { error: "Faltan la idea o el índice del ebook (Fases 1 y 2)." },
      { status: 400 },
    );
  const sinRedactar = eb.capitulos
    .map((c, i) => (c.bloques?.length ? null : i + 1))
    .filter(Boolean);
  if (sinRedactar.length)
    return NextResponse.json(
      { error: `Faltan capítulos por redactar: ${sinRedactar.join(", ")} (Fase 3).` },
      { status: 400 },
    );

  // ── Ensamblado de bloques ────────────────────────────────────
  const blocks: Bloque[] = [
    {
      type: "cover",
      title: idea.titulo,
      subtitle: idea.subtitulo,
      welcome: idea.concepto ? [idea.concepto] : [],
      brand: producto.nombre,
      brand_sub: "Edición 2026",
    },
  ];
  const fotosUsadas: EbookFoto[] = [];
  if (eb.foto_portada) {
    blocks.push({ type: "image", src: eb.foto_portada.nombre, caption: "" });
    fotosUsadas.push(eb.foto_portada);
  }

  eb.capitulos.forEach((cap, i) => {
    // Las fotos se reparten ENTRE los textos del capítulo (la 1ª grande tras el
    // título, el resto alternando difuminada/normal).
    const fotos = cap.fotos ?? [];
    fotosUsadas.push(...fotos);
    blocks.push(...intercalarFotos(cap.bloques ?? [], fotos));
    if (i < eb.capitulos.length - 1) blocks.push({ type: "divider" });
  });

  blocks.push({
    type: "closing",
    big: "¡Gracias!",
    small: "Esperamos que esta guía te sea muy útil.",
    brand: producto.nombre,
  });

  const doc = { title: idea.titulo, theme: eb.tema || "capital", blocks };

  // ── Adjuntar las fotos (el motor las referencia por nombre) ──
  const form = new FormData();
  form.append("content", JSON.stringify(doc));
  form.append("theme", doc.theme);
  for (const f of fotosUsadas) {
    try {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      form.append("images", new Blob([await r.arrayBuffer()]), f.nombre);
    } catch (e) {
      return NextResponse.json(
        { error: `No se pudo descargar la foto ${f.nombre} (${e instanceof Error ? e.message : "error"}). Regénerala e intenta de nuevo.` },
        { status: 502 },
      );
    }
  }

  // ── Render ───────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(`${renderUrl()}/generate`, { method: "POST", body: form });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al servicio de ebooks (${renderUrl()}).` },
      { status: 502 },
    );
  }
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `El servicio de ebooks falló al renderizar (${res.status}). ${detalle.slice(0, 300)}` },
      { status: 502 },
    );
  }

  const pdf = await res.arrayBuffer();
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(idea.titulo)}.pdf"`,
    },
  });
}
