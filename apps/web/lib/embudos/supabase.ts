// Cliente Supabase MÍNIMO para el editor de Embudos. SOLO servidor: usa la SERVICE
// KEY (rol service_role) leída de variables de entorno; NUNCA se expone al navegador.
// Sin SDK: fetch directo a la REST API de PostgREST (/rest/v1), como el resto del
// "cerebro" de la plataforma.
//
// Variables de entorno (EasyPanel, servicio web):
//   EMBUDOS_SUPABASE_URL          (opcional; por defecto el proyecto conocido)
//   EMBUDOS_SUPABASE_SERVICE_KEY  (OBLIGATORIA; secreta — nunca en código)
//
// Este módulo es SOLO de servidor (lo importan únicamente rutas /api). La service key
// se lee de process.env, que Next nunca expone al navegador.

const DEFAULT_URL = "https://jquahxsesqcjakxkcneu.supabase.co";

export function supabaseUrl(): string {
  return (process.env.EMBUDOS_SUPABASE_URL || DEFAULT_URL).replace(/\/+$/, "");
}

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.EMBUDOS_SUPABASE_SERVICE_KEY);
}

function serviceKey(): string {
  const k = process.env.EMBUDOS_SUPABASE_SERVICE_KEY;
  if (!k) {
    throw new Error(
      "Falta EMBUDOS_SUPABASE_SERVICE_KEY. Configúrala en el Environment de EasyPanel (servicio web).",
    );
  }
  return k;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const key = serviceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

class SupabaseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; hint?: string; details?: string };
    return body.message || body.details || body.hint || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

type QueryParams = Record<string, string>;

/** SELECT: lee filas de una tabla con filtros PostgREST (ej. { phone_id: "eq.123" }). */
export async function selectRows<T>(
  tabla: string,
  params: QueryParams = {},
): Promise<T[]> {
  const qs = new URLSearchParams({ select: "*", ...params }).toString();
  const res = await fetch(`${supabaseUrl()}/rest/v1/${tabla}?${qs}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new SupabaseError(await parseError(res), res.status);
  return (await res.json()) as T[];
}

/**
 * UPSERT: inserta o actualiza una fila (por su PK). `onConflict` son las columnas
 * de la clave (ej. "phone_id" o "producto,pais"). Devuelve la fila resultante.
 */
export async function upsertRow<T>(
  tabla: string,
  fila: Record<string, unknown>,
  onConflict: string,
): Promise<T> {
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/${tabla}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(fila),
    },
  );
  if (!res.ok) throw new SupabaseError(await parseError(res), res.status);
  const rows = (await res.json()) as T[];
  return rows[0];
}

/** UPSERT en lote: inserta/actualiza VARIAS filas en una sola llamada. */
export async function upsertRows<T>(
  tabla: string,
  filas: Record<string, unknown>[],
  onConflict: string,
): Promise<T[]> {
  if (!filas.length) return [];
  const res = await fetch(
    `${supabaseUrl()}/rest/v1/${tabla}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: headers({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(filas),
    },
  );
  if (!res.ok) throw new SupabaseError(await parseError(res), res.status);
  return (await res.json()) as T[];
}

/** DELETE: borra filas que cumplan los filtros (ej. { phone_id: "eq.123" }). */
export async function deleteRows(tabla: string, params: QueryParams): Promise<void> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${supabaseUrl()}/rest/v1/${tabla}?${qs}`, {
    method: "DELETE",
    headers: headers({ Prefer: "return=minimal" }),
  });
  if (!res.ok) throw new SupabaseError(await parseError(res), res.status);
}

export { SupabaseError };
