import { NextResponse } from "next/server";
import { extractorUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: qué hay en la cola del editor. POST: vaciarla (cancela lo pendiente).
// Hay UN worker en el extractor: los trabajos se procesan de uno en uno, así que
// una cola larga (p. ej. trabajos reanudados tras un redeploy) bloquea el nuevo.

async function proxy(metodo: "GET" | "POST") {
  const url =
    metodo === "GET" ? `${extractorUrl()}/api/queue` : `${extractorUrl()}/api/queue/reset`;
  let res: Response;
  try {
    res = await fetch(url, { method: metodo, cache: "no-store" });
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
  return NextResponse.json(data);
}

export async function GET() {
  return proxy("GET");
}

export async function POST() {
  return proxy("POST");
}
