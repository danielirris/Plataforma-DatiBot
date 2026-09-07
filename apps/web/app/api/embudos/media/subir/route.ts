import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { leerVpsConfig, faltantesVps, subirImagen } from "@/lib/vps/upload";
import { columnasSlot, mimeDe, subirMediaWhatsApp } from "@/lib/embudos/media";
import { type NumeroBot } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB (tope de seguridad)

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
}

// Sube UN archivo a un slot: lo guarda en `img`, lo sube a WhatsApp (media_id) y
// escribe la fila de `media_bots`.
export async function POST(req: Request) {
  if (!supabaseConfigurado())
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
  }

  const producto = String(form.get("producto") ?? "").trim();
  const slot = String(form.get("slot") ?? "").trim();
  const phone_id = String(form.get("phone_id") ?? "").trim();
  const caption = String(form.get("caption") ?? "");
  const archivo = form.get("archivo");

  const cols = columnasSlot(slot);
  if (!producto || !cols)
    return NextResponse.json({ error: "Producto o slot inválido." }, { status: 400 });
  if (!phone_id)
    return NextResponse.json({ error: "Elige el número que aloja la media." }, { status: 400 });
  if (!(archivo instanceof File) || archivo.size === 0)
    return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  if (archivo.size > MAX_BYTES)
    return NextResponse.json({ error: "El archivo supera 100 MB." }, { status: 413 });

  // Token del número (del propio Supabase; nunca viaja al navegador).
  let token = "";
  try {
    const nums = await selectRows<NumeroBot>("numeros", { phone_id: `eq.${phone_id}` });
    token = String(nums[0]?.capi_token ?? "").trim();
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status });
  }
  if (!token)
    return NextResponse.json(
      { error: "Ese número no tiene CAPI token configurado (pestaña Números)." },
      { status: 400 },
    );

  // Almacén de originales (servidor img). Sin esto no hay renovación posible.
  const cfg = await leerVpsConfig();
  const faltan = faltantesVps(cfg);
  if (faltan.length)
    return NextResponse.json(
      { error: `Falta configurar el servidor de archivos (img): ${faltan.join(", ")}.` },
      { status: 400 },
    );

  const nombreOriginal = archivo.name || `${slot}.bin`;
  const ext = (nombreOriginal.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const mime = mimeDe(nombreOriginal);
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const nombreArchivo = `emb-${slug(producto)}-${slug(slot)}-${Date.now()}.${ext}`;

  // 1) Guardar el original en img (para poder renovar sin re-subir a mano).
  let url = "";
  try {
    url = await subirImagen(buffer, nombreArchivo, cfg);
  } catch (e) {
    return NextResponse.json(
      { error: "No se pudo guardar el archivo en el servidor img: " + (e instanceof Error ? e.message : "?") },
      { status: 502 },
    );
  }

  // 2) Subir los bytes a WhatsApp para obtener el media_id.
  let mediaId = "";
  try {
    mediaId = await subirMediaWhatsApp(phone_id, token, buffer, nombreOriginal, mime);
  } catch (e) {
    return NextResponse.json(
      { error: "WhatsApp rechazó la media: " + (e instanceof Error ? e.message : "?"), url },
      { status: 502 },
    );
  }

  // 3) Guardar en media_bots (upsert por producto; solo las columnas del slot).
  const fila: Record<string, unknown> = {
    producto,
    phone_id,
    capi_token: token,
    [cols.url]: url,
    [cols.media_id]: mediaId,
    [cols.caption]: caption,
    media_actualizado_at: new Date().toISOString(),
  };
  if (cols.filename) fila[cols.filename] = nombreOriginal;

  try {
    const guardado = await upsertRow("media_bots", fila, "producto");
    return NextResponse.json({ media: guardado, media_id: mediaId, url });
  } catch (e) {
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando en media_bots.";
    return NextResponse.json({ error: msg }, { status });
  }
}
