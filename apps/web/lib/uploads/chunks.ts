import { NextResponse } from "next/server";
import { appendFile, writeFile, mkdir, unlink, stat, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Protocolo de subida POR TROZOS (cuerpo crudo, sin FormData): el navegador
// envía partes de ~4 MB EN ORDEN y aquí se re-arman. Así ningún límite de
// tamaño del proxy (EasyPanel/Traefik) puede cortar la subida — cada petición
// es pequeña.
//
// Aquí vive SOLO el protocolo, que es igual para todos: quién manda el trozo,
// en qué orden y con qué validaciones. Qué hacer con el archivo terminado
// (nombrarlo, guardarlo, registrarlo en un producto o no) lo decide cada ruta.

const TMP = path.join(os.tmpdir(), "datibot-uploads");
const MAX_CHUNK = 8 * 1024 * 1024; // tope por trozo (el cliente manda 4 MB)
const MAX_TOTAL = 2048 * 1024 * 1024; // 2 GB por archivo
const TTL_HUERFANOS = 6 * 60 * 60 * 1000; // 6 h

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

export type Trozo =
  /** Trozo intermedio o error: devuelve `res` tal cual al cliente. */
  | { estado: "respuesta"; res: NextResponse }
  /**
   * Último trozo: el archivo está entero en `tmp`. La ruta lo finaliza y es
   * responsable de borrar `tmp` (en un `finally`).
   */
  | { estado: "completo"; tmp: string; size: number; original: string; uploadId: string };

/**
 * Recibe un trozo y lo añade al archivo temporal. Devuelve `completo` solo
 * cuando ha llegado el último.
 */
export async function recibirTrozo(req: Request): Promise<Trozo> {
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
    return {
      estado: "respuesta",
      res: NextResponse.json({ error: "Parámetros de subida inválidos." }, { status: 400 }),
    };

  // A partir de aquí hay E/S (leer el cuerpo, escribir en disco). TODO va dentro
  // de un try: si el disco se llena (ENOSPC), el cliente aborta a mitad, o hay un
  // EIO, antes la excepción salía SIN capturar y Next devolvía un HTTP 500 (página
  // HTML) que el cliente interpretaba como "subida caída". Ahora se traduce a un
  // 502 legible y el usuario puede reintentar.
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length)
      return {
        estado: "respuesta",
        res: NextResponse.json(
          { error: "Llegó un trozo vacío; reintenta la subida." },
          { status: 400 },
        ),
      };
    if (buf.length > MAX_CHUNK)
      return {
        estado: "respuesta",
        res: NextResponse.json({ error: "Trozo demasiado grande." }, { status: 413 }),
      };

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
        return {
          estado: "respuesta",
          res: NextResponse.json(
            { error: "La subida se perdió a mitad de camino. Reintenta el archivo." },
            { status: 409 },
          ),
        };
      await appendFile(tmp, buf);
    }

    const size = (await stat(tmp)).size;
    if (size > MAX_TOTAL) {
      await unlink(tmp).catch(() => {});
      return {
        estado: "respuesta",
        res: NextResponse.json({ error: "El video supera el máximo (2 GB)." }, { status: 413 }),
      };
    }

    // Trozos intermedios: confirmar y seguir.
    if (index < total - 1)
      return {
        estado: "respuesta",
        res: NextResponse.json({ ok: true, recibidos: index + 1, bytes: size }),
      };

    return { estado: "completo", tmp, size, original, uploadId };
  } catch (e) {
    console.error("[uploads/chunks] fallo de E/S al recibir trozo:", e);
    const msg =
      (e as { code?: string })?.code === "ENOSPC"
        ? "El servidor se quedó sin espacio en disco. Avisa al administrador."
        : "No se pudo guardar el trozo (error de disco). Reintenta la subida.";
    return {
      estado: "respuesta",
      res: NextResponse.json({ error: msg }, { status: 502 }),
    };
  }
}

/** Extensión saneada del nombre original (sin punto). `mp4` si no se puede leer. */
export function extensionDe(original: string): string {
  return (original.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
}
