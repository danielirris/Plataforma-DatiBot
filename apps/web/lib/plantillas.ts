// Almacén de las PLANTILLAS de n8n (JSON de los workflows) para descargarlas desde la
// app. Se guardan en el volumen persistente (DATA_DIR/.plantillas-n8n/<slot>.json), así
// que sobreviven a los redeploys. SOLO servidor.
import path from "node:path";
import { dataDir } from "@plataforma/config";

export const PLANTILLAS: { slot: string; nombre: string; desc: string }[] = [
  { slot: "recibidor", nombre: "Recibidor (plantilla)", desc: "El workflow que recibe el webhook de Meta y puentea a Chatwoot. Se duplica por número." },
  { slot: "subworkflow", nombre: "Subworkflow / Motor", desc: "El motor por producto (clasifica y envía)." },
  { slot: "media", nombre: "Precarga de media", desc: "Sube el video y los PDFs a WhatsApp para obtener los media_id." },
];

const SLOTS = new Set(PLANTILLAS.map((p) => p.slot));

export function plantillasDir(): string {
  // Usa el helper compartido de @plataforma/config (única fuente del directorio de datos).
  return path.join(dataDir(), ".plantillas-n8n");
}

export function esSlotValido(s: string): boolean {
  return SLOTS.has(s);
}

export function rutaPlantilla(slot: string): string {
  return path.join(plantillasDir(), `${slot}.json`);
}
