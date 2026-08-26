import { readConfig } from "@plataforma/config";

// Instrucciones maestras que el usuario sube/pega en Configuración. Viven en el mismo
// almacén de config (clave "instrucciones"), que persiste en el volumen /data, así que
// sobreviven a los redeploys. Se inyectan en los generadores de IA con prioridad alta.
export type TipoInstruccion = "anuncios" | "embudo";

const TITULOS: Record<TipoInstruccion, string> = {
  anuncios: "REALIZACIÓN DE ANUNCIOS DEL PRODUCTO",
  embudo: "VIDEO DE EMBUDO",
};

/**
 * Devuelve el bloque de prompt con las instrucciones maestras del usuario para `tipo`,
 * o "" si no hay ninguna configurada. Nunca lanza (si falla la lectura, no bloquea la
 * generación).
 */
export async function bloqueInstrucciones(tipo: TipoInstruccion): Promise<string> {
  let texto = "";
  try {
    const cfg = await readConfig();
    texto = String(cfg?.instrucciones?.[tipo] ?? "").trim();
  } catch {
    return "";
  }
  if (!texto) return "";
  return `\n\n=== INSTRUCCIONES MAESTRAS DEL USUARIO — ${TITULOS[tipo]} (PRIORIDAD MÁXIMA) ===
Sigue estas instrucciones AL PIE DE LA LETRA para este trabajo. Si algo aquí choca con
las reglas generales de arriba, MANDAN ESTAS instrucciones — EXCEPTO las restricciones de
cumplimiento (Meta, legales, sin precios/promesas prohibidas), que NUNCA se rompen.
${texto}
=== FIN INSTRUCCIONES MAESTRAS ===`;
}
