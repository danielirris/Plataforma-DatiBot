// Almacén de las PLANTILLAS de n8n (JSON de los workflows) para descargarlas desde la
// app. Se guardan en el volumen persistente (DATA_DIR/.plantillas-n8n/<slot>.json), así
// que sobreviven a los redeploys. SOLO servidor.
import { existsSync } from "node:fs";
import path from "node:path";

export const PLANTILLAS: { slot: string; nombre: string; desc: string }[] = [
  { slot: "recibidor", nombre: "Recibidor (plantilla)", desc: "El workflow que recibe el webhook de Meta y puentea a Chatwoot. Se duplica por número." },
  { slot: "subworkflow", nombre: "Subworkflow / Motor", desc: "El motor por producto (clasifica y envía)." },
  { slot: "media", nombre: "Precarga de media", desc: "Sube el video y los PDFs a WhatsApp para obtener los media_id." },
];

const SLOTS = new Set(PLANTILLAS.map((p) => p.slot));

function repoRoot(): string {
  let d = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(d, "pnpm-workspace.yaml"))) return d;
    const p = path.dirname(d);
    if (p === d) break;
    d = p;
  }
  return process.cwd();
}

export function plantillasDir(): string {
  return path.join(process.env.DATA_DIR || repoRoot(), ".plantillas-n8n");
}

export function esSlotValido(s: string): boolean {
  return SLOTS.has(s);
}

export function rutaPlantilla(slot: string): string {
  return path.join(plantillasDir(), `${slot}.json`);
}
