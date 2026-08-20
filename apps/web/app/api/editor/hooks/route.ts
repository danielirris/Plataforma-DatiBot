import { NextResponse } from "next/server";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Analizar ganchos descarga + transcribe varios videos: puede pasar de 2 min. Antes
// eran 120s y cortaba con un 502 crudo. Subido a 300 (como el de jobs).
export const maxDuration = 300;
// Tope propio del fetch al extractor: si está saturado (un render en curso) fallamos
// limpio con un 502 legible en vez de colgarnos hasta que el proxy dispare su HTML.
const EXTRACTOR_TIMEOUT_MS = 240_000;

// Devuelve los candidatos de gancho (con miniatura) de los videos elegidos,
// para que el usuario arme el "marco de referencia" del Hook visual (Fase 4).
export async function POST(req: Request) {
  let body: { video_urls?: string[]; variant?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const urls = (body.video_urls ?? []).filter(Boolean);
  if (!urls.length)
    return NextResponse.json({ error: "Elige al menos un video del producto." }, { status: 400 });
  // Ronda de búsqueda: 0 = primera; >0 al pulsar "Volver a buscar" (más variedad).
  const variant = Number.isFinite(body.variant) ? Math.max(0, Math.trunc(body.variant as number)) : 0;

  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/api/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(EXTRACTOR_TIMEOUT_MS),
      body: JSON.stringify({ video_urls: urls, variant }),
    });
  } catch (e) {
    // AbortSignal.timeout dispara TimeoutError: el extractor tardó demasiado (suele
    // ser que hay un render en curso). Mensaje claro en vez de un 502 opaco.
    const nombre = (e as { name?: string })?.name ?? "";
    const msg =
      nombre === "TimeoutError"
        ? "El editor tardó demasiado analizando los ganchos (puede haber un render en curso). Espera a que termine y reintenta."
        : `No se pudo contactar al editor de video (${extractorUrl()}).`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { error: (data as { detail?: string }).detail ?? `Error ${res.status}` },
      { status: res.status },
    );
  return NextResponse.json({ ...data, publicBase: extractorPublicUrl() });
}
