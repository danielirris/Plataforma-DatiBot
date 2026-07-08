import { NextResponse } from "next/server";
import { getProduct } from "@plataforma/products";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Lanza una tanda de B-rolls para el producto. Lee TODOS los datos guardados del
// producto y se los pasa al extractor (que orquesta Veo / recorte + verificación).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { source?: string; config?: Record<string, unknown> } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = await getProduct(id);
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const source = body.source === "uploaded" ? "uploaded" : "veo";
  if (source === "uploaded" && !(producto.videos?.length ?? 0))
    return NextResponse.json(
      { error: "Este producto no tiene videos subidos. Súbelos en el paso Videos o usa Veo." },
      { status: 400 },
    );

  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/api/brolls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto, source, config: body.config ?? {} }),
    });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al servicio de video (${extractorUrl()}).` },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { error: (data as { detail?: string }).detail ?? `Error ${res.status}` },
      { status: res.status },
    );
  return NextResponse.json({ ...data, publicBase: extractorPublicUrl() });
}
