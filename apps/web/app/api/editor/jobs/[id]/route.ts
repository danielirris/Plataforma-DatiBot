import { NextResponse } from "next/server";
import { extractorUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Proxy del estado del job en el extractor (para el polling del editor).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
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
