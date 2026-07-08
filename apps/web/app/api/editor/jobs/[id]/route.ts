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
    res = await fetch(`${extractorUrl()}/api/jobs/${id}`, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Editor de video no disponible." }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
