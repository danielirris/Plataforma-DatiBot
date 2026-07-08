import { NextResponse } from "next/server";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Devuelve los candidatos de gancho (con miniatura) de los videos elegidos,
// para que el usuario arme el "marco de referencia" del Hook visual (Fase 4).
export async function POST(req: Request) {
  let body: { video_urls?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const urls = (body.video_urls ?? []).filter(Boolean);
  if (!urls.length)
    return NextResponse.json({ error: "Elige al menos un video del producto." }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/api/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_urls: urls }),
    });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al editor de video (${extractorUrl()}).` },
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
