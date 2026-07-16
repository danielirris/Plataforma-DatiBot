import { NextResponse } from "next/server";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Los anuncios ya creados (galería del extractor), para verlos y descargarlos.
export async function GET() {
  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/api/galeria`, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al editor de video (${extractorUrl()}).` },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = (data as { detail?: string }).detail;
    const error =
      res.status === 404
        ? "El servicio de video está desactualizado: redespliega el servicio «extractor» en EasyPanel."
        : (detalle ?? `Error ${res.status}`);
    return NextResponse.json({ error }, { status: res.status });
  }
  // publicBase: el navegador descarga los videos del extractor directamente.
  return NextResponse.json({ ...data, publicBase: extractorPublicUrl() });
}
