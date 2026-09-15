import { NextResponse } from "next/server";
import { extractorUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Proxy del estado del job en el extractor (para el polling del editor).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  // Sanea el id ANTES de construir la URL interna: un id con "../galeria" normalizaría
  // .../api/jobs/../galeria → .../api/galeria y saltaría el bloqueo de SOLO_EDITOR.
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id))
    return NextResponse.json({ error: "id de job inválido." }, { status: 400 });
  let res: Response;
  try {
    // Timeout corto: durante un render pesado el extractor puede tardar en
    // contestar; sin tope, los polls se acumulan. La UI tolera un fallo puntual
    // (reintenta al siguiente tick), así que devolvemos 503 "transitorio".
    res = await fetch(`${extractorUrl()}/api/jobs/${id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Editor de video ocupado; reintentando…", transient: true },
      { status: 503 },
    );
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

// Borra un anuncio (job) — desde "Mis anuncios".
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(id))
    return NextResponse.json({ error: "id de job inválido." }, { status: 400 });
  try {
    const res = await fetch(`${extractorUrl()}/api/jobs/${id}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Editor de video no disponible; reintenta." },
      { status: 503 },
    );
  }
}
