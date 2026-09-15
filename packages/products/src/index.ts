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

/**
 * Escribe un archivo de forma ATÓMICA: a un temporal en el MISMO directorio, con
 * fsync, y luego rename() sobre el destino. Un corte/OOM a mitad de escritura deja el
 * temporal a medias, NUNCA el archivo bueno truncado (regla: NADA se pierde en redeploy).
 */
async function writeFileAtomic(dest: string, data: string): Promise<void> {
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(data, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, dest);
}

// Los nombres de producto SIEMPRE van en mayúsculas (regla de negocio). Se aplica al
// leer y al guardar, así los productos que ya existían también salen en mayúsculas sin
// necesidad de migrar el volumen a mano.
function conNombreMayus(p: Producto): Producto {
  const nombre = (p.nombre ?? "").toUpperCase();
  return nombre === p.nombre ? p : { ...p, nombre };
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
          return conNombreMayus(
            JSON.parse(
              await fs.readFile(path.join(STORE_DIR, f), "utf8"),
            ) as Producto,
          );
        } catch (e) {
          // El archivo vino de readdir: si no parsea es corrupción, no ausencia.
          console.error(`[products] ${f} no se pudo parsear:`, e instanceof Error ? e.message : e);
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
    return conNombreMayus(JSON.parse(await fs.readFile(fileFor(id), "utf8")) as Producto);
  } catch (e) {
    // Si el archivo EXISTE pero no parsea, es CORRUPCIÓN (no ausencia): que quede en logs
    // en vez de desaparecer en silencio de la UI.
    if (existsSync(fileFor(id)))
      console.error(
        `[products] ${fileFor(id)} existe pero no se pudo leer/parsear:`,
        e instanceof Error ? e.message : e,
      );
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
    nombre: (p.nombre ?? "").toUpperCase(),
    id: p.id || generarId(),
    creadoEn: p.creadoEn || now,
    actualizadoEn: now,
  };
  await writeFileAtomic(fileFor(producto.id), JSON.stringify(producto, null, 2));
  return producto;
}

export async function deleteProduct(id: string): Promise<void> {
  try {
    await fs.unlink(fileFor(id));
  } catch {
    // no existe → nada que borrar
  }
}
