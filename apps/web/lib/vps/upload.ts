import SftpClient from "ssh2-sftp-client";
import { existsSync } from "node:fs";
import { readConfig } from "@plataforma/config";

// Módulo de subida AISLADO. Hoy sube por SFTP al VPS del usuario. Si el VPS
// expone en su lugar un endpoint HTTP de subida, se cambia SOLO este archivo
// (misma firma subirImagen → URL pública) sin tocar el resto del flujo.

export interface VpsConfig {
  host: string;
  port: number;
  user: string;
  auth: string;
  remoteDir: string;
  publicBaseUrl: string;
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
  };
}

export function faltantesVps(c: VpsConfig): string[] {
  const faltan: string[] = [];
  if (!c.host) faltan.push("host");
  if (!c.user) faltan.push("usuario");
  if (!c.auth) faltan.push("clave/contraseña");
  if (!c.remoteDir) faltan.push("directorio remoto");
  if (!c.publicBaseUrl) faltan.push("URL pública base");
  return faltan;
}

/**
 * Sube un buffer al VPS y devuelve la URL pública (URL base + nombre).
 * `auth` se interpreta como ruta a clave privada si el archivo existe;
 * si no, como contraseña.
 */
async function construirConexion(cfg: VpsConfig): Promise<Record<string, unknown>> {
  const conexion: Record<string, unknown> = {
    host: cfg.host,
    port: cfg.port,
    username: cfg.user,
  };
  if (existsSync(cfg.auth)) {
    const { readFile } = await import("node:fs/promises");
    conexion.privateKey = await readFile(cfg.auth);
  } else {
    conexion.password = cfg.auth;
  }
  return conexion;
}

export async function subirImagen(
  buffer: Buffer,
  nombreArchivo: string,
  cfg: VpsConfig,
): Promise<string> {
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
 * Borra del VPS la imagen de una URL pública (deriva el nombre del último
 * segmento de la URL y borra remoteDir/nombre). Si el archivo no existe, no falla.
 */
export async function eliminarImagen(url: string, cfg: VpsConfig): Promise<void> {
  const nombre = (url.split("?")[0].split("/").pop() ?? "").trim();
  if (!nombre) return;
  const sftp = new SftpClient();
  try {
    await sftp.connect(await construirConexion(cfg));
    const remoto = `${cfg.remoteDir.replace(/\/+$/, "")}/${nombre}`;
    await sftp.delete(remoto).catch(() => {});
  } finally {
    await sftp.end().catch(() => {});
  }
}
