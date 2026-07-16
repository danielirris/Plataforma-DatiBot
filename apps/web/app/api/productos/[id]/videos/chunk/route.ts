import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { getProduct, saveProduct, type VideoProducto } from "@plataforma/products";
import { leerVpsConfig, faltantesVps, guardarArchivoDesdeRuta } from "@/lib/vps/upload";
import { recibirTrozo, extensionDe } from "@/lib/uploads/chunks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Subida de video por trozos y registro en el PRODUCTO. El protocolo de trozos
// vive en lib/uploads/chunks.ts (lo comparte el editor); aquí solo está lo que
// es propio del producto: el nombre del archivo y persistirlo en su JSON.

type Ctx = { params: Promise<{ id: string }> };

// Serializa las escrituras del MISMO producto: saveProduct reescribe el JSON
// entero, así que dos subidas terminando a la vez se pisarían (se perdería un
// video). Una cola por producto lo evita (la app corre en una sola instancia).
const _g = globalThis as unknown as { __datibotColaProducto?: Map<string, Promise<unknown>> };
const COLAS: Map<string, Promise<unknown>> = (_g.__datibotColaProducto ??= new Map());
function enCola<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previo = COLAS.get(key) ?? Promise.resolve();
  const siguiente = previo.then(fn, fn);
  COLAS.set(
    key,
    siguiente.catch(() => {}),
  );
  return siguiente;
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  const trozo = await recibirTrozo(req);
  if (trozo.estado === "respuesta") return trozo.res;
  const { tmp, size, original, uploadId } = trozo;

  // ── Último trozo: subir al almacenamiento y registrar en el producto ──
  try {
    const vps = await leerVpsConfig();
    const faltan = faltantesVps(vps);
    if (faltan.length)
      return NextResponse.json(
        { error: "Falta configurar el servidor de archivos: " + faltan.join(", ") },
        { status: 502 },
      );

    const productoBase = await getProduct(id).catch(() => null);
    const baseId = (productoBase?.productoId || id || "prod").replace(/[^a-zA-Z0-9_-]/g, "");
    // El nombre sale del uploadId (no de Date.now()): si el cliente reintenta el
    // último trozo tras un timeout, sobrescribe el mismo archivo en vez de
    // duplicarlo.
    const nombre = `vid-${baseId}-${uploadId}.${extensionDe(original)}`;

    // Copia por streaming (sin cargar el video a RAM): apto para archivos grandes.
    const url = await guardarArchivoDesdeRuta(tmp, nombre, vps);
    const video: VideoProducto = { url, nombre, original, bytes: size };

    // Persistir en el producto RE-LEYENDO dentro de la cola (la copia de arriba
    // puede tardar; el snapshot previo estaría viejo y pisaría otros cambios).
    let aviso: string | undefined;
    try {
      await enCola(id, async () => {
        const actual = await getProduct(id);
        if (!actual) throw new Error("Producto no encontrado al registrar el video.");
        const videos = (actual.videos ?? []).filter((v) => v.nombre !== nombre);
        await saveProduct({ ...actual, videos: [...videos, video] });
      });
    } catch (e) {
      console.error("[videos/chunk] no se pudo persistir el video:", e);
      aviso =
        "El video se subió pero no se pudo registrar en el producto. Recarga y revisa; si no aparece, vuelve a subirlo.";
    }
    return NextResponse.json({ video, aviso });
  } catch (e) {
    console.error("[videos/chunk] fallo al finalizar:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar el video" },
      { status: 502 },
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
