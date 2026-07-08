import { NextResponse } from "next/server";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; jobId: string }> };

// Estado de una tanda de B-rolls (para el polling del wizard).
export async function GET(_req: Request, { params }: Ctx) {
  const { jobId } = await params;
  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/api/brolls/jobs/${jobId}`, { cache: "no-store" });
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
