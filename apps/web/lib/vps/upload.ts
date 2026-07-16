import SftpClient from "ssh2-sftp-client";
import { existsSync } from "node:fs";
import { readConfig } from "@plataforma/config";

// Módulo de subida AISLADO. Dos modos:
//  - LOCAL (recomendado en despliegue de un host): el shell y el servidor de
//    imágenes comparten un volumen; el shell escribe el archivo directo en
//    `localDir` (sin SSH) y devuelve la URL pública. Se activa si `localDir`
//    (config vps.local_dir / env VPS_LOCAL_DIR) está definido.
//  - SFTP: sube al VPS por SSH (para cuando el destino es otro host).

export interface VpsConfig {
  host: string;
  port: number;
  user: string;
  auth: string;
  remoteDir: string;
  publicBaseUrl: string;
  /** si está, se escribe directo aquí (sin SFTP) — carpeta compartida con nginx */
  localDir: string;
}

export async function leerVpsConfig(): Promise<VpsConfig> {
  const vps = (await readConfig())["vps"] ?? {};
  return {
    host: vps["vps_host"] ?? "",
    port: Number(vps["vps_port"] || 22),
    user: vps["vps_user"] ?? "",
    auth: vps["vps_auth"] ?? "",
    remoteDir: vps["vps_remote_dir"] ?? "",
    publicBaseUrl: (vps["vps_public_base_url"] ?? "").replace(/\/+$/, ""),
    localDir: (vps["local_dir"] ?? "").trim(),
  };
}

export function faltantesVps(c: VpsConfig): string[] {
  const faltan: string[] = [];
  // Auto-servido (IMG_PUBLIC_BASE): el web sirve las imágenes por /api/img desde
  // la carpeta local, así que no hace falta la URL pública de nginx… pero SÍ la
  // carpeta local. Sin ella no hay de dónde servir, y la subida se iría a SFTP
  // con datos vacíos y un error de conexión incomprensible. Se exige aquí.
  const autoServido = !!(process.env.IMG_PUBLIC_BASE ?? "").trim();
  if (!autoServido && !c.publicBaseUrl) faltan.push("URL pública base");
  if (autoServido) {
    if (!c.localDir) faltan.push("carpeta local (VPS_LOCAL_DIR)");
    return faltan;
  }
  // Modo local: la carpeta se crea sola, no se usa SFTP.
  if (c.localDir) return faltan;
  // Modo SFTP: hacen falta los datos de conexión.
  if (!c.host) faltan.push("host");
  if (!c.user) faltan.push("usuario");
  if (!c.auth) faltan.push("clave/contraseña");
  if (!c.remoteDir) faltan.push("directorio remoto");
  return faltan;
}

async function construirConexion(cfg: VpsConfig): Promise<Record<string, unknown>> {
  const conexion: Record<string, unknown> = {
    host: cfg.host,
    port: cfg.port,
    username: cfg.user,
  };
  // `auth` se interpreta como ruta a clave privada si el archivo existe; si no,
  // como contraseña.
  if (existsSync(cfg.auth)) {
    const { readFile } = await import("node:fs/promises");
    conexion.privateKey = await readFile(cfg.auth);
  } else {
    conexion.password = cfg.auth;
  }
  return conexion;
}

/** Guarda un buffer (local o por SFTP) y devuelve la URL pública. */
export async function subirImagen(
  buffer: Buffer,
  nombreArchivo: string,
  cfg: VpsConfig,
): Promise<string> {
  if (cfg.localDir) {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const dir = cfg.localDir.replace(/\/+$/, "");
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${nombreArchivo}`, buffer);
    // Si el propio web sirve las imágenes (IMG_PUBLIC_BASE = su dominio), la URL
    // apunta a /api/img — no depende de que nginx comparta el volumen. Si no,
    // se mantiene el comportamiento clásico (nginx en publicBaseUrl).
    const selfBase = (process.env.IMG_PUBLIC_BASE ?? "").replace(/\/+$/, "");
    if (selfBase) return `${selfBase}/api/img/${encodeURIComponent(nombreArchivo)}`;
    return `${cfg.publicBaseUrl}/${nombreArchivo}`;
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect(await construirConexion(cfg));
    const remoto = `${cfg.remoteDir.replace(/\/+$/, "")}/${nombreArchivo}`;
    await sftp.put(buffer, remoto);
    return `${cfg.publicBaseUrl}/${nombreArchivo}`;
  } finally {
    await sftp.end().catch(() => {});
  }
}

/**
 * Guarda un archivo YA escrito en disco (p. ej. re-armado por trozos) y devuelve
 * su URL pública. En modo local copia por streaming (sin cargarlo a RAM, apto
 * para videos grandes); en modo SFTP cae a subirImagen con buffer.
 */
export async function guardarArchivoDesdeRuta(
  origen: string,
  nombreArchivo: string,
  cfg: VpsConfig,
): Promise<string> {
  if (cfg.localDir) {
    const { copyFile, mkdir } = await import("node:fs/promises");
    const dir = cfg.localDir.replace(/\/+$/, "");
    await mkdir(dir, { recursive: true });
    await copyFile(origen, `${dir}/${nombreArchivo}`);
    const selfBase = (process.env.IMG_PUBLIC_BASE ?? "").replace(/\/+$/, "");
    if (selfBase) return `${selfBase}/api/img/${encodeURIComponent(nombreArchivo)}`;
    return `${cfg.publicBaseUrl}/${nombreArchivo}`;
  }
  // SFTP: fastPut sube LEYENDO DEL DISCO (streaming). Nunca cargar el archivo
  // entero en memoria: un video de 2 GB tumbaría el contenedor por OOM.
  const sftp = new SftpClient();
  try {
    await sftp.connect(await construirConexion(cfg));
    const remoto = `${cfg.remoteDir.replace(/\/+$/, "")}/${nombreArchivo}`;
    await sftp.fastPut(origen, remoto);
    return `${cfg.publicBaseUrl}/${nombreArchivo}`;
  } finally {
    await sftp.end().catch(() => {});
  }
}

/**
 * Borra la imagen de una URL pública (deriva el nombre del último segmento).
 * Si el archivo no existe, no falla.
 */
export async function eliminarImagen(url: string, cfg: VpsConfig): Promise<void> {
  const nombre = (url.split("?")[0].split("/").pop() ?? "").trim();
  if (!nombre) return;

  if (cfg.localDir) {
    const { unlink } = await import("node:fs/promises");
    await unlink(`${cfg.localDir.replace(/\/+$/, "")}/${nombre}`).catch(() => {});
    return;
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect(await construirConexion(cfg));
    const remoto = `${cfg.remoteDir.replace(/\/+$/, "")}/${nombre}`;
    await sftp.delete(remoto).catch(() => {});
  } finally {
    await sftp.end().catch(() => {});
  }
}
