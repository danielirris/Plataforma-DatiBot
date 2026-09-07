// Helpers de MEDIA de embudos (SOLO servidor). Sube archivos a la API de WhatsApp
// Cloud para obtener el media_id, y mapea cada "slot" a sus columnas en `media_bots`.

export const SLOTS_MEDIA = [
  "video",
  "pdf_1",
  "pdf_2",
  "pdf_3",
  "pdf_4",
  "pdf_5",
  "pdf_6",
] as const;
export type SlotMedia = (typeof SLOTS_MEDIA)[number];

/** Columnas de `media_bots` que corresponden a un slot. */
export function columnasSlot(
  slot: string,
): { url: string; media_id: string; caption: string; filename?: string } | null {
  if (slot === "video")
    return { url: "url_video", media_id: "video_media_id", caption: "video_caption" };
  const m = /^pdf_([1-6])$/.exec(slot);
  if (m) {
    const n = m[1];
    return {
      url: `pdf_${n}_url`,
      media_id: `pdf_${n}_media_id`,
      caption: `pdf_${n}_caption`,
      filename: `pdf_${n}_filename`,
    };
  }
  return null;
}

export function mimeDe(nombre: string): string {
  const ext = (nombre.toLowerCase().split(".").pop() ?? "").trim();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Sube los BYTES a WhatsApp Cloud y devuelve el media_id. Lanza con mensaje claro. */
export async function subirMediaWhatsApp(
  phoneId: string,
  token: string,
  buffer: Buffer,
  filename: string,
  mime: string,
): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), filename);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!res.ok)
    throw new Error(data?.error?.message || `WhatsApp API respondió ${res.status}`);
  if (!data.id) throw new Error("WhatsApp no devolvió media_id.");
  return String(data.id);
}
