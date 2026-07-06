import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import type { Producto } from "./schema";

export * from "./schema";

// El almacén vive en la raíz del monorepo, fuera de git (.gitignore), como
// .config-store.json. Un archivo JSON por producto en .products-store/.
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

// DATA_DIR: en producción (contenedor) apunta a un volumen persistente; en local
// queda undefined y se usa la raíz del monorepo.
const STORE_DIR = path.join(process.env.DATA_DIR || findRepoRoot(), ".products-store");

/** Sanea el id para usarlo como nombre de archivo (evita path traversal). */
function safeId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "");
}

function generarId(): string {
  return (
    "prod_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function fileFor(id: string): string {
  return path.join(STORE_DIR, `${safeId(id)}.json`);
}

export async function listProducts(): Promise<Producto[]> {
  let files: string[];
  try {
    files = await fs.readdir(STORE_DIR);
  } catch {
    return [];
  }
  const productos = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        try {
          return JSON.parse(
            await fs.readFile(path.join(STORE_DIR, f), "utf8"),
          ) as Producto;
        } catch {
          return null;
        }
      }),
  );
  return productos
    .filter((p): p is Producto => p !== null)
    .sort((a, b) => (b.actualizadoEn || "").localeCompare(a.actualizadoEn || ""));
}

export async function getProduct(id: string): Promise<Producto | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(id), "utf8")) as Producto;
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza un producto. Genera `id` si falta, fija `creadoEn` la primera
 * vez y siempre refresca `actualizadoEn`. Devuelve el producto persistido.
 */
export async function saveProduct(p: Producto): Promise<Producto> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  const now = new Date().toISOString();
  const producto: Producto = {
    ...p,
    id: p.id || generarId(),
    creadoEn: p.creadoEn || now,
    actualizadoEn: now,
  };
  await fs.writeFile(
    fileFor(producto.id),
    JSON.stringify(producto, null, 2),
    "utf8",
  );
  return producto;
}

export async function deleteProduct(id: string): Promise<void> {
  try {
    await fs.unlink(fileFor(id));
  } catch {
    // no existe → nada que borrar
  }
}
