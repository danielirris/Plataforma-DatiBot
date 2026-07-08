import type { Avatar } from "@plataforma/products";

// Registro EN MEMORIA de las investigaciones de avatar en segundo plano.
//
// La investigación (Gemini + Google Search) tarda ~40-90s y superaba el timeout
// del proxy en una petición síncrona (502). Con este patrón el POST lanza el
// trabajo y responde al instante con un job_id; la UI sondea el estado.
//
// Asume UN proceso Node (despliegue standalone de EasyPanel con 1 instancia):
// el Map se comparte entre /api/avatar y /api/avatar/[jobId] dentro del proceso.
// El trabajo sigue corriendo tras responder porque el servidor Node es de larga
// vida (no serverless).

export type EstadoAvatarJob = "running" | "done" | "error";

interface AvatarJob {
  status: EstadoAvatarJob;
  avatar?: Avatar;
  error?: string;
  updatedAt: number;
}

// Anclado a globalThis: Next.js bundlea cada route handler por separado, así que
// un `new Map()` a nivel de módulo daría UNA COPIA por ruta (POST y GET verían
// Maps distintos → 404). globalThis es único por proceso y además sobrevive al
// HMR en desarrollo. Así /api/avatar y /api/avatar/[jobId] comparten el registro.
const _g = globalThis as unknown as { __datibotAvatarJobs?: Map<string, AvatarJob> };
const JOBS: Map<string, AvatarJob> = (_g.__datibotAvatarJobs ??= new Map());
const MAX_JOBS = 50;
const TTL_MS = 30 * 60_000; // 30 min

function prune(): void {
  const ahora = Date.now();
  for (const [k, j] of JOBS) if (ahora - j.updatedAt > TTL_MS) JOBS.delete(k);
  if (JOBS.size > MAX_JOBS) {
    // NUNCA desalojar un job 'running': su updatedAt quedó congelado en la
    // creación, así que sería el "más viejo" y el primer candidato — evictarlo
    // dejaría el polling en un 404 falso pese a estar investigando de verdad.
    const viejos = [...JOBS.entries()]
      .filter(([, j]) => j.status !== "running")
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, JOBS.size - MAX_JOBS);
    for (const [k] of viejos) JOBS.delete(k);
  }
}

function nuevoId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return (uuid ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))
    .replace(/-/g, "")
    .slice(0, 12);
}

export function crearAvatarJob(): string {
  prune();
  const id = nuevoId();
  JOBS.set(id, { status: "running", updatedAt: Date.now() });
  return id;
}

export function terminarAvatarJob(id: string, avatar: Avatar): void {
  const j = JOBS.get(id);
  if (j) {
    j.status = "done";
    j.avatar = avatar;
    j.updatedAt = Date.now();
  }
}

export function fallarAvatarJob(id: string, error: string): void {
  const j = JOBS.get(id);
  if (j) {
    j.status = "error";
    j.error = error;
    j.updatedAt = Date.now();
  }
}

export function obtenerAvatarJob(id: string): AvatarJob | undefined {
  return JOBS.get(id);
}
