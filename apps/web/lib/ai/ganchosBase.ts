import { readFileSync } from "node:fs";
import path from "node:path";

// Banco de plantillas de gancho (data/ganchos_base.json). Se carga una vez y
// queda en memoria. Sustituye el archivo por tu base real (mismo formato) y
// reinicia el server para recargarlo.

export interface PlantillaGancho {
  plantilla: string;
  ejemplo: string;
  idioma: string;
  mecanismo: string;
  nichos: string[];
  fuente: string;
}

let cache: PlantillaGancho[] | null = null;

function cargar(): PlantillaGancho[] {
  if (cache) return cache;
  try {
    const p = path.join(process.cwd(), "data", "ganchos_base.json");
    cache = JSON.parse(readFileSync(p, "utf8")) as PlantillaGancho[];
  } catch {
    cache = [];
  }
  return cache;
}

export function totalPlantillas(): number {
  return cargar().length;
}

function barajar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Selecciona `nPref` plantillas del mecanismo preferido + `nGeneral` del catálogo
 * GENERAL, todo aleatorizado (few-shot variado). Toma lo disponible si hay menos.
 */
export function seleccionarSemillas(
  mecanismoPreferido: string,
  nPref = 15,
  nGeneral = 5,
): PlantillaGancho[] {
  const todas = cargar();
  const pref = barajar(todas.filter((t) => t.mecanismo === mecanismoPreferido)).slice(
    0,
    nPref,
  );
  const general = barajar(todas.filter((t) => t.mecanismo === "GENERAL")).slice(
    0,
    nGeneral,
  );
  return barajar([...pref, ...general]);
}
