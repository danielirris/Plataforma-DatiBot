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

const REPO_ROOT = findRepoRoot();
const STORE_PATH = path.join(REPO_ROOT, ".config-store.json");

export async function readConfig(): Promise<ConfigStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as ConfigStore;
  } catch {
    return {};
  }
}

export async function writeConfig(store: ConfigStore): Promise<void> {
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  await regenerateEnvFiles(store);
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
