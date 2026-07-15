import { NextResponse } from "next/server";
import { appendFile, writeFile, mkdir, unlink, stat, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getProduct, saveProduct, type VideoProducto } from "@plataforma/products";
import { leerVpsConfig, faltantesVps, guardarArchivoDesdeRuta } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Subida de video POR TROZOS (cuerpo crudo, sin FormData): el navegador envía
// partes de ~4 MB EN ORDEN y aquí se re-arman. Así ningún límite de tamaño del
// proxy (EasyPanel/Traefik) puede cortar la subida — cada petición es pequeña.

const TMP = path.join(os.tmpdir(), "datibot-uploads");
const MAX_CHUNK = 8 * 1024 * 1024; // tope por trozo (el cliente manda 4 MB)
const MAX_TOTAL = 2048 * 1024 * 1024; // 2 GB por archivo
const TTL_HUERFANOS = 6 * 60 * 60 * 1000; // 6 h

type Ctx = { params: Promise<{ id: string }> };

/** Borra .part abandonados (subidas que nunca terminaron) para no llenar /tmp. */
async function barrerHuerfanos(): Promise<void> {
  try {
    const ahora = Date.now();
    for (const f of await readdir(TMP)) {
      if (!f.endsWith(".part")) continue;
      const p = path.join(TMP, f);
      try {
        const s = await stat(p);
        if (ahora - s.mtimeMs > TTL_HUERFANOS) await unlink(p);
      } catch {
        /* ya no está: nada que hacer */
      }
    }
  } catch {
    /* la carpeta aún no existe */
  }
}

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
  const u = new URL(req.url);
  const uploadId = (u.searchParams.get("id") ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  const index = Number(u.searchParams.get("index"));
  const total = Number(u.searchParams.get("total"));
  const chunkSize = Number(u.searchParams.get("chunkSize"));
  const original = (u.searchParams.get("name") ?? "video.mp4").slice(0, 180);
  if (
    !uploadId ||
    !Number.isInteger(index) ||
    !Number.isInteger(total) ||
    !Number.isInteger(chunkSize) ||
    chunkSize <= 0 ||
    index < 0 ||
    total < 1 ||
    index >= total
  )
    return NextResponse.json({ error: "Parámetros de subida inválidos." }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length)
    return NextResponse.json({ error: "Llegó un trozo vacío; reintenta la subida." }, { status: 400 });
  if (buf.length > MAX_CHUNK)
    return NextResponse.json({ error: "Trozo demasiado grande." }, { status: 413 });

  await mkdir(TMP, { recursive: true });
  if (index === 0) void barrerHuerfanos(); // oportunista, no bloquea la subida
  const tmp = path.join(TMP, `${uploadId}.part`);

  if (index === 0) {
    await writeFile(tmp, buf); // trunca: reintento con el mismo id parte de cero
  } else {
    // El .part debe existir y llevar exactamente los trozos previos. Si no, la
    // subida se perdió (reinicio del contenedor, /tmp limpiado…): mejor 409 que
    // re-armar en silencio un video TRUNCADO y darlo por bueno.
    let previo = -1;
    try {
      previo = (await stat(tmp)).size;
    } catch {
      previo = -1;
    }
    if (previo !== index * chunkSize)
      return NextResponse.json(
        { error: "La subida se perdió a mitad de camino. Reintenta el archivo." },
        { status: 409 },
      );
    await appendFile(tmp, buf);
  }

  const size = (await stat(tmp)).size;
  if (size > MAX_TOTAL) {
    await unlink(tmp).catch(() => {});
    return NextResponse.json({ error: "El video supera el máximo (2 GB)." }, { status: 413 });
  }

  // Trozos intermedios: confirmar y seguir.
  if (index < total - 1)
    return NextResponse.json({ ok: true, recibidos: index + 1, bytes: size });

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
    const ext =
      (original.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    // El nombre sale del uploadId (no de Date.now()): si el cliente reintenta el
    // último trozo tras un timeout, sobrescribe el mismo archivo en vez de
    // duplicarlo.
    const nombre = `vid-${baseId}-${uploadId}.${ext}`;

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
