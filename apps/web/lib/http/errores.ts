// Extrae un mensaje legible de una respuesta fallida: usa {error} si vino JSON,
// si no, muestra el código de estado y el texto crudo (401, 504, HTML, etc.).
// Así el usuario ve la causa REAL en vez de un "no se pudo contactar" genérico.
export async function mensajeDeError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const d = JSON.parse(raw);
    if (d?.error) return String(d.error);
  } catch {
    /* la respuesta no era JSON (401 de login, 504 del proxy, HTML de error…) */
  }
  // Página HTML del proxy (502/504 de EasyPanel): mensaje legible, no el churro.
  const t = raw.trimStart().toLowerCase();
  if (t.startsWith("<!doctype") || t.startsWith("<html")) {
    return `Error ${res.status}: el servidor tardó demasiado o se reinició (respuesta del proxy). Vuelve a intentarlo en unos segundos.`;
  }
  return `Error ${res.status}${raw ? `: ${raw.slice(0, 160)}` : ""}`;
}

export function errorDeRed(e: unknown): string {
  return "Fallo de red: " + (e instanceof Error ? e.message : "desconocido");
}
