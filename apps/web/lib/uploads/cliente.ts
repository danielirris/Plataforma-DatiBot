"use client";

import { mensajeDeError } from "@/lib/http/errores";

// Lado cliente del protocolo de trozos (ver lib/uploads/chunks.ts): parte el
// archivo en trozos de 4 MB y los manda EN ORDEN. Cada petición es pequeña, así
// que el límite de tamaño del proxy nunca la corta.

const CHUNK = 4 * 1024 * 1024;

/**
 * Sube un archivo por trozos a `url` y devuelve el JSON del último trozo.
 * `onProgreso` recibe el porcentaje (0-100). Lanza con un mensaje legible.
 */
export async function subirPorTrozos<T = unknown>(
  url: string,
  file: File,
  onProgreso?: (pct: number) => void,
): Promise<T> {
  if (file.size === 0) throw new Error("archivo vacío");

  const total = Math.max(1, Math.ceil(file.size / CHUNK));
  const uploadId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let idx = 0; idx < total; idx++) {
    onProgreso?.(Math.round(((idx + 1) / total) * 100));
    const parte = file.slice(idx * CHUNK, Math.min(file.size, (idx + 1) * CHUNK));
    const qs = new URLSearchParams({
      id: uploadId,
      index: String(idx),
      total: String(total),
      chunkSize: String(CHUNK),
      name: file.name,
    });
    const res = await fetch(`${url}?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: parte,
    });
    if (!res.ok) throw new Error(await mensajeDeError(res));
    if (idx === total - 1) return (await res.json()) as T;
  }
  // Inalcanzable: el bucle siempre llega a total-1. Está por si alguien cambia
  // el bucle y se deja el return.
  throw new Error("La subida terminó sin respuesta del servidor.");
}
