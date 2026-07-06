import { NextResponse } from "next/server";
import { getProduct, type Producto } from "@plataforma/products";
import { generarDocumento } from "@/lib/ebook/generarEbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La generación es módulo a módulo (varias llamadas a la IA): puede tardar.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// URL del servicio de ebooks SOLO para renderizar (server-side).
// En producción (EasyPanel, mismo proyecto) apunta a la red interna
// http://ebooks:8600; en local, al servicio en localhost:8600.
function renderUrl(): string {
  return (
    process.env.EBOOK_RENDER_URL ||
    process.env.EBOOKFORGE_URL ||
    "http://localhost:8600"
  );
}

/** Brief del ebook a partir del producto: solo su tema (lo reutilizable). */
function construirBrief(p: Producto): string {
  const partes = [
    p.nombre,
    p.identidad?.promesa,
    p.identidad?.posicionamiento ? `enfoque: ${p.identidad.posicionamiento}` : "",
    p.identidad?.dirigidoA ? `dirigido a: ${p.identidad.dirigidoA}` : "",
  ].filter((x) => x && String(x).trim());
  return partes.join(". ");
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

interface Body {
  producto?: Producto;
  tema?: string;
  pages?: number;
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* body opcional */
  }
  const producto = body.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const brief = construirBrief(producto);
  if (!brief.trim())
    return NextResponse.json(
      { error: "El producto no tiene tema (nombre/promesa). Complétalo en Identidad." },
      { status: 400 },
    );

  const tema = body.tema || "amigurumi";
  const pages = Math.min(80, Math.max(8, Number(body.pages) || 40));

  // 1) Contenido (índice + módulos) con la IA del shell.
  let doc;
  try {
    doc = await generarDocumento(brief, tema, pages, `Entregado por ${producto.nombre}`);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al generar el contenido del ebook" },
      { status: 502 },
    );
  }

  // 2) Render del PDF en el servicio de ebooks.
  const form = new FormData();
  form.append("content", JSON.stringify(doc));
  form.append("theme", tema);

  let res: Response;
  try {
    res = await fetch(`${renderUrl()}/generate`, { method: "POST", body: form });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al servicio de ebooks (${renderUrl()}). ¿Está levantado?` },
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
      "Content-Disposition": `attachment; filename="${slug(producto.nombre)}.pdf"`,
    },
  });
}
