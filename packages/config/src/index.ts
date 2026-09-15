import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { CONFIG_GROUPS, type ConfigStore } from "./schema";

export * from "./schema";

// El almacén vive en la raíz del monorepo, fuera de git (.gitignore).
// Buscamos hacia arriba desde el cwd hasta encontrar pnpm-workspace.yaml,
// así funciona igual en `next dev` (cwd = apps/web) y en producción.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// DATA_DIR permite fijar dónde viven los datos persistentes (almacén de config y
// productos). En producción (contenedor) se apunta a un volumen montado; en local
// queda undefined y se usa la raíz del monorepo, como siempre.
const DATA_DIR = process.env.DATA_DIR || findRepoRoot();
// REPO_ROOT sigue siendo la raíz real del repo (para los .env que se generan en
// despliegues de un solo host; en multi-contenedor esos .env se ignoran).
const REPO_ROOT = findRepoRoot();
const STORE_PATH = path.join(DATA_DIR, ".config-store.json");

/**
 * Nombre de la variable de entorno para un campo: `<GRUPO>_<CAMPO>` en mayúsculas.
 * Ej.: grupo "ia" + campo "gemini_api_key"  ->  IA_GEMINI_API_KEY.
 * Ej.: grupo "vps" + campo "vps_host"        ->  VPS_VPS_HOST.
 */
export function envVarName(groupId: string, fieldKey: string): string {
  return `${groupId}_${fieldKey}`.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/**
 * Superpone valores del ENTORNO sobre el almacén guardado. El entorno GANA:
 * así, en producción (EasyPanel), poner las claves como variables de entorno del
 * servicio las hace persistir entre redeploys sin depender del volumen /data.
 * Si una variable no está definida (o vacía), se usa el valor del panel.
 */
function superponerEntorno(store: ConfigStore): ConfigStore {
  const out: ConfigStore = { ...store };
  for (const group of CONFIG_GROUPS) {
    for (const field of group.fields) {
      const v = process.env[envVarName(group.id, field.key)];
      if (v !== undefined && v !== "") {
        out[group.id] = { ...(out[group.id] ?? {}), [field.key]: v };
      }
    }
  }
  return out;
}

export async function readConfig(): Promise<ConfigStore> {
  return superponerEntorno(await readConfigRaw());
}

/** Lee el almacén tal cual está en disco, SIN superponer el entorno. Es la base
 * correcta para fusionar al guardar (no debe hornear los secretos que vienen del
 * Environment de EasyPanel dentro del archivo). */
export async function readConfigRaw(): Promise<ConfigStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as ConfigStore;
  } catch {
    /* el almacén es opcional: puede venir todo del entorno */
    return {};
  }
}

/** Claves de campos secretos (type "password") por grupo, según el esquema. */
function camposSecretos(): { group: string; key: string }[] {
  const out: { group: string; key: string }[] = [];
  for (const g of CONFIG_GROUPS)
    for (const f of g.fields) if (f.type === "password") out.push({ group: g.id, key: f.key });
  return out;
}

/**
 * Copia del store con los campos secretos VACIADOS. Los valores de API keys, tokens,
 * service keys y credenciales del VPS NUNCA deben salir del servidor (ni en el JSON de
 * /api/config ni en el payload RSC de la página de Configuración).
 */
export function redactSecrets(store: ConfigStore): ConfigStore {
  const out: ConfigStore = {};
  for (const [gid, group] of Object.entries(store)) {
    out[gid] = { ...(group as Record<string, string>) };
  }
  for (const { group, key } of camposSecretos()) {
    const g = out[group] as Record<string, string> | undefined;
    if (g && g[key] !== undefined && String(g[key]) !== "") g[key] = "";
  }
  return out;
}

/**
 * Fusiona un store entrante (posiblemente redactado por el cliente) sobre el guardado,
 * CONSERVANDO los secretos existentes cuando el entrante los trae vacíos. Así, guardar
 * desde el formulario (que nunca recibió los secretos) no los borra.
 */
export function mergePreservingSecrets(
  incoming: ConfigStore,
  current: ConfigStore,
): ConfigStore {
  const out: ConfigStore = {};
  for (const [gid, group] of Object.entries(incoming)) {
    out[gid] = { ...(group as Record<string, string>) };
  }
  for (const { group, key } of camposSecretos()) {
    const inG = out[group] as Record<string, string> | undefined;
    const entrante = inG ? inG[key] : undefined;
    if (entrante === undefined || String(entrante) === "") {
      const actual = (current[group] as Record<string, string> | undefined)?.[key];
      if (actual !== undefined && String(actual) !== "") {
        (out[group] ??= {} as Record<string, string>)[key] = actual;
      }
    }
  }
  return out;
}

export async function writeConfig(store: ConfigStore): Promise<void> {
  // Asegura que el directorio de datos exista (volumen /data en producción).
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");

  // La regeneración de .env solo sirve en despliegue de UN host (monorepo local).
  // En multi-contenedor esos .env se ignoran y el destino puede no ser escribible;
  // que su fallo NUNCA tumbe el guardado real (el .config-store.json de arriba).
  try {
    await regenerateEnvFiles(store);
  } catch {
    /* no-op: en prod (multi-contenedor) esto no aplica */
  }
}

/**
 * Genera el archivo .env de cada servicio (Dashboard ads, Extractor) a partir
 * del almacén central, usando los `envName` del esquema. Las apps Python siguen
 * leyendo su .env con python-dotenv sin cambios.
 */
export async function regenerateEnvFiles(store: ConfigStore): Promise<void> {
  const shared = store["compartidas"] ?? {};

  for (const group of CONFIG_GROUPS) {
    if (!group.envTarget) continue;
    const values = store[group.id] ?? {};

    const lines = group.fields
      .filter((f) => f.envName)
      .map((f) => {
        // fallback a la key compartida del mismo nombre si el campo está vacío
        let v = values[f.key] ?? "";
        if (!v && f.envName && shared[f.envName.toLowerCase()]) {
          v = shared[f.envName.toLowerCase()];
        }
        if (!v && f.key === "openai_api_key") v = shared["openai_api_key"] ?? "";
        return { name: f.envName as string, value: v };
      })
      // Solo escribimos valores no vacíos: un `VAR=` vacío pisaría el valor por
      // defecto de la app y rompe campos tipados (p.ej. PORT=int en pydantic).
      .filter((e) => e.value !== "")
      .map((e) => `${e.name}=${e.value}`);

    const target = path.join(REPO_ROOT, group.envTarget);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      `# Generado automáticamente desde Configuración. No editar a mano.\n${lines.join("\n")}\n`,
      "utf8",
    );
  }
}
