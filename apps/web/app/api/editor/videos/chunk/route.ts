import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import type { VideoProducto } from "@plataforma/products";
import { leerVpsConfig, faltantesVps, guardarArchivoDesdeRuta } from "@/lib/vps/upload";
import { recibirTrozo, extensionDe } from "@/lib/uploads/chunks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Subida de video SUELTO, para editar sin pasar por Productos (es lo que usa el
// modo solo-editor del subdominio). Mismo protocolo de trozos y mismo destino
// que los videos de producto: tienen que acabar en VPS_LOCAL_DIR sí o sí,
// porque el job los busca ahí por su nombre y el Hook visual necesita su URL.
//
// Diferencia con la ruta de producto: aquí no hay JSON que reescribir, así que
// no hace falta cola. El video se devuelve al cliente y vive en su pantalla.

export async function POST(req: Request) {
  const trozo = await recibirTrozo(req);
  if (trozo.estado === "respuesta") return trozo.res;
  const { tmp, size, original, uploadId } = trozo;

  try {
    const vps = await leerVpsConfig();
    const faltan = faltantesVps(vps);
    if (faltan.length)
      return NextResponse.json(
        { error: "Falta configurar el servidor de archivos: " + faltan.join(", ") },
        { status: 502 },
      );

    // Prefijo propio: distingue los sueltos de los de producto (`vid-<prodId>-…`)
    // y deja barrerlos por edad sin tocar los que sí pertenecen a un producto.
    const nombre = `vid-editor-${uploadId}.${extensionDe(original)}`;
    const url = await guardarArchivoDesdeRuta(tmp, nombre, vps);
    const video: VideoProducto = { url, nombre, original, bytes: size };
    return NextResponse.json({ video });
  } catch (e) {
    console.error("[editor/videos/chunk] fallo al finalizar:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar el video" },
      { status: 502 },
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
