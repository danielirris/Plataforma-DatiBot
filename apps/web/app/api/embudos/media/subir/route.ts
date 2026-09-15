import { NextResponse } from "next/server";
import {
  selectRows,
  upsertRow,
  supabaseConfigurado,
  SupabaseError,
} from "@/lib/embudos/supabase";
import { leerVpsConfig, faltantesVps, subirImagen, eliminarImagen } from "@/lib/vps/upload";
import { columnasSlot, mimeDe, subirMediaWhatsApp, SLOTS_MEDIA } from "@/lib/embudos/media";
import { type NumeroBot } from "@/lib/embudos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Topes REALES de WhatsApp Cloud por tipo: video 16 MB, documentos (PDF) 100 MB.
// Validar por tipo evita subir a `img` un archivo que WhatsApp va a rechazar (que
// quedaría huérfano) y da un error claro en vez del genérico de la API.
const MAX_VIDEO = 16 * 1024 * 1024;
const MAX_DOC = 100 * 1024 * 1024;
const mb = (n: number) => Math.round(n / (1024 * 1024));

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
  const limite = slot === "video" ? MAX_VIDEO : MAX_DOC;
  if (archivo.size > limite)
    return NextResponse.json(
      {
        error:
          slot === "video"
            ? `El video pesa ${mb(archivo.size)} MB. WhatsApp acepta videos de máximo ${mb(MAX_VIDEO)} MB — compártelo comprimido o recórtalo.`
            : `El archivo pesa ${mb(archivo.size)} MB. El máximo es ${mb(MAX_DOC)} MB.`,
      },
      { status: 413 },
    );

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

  // Fila previa del producto: sirve para (a) no mezclar números y (b) limpiar el
  // archivo viejo al reemplazar un slot. Si la lectura falla, seguimos (la subida manda).
  let filaPrev: Record<string, unknown> | null = null;
  try {
    const prev = await selectRows<Record<string, unknown>>("media_bots", {
      producto: `eq.${producto}`,
    });
    filaPrev = prev[0] ?? null;
  } catch {
    /* no bloquea la subida */
  }

  // M5: la media de un producto debe alojarse en UN solo número (los media_id están
  // atados al número que los emitió). Si ya hay media de OTRO slot en otro número,
  // no dejamos mezclar: se enviaría un media_id inválido para el número guardado.
  const phonePrev = String(filaPrev?.phone_id ?? "").trim();
  if (phonePrev && phonePrev !== phone_id) {
    const hayMediaOtroSlot = SLOTS_MEDIA.some((s) => {
      const c = columnasSlot(s)!;
      return s !== slot && String(filaPrev?.[c.media_id] ?? "").trim();
    });
    if (hayMediaOtroSlot)
      return NextResponse.json(
        {
          error:
            "Este producto ya tiene media alojada en otro número. Usa el MISMO número para todos sus archivos (los media_id están atados al número que los emitió), o borra la media anterior primero.",
        },
        { status: 409 },
      );
  }

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
    // B3: WhatsApp rechazó -> el archivo recién guardado en img quedaría huérfano
    // (nunca se referencia en media_bots). Lo borramos.
    await eliminarImagen(url, cfg).catch(() => {});
    return NextResponse.json(
      { error: "WhatsApp rechazó la media: " + (e instanceof Error ? e.message : "?") },
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
    // B3: si esto fue un REEMPLAZO de slot, borra el archivo anterior de img (quedaría
    // huérfano al pisar su url por la nueva).
    const urlVieja = String(filaPrev?.[cols.url] ?? "").trim();
    if (urlVieja && urlVieja !== url) await eliminarImagen(urlVieja, cfg).catch(() => {});
    // No devolvemos el capi_token al navegador (S2): el cliente no lo usa.
    if (guardado) delete (guardado as Record<string, unknown>).capi_token;
    return NextResponse.json({ media: guardado, media_id: mediaId, url });
  } catch (e) {
    // #26: el upsert falló tras subir a img+WhatsApp → el archivo en img quedaría huérfano
    // (no referenciado, ni renovable ni borrable desde la UI). Lo limpiamos.
    await eliminarImagen(url, cfg).catch(() => {});
    const status = e instanceof SupabaseError ? e.status : 500;
    const msg = e instanceof Error ? e.message : "Error guardando en media_bots.";
    return NextResponse.json({ error: msg }, { status });
  }
}
