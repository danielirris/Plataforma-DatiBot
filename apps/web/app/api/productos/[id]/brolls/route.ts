import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getProduct } from "@plataforma/products";
import { leerVpsConfig } from "@/lib/vps/upload";
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

  // Para "uploaded": en vez de darle URLs al extractor (que dependen de nginx /
  // volumen / dominio y suelen fallar), le mandamos LOS BYTES por la red interna.
  // El web ya tiene los videos en su disco porque él mismo los escribió.
  const archivos: { nombre: string; ruta: string }[] = [];
  if (source === "uploaded") {
    const dir = (await leerVpsConfig()).localDir || process.env.VPS_LOCAL_DIR || "";
    if (dir) {
      for (const v of producto.videos ?? []) {
        const ruta = path.join(dir.replace(/\/+$/, ""), path.basename(v.nombre || ""));
        try {
          await stat(ruta);
          archivos.push({ nombre: v.nombre, ruta });
        } catch {
          /* ese video ya no está en disco: se omite */
        }
      }
    }
  }

  const porArchivos = source === "uploaded" && archivos.length > 0;
  const enviarJson = () =>
    fetch(`${extractorUrl()}/api/brolls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto, source, config: body.config ?? {} }),
    });

  let res: Response;
  try {
    if (porArchivos) {
      const form = new FormData();
      form.append("producto", JSON.stringify(producto));
      form.append("source", source);
      form.append("config", JSON.stringify(body.config ?? {}));
      for (const a of archivos) {
        form.append("videos", new Blob([new Uint8Array(await readFile(a.ruta))]), a.nombre);
      }
      res = await fetch(`${extractorUrl()}/api/brolls/upload`, { method: "POST", body: form });
      // 404 = el extractor aún no tiene el endpoint nuevo (no se ha redesplegado):
      // se intenta por el camino antiguo antes de rendirse.
      if (res.status === 404) res = await enviarJson();
    } else {
      res = await enviarJson();
    }
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al servicio de video (${extractorUrl()}).` },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = (data as { detail?: string }).detail;
    const error =
      res.status === 404
        ? "El servicio de video está desactualizado: redespliega el servicio «extractor» en EasyPanel y vuelve a intentar."
        : (detalle ?? `Error ${res.status}`);
    return NextResponse.json({ error }, { status: res.status });
  }
  return NextResponse.json({ ...data, publicBase: extractorPublicUrl() });
}
