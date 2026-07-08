import { NextResponse } from "next/server";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Crea un job de edición en el extractor a partir de los videos del producto.
export async function POST(req: Request) {
  let body: {
    video_urls?: string[];
    num_clips?: number;
    use_music?: boolean;
    use_intro?: boolean;
  };
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
    res = await fetch(`${extractorUrl()}/api/jobs/from-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_urls: urls,
        num_clips: body.num_clips ?? 0,
        use_music: !!body.use_music,
        use_intro: !!body.use_intro,
        mode: "full",
      }),
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
