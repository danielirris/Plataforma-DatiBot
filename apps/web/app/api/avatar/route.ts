import { NextResponse } from "next/server";
import {
  AVATAR_SECCIONES,
  CATEGORIAS_OBJECION_COMPRA,
  CATEGORIAS_OBJECION_USO,
  type Avatar,
  type ObjecionCompra,
  type ObjecionUso,
  type Producto,
} from "@plataforma/products";
import { investigarConGemini, generarJsonGemini } from "@/lib/ai/textProvider";
import { crearAvatarJob, terminarAvatarJob, fallarAvatarJob } from "@/lib/ai/avatarJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  producto: Producto;
}

// Instrucciones de las DOS secciones nuevas (extienden el prompt de las 6 base).
const PROMPT_OBJECIONES = `
Además de las 6 secciones anteriores, produce DOS bloques adicionales de OBJECIONES. Son distintos y NO deben confundirse entre sí:

BLOQUE A — objeciones_compra: qué frena a esta persona en el momento de decidir PAGAR (mente del comprador justo antes de la transacción). Categorías válidas: ${CATEGORIAS_OBJECION_COMPRA.join(", ")}.
Ejemplos: precio ("está muy caro", "no puedo pagarlo ahora"); confianza ("no conozco la marca", "capaz me estafan"); logistica ("no llega a mi ciudad", "cuánto se demora"); autenticidad ("capaz es falsificado"); garantia ("y si no funciona qué"); necesidad ("puedo esperar", "no me urge").

BLOQUE B — objeciones_uso: qué frena a esta persona DESPUÉS de comprar, ya con el producto en la mano (dudas de iniciar el proyecto, adoptar la práctica, usar/mantener). Es crítico: en respuesta directa muchos abandonan aunque hayan comprado. Categorías válidas: ${CATEGORIAS_OBJECION_USO.join(", ")}.
Ejemplo (kéfir de agua): la gente se preocupa por los nódulos (los granos vivos): "¿se van a morir?", "¿cómo los cuido si viajo?", "¿y si contamino la fermentación?", "¿es peligroso mal preparado?", "¿cuánto tiempo al día me quita?". Nada de eso frena la compra: frena el USO.
Ejemplos de categorías: dificultad ("se ve muy complicado para mí"); tiempo ("no voy a tener tiempo"); mantenimiento ("si dejo de hacerlo un día se echa a perder"); riesgo_de_fallar ("capaz lo hago mal y no funciona"); no_soy_capaz ("yo no soy de las que hacen esto"); efectos_secundarios ("y si me cae mal", "y si me hace daño").

Reglas para ambos bloques:
- Objeciones EN PRIMERA PERSONA, como el cliente las piensa ("No creo que me sirva"), no como el vendedor las describe.
- Español neutral, sin modismos.
- Ordena de más frecuente a menos frecuente.
- 5 a 8 objeciones por bloque.
- respuesta_sugerida accionable: la frase/argumento que un mensaje del embudo podría usar. No inventes datos ni promesas; si no hay evidencia, sé honesto (ej. "reconocer que es un cambio de hábitos y ofrecer acompañamiento").`;

function estructuraJson(): string {
  const seis = AVATAR_SECCIONES.map((s) => `"${s.key}": "<respuesta detallada>"`).join(
    ",\n  ",
  );
  return `{
  ${seis},
  "objeciones_compra": [ { "objecion": "...", "categoria": "precio", "respuesta_sugerida": "..." } ],
  "objeciones_uso": [ { "objecion": "...", "categoria": "dificultad", "respuesta_sugerida": "..." } ]
}`;
}

function construirPrompt(p: Producto, notaRetry = ""): string {
  const preguntas = AVATAR_SECCIONES.map((s) => `- "${s.key}": ${s.pregunta}`).join("\n");
  return `Eres un investigador de mercado y estratega de marketing directo. Vas a INVESTIGAR EN LA WEB (foros, redes, YouTube, blogs, lo que la gente pregunta y comenta) al público objetivo de este producto, y luego responder como experto.

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Posicionamiento: ${p.identidad.posicionamiento}
- Dirigido a: ${p.identidad.dirigidoA}

Investiga y responde CADA sección con profundidad, en español neutral, basándote en lo que encuentres de personas reales.
FORMATO: cada sección debe venir como una LISTA DE BULLET POINTS (una idea por línea, empezando con "- " y separadas por saltos de línea \\n), fáciles de leer y de interpretar. Nada de párrafos largos corridos:
${preguntas}
${PROMPT_OBJECIONES}
${notaRetry ? `\nIMPORTANTE: ${notaRetry}\n` : ""}
Devuelve SOLO un objeto JSON con esta forma exacta (sin texto adicional ni fences):
${estructuraJson()}`;
}

// Normaliza una sección del avatar a viñetas ordenadas (una idea por línea).
// Gemini suele devolver la sección como un ARRAY JSON de viñetas; con String()
// se uniría por comas ("- a,- b"). Aquí se maneja el array y también los casos
// de lista corrida en un solo string.
function formatearVinetas(texto: unknown): string {
  // Caso principal: array JSON → una viñeta por elemento.
  if (Array.isArray(texto)) {
    return texto
      .map((x) => String(x ?? "").trim().replace(/^[-•▪●‣]\s*/, ""))
      .filter(Boolean)
      .map((l) => `- ${l}`)
      .join("\n");
  }
  let t = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return t;
  // Viñetas unicode (•, ▪, ●, ‣) → nueva línea con "- ".
  t = t.replace(/\s*[•▪●‣]\s*/g, "\n- ");
  // Separador de array serializado ("idea.,- idea" o "idea,- idea") → salto.
  t = t.replace(/\s*,\s*-\s+/g, "\n- ");
  // Sin ningún salto pero con varias separaciones " - ": es una lista corrida.
  if (!t.includes("\n") && (t.match(/\s-\s/g)?.length ?? 0) >= 2) {
    t = t.replace(/\s+-\s+/g, "\n- ");
  }
  // Viñeta pegada tras el fin de una frase: ". - Siguiente" → salto de línea.
  t = t.replace(/([.;:!?»")\]])\s+-\s+(?=\S)/g, "$1\n- ");
  // Limpieza: viñetas uniformes al inicio de línea y sin saltos triples.
  t = t.replace(/^\s*-\s*/gm, "- ").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
  if (!t.startsWith("- ") && t.includes("\n- ")) t = "- " + t;
  return t;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

function normObjeciones(
  arr: unknown,
  categorias: readonly string[],
): { objecion: string; categoria: string; respuesta_sugerida: string }[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((o) => {
      const obj = (o ?? {}) as Record<string, unknown>;
      const cat = String(obj.categoria ?? "otro");
      return {
        objecion: String(obj.objecion ?? "").trim(),
        categoria: categorias.includes(cat) ? cat : "otro",
        respuesta_sugerida: String(obj.respuesta_sugerida ?? "").trim(),
      };
    })
    .filter((o) => o.objecion.length > 0);
}

// Pide SOLO las objeciones (compra + uso) en una llamada focalizada con JSON
// estricto. Es el rescate cuando la investigación con grounding las trunca. Usa el
// contexto de público ya investigado para que sean pertinentes.
function promptObjeciones(p: Producto, contexto: string): string {
  return `Eres estratega de marketing directo. Para este producto y su público, produce las OBJECIONES (no investigues en la web, sintetiza).

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Dirigido a: ${p.identidad.dirigidoA}
${contexto ? `\nPÚBLICO YA INVESTIGADO (úsalo):\n${contexto}\n` : ""}
${PROMPT_OBJECIONES}

Devuelve SOLO este JSON, sin texto adicional:
{
  "objeciones_compra": [ { "objecion": "...", "categoria": "precio", "respuesta_sugerida": "..." } ],
  "objeciones_uso": [ { "objecion": "...", "categoria": "dificultad", "respuesta_sugerida": "..." } ]
}`;
}

// Rescate fiable de objeciones: hasta 2 intentos con JSON estricto. Se queda con el
// MEJOR resultado (por si un intento trae un bloque y no el otro). Nunca lanza.
async function completarObjeciones(
  p: Producto,
  sec: Record<string, unknown>,
): Promise<{ compra: ObjecionCompra[]; uso: ObjecionUso[] }> {
  const contexto = [formatearVinetas(sec.compradores), formatearVinetas(sec.deseos)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  const mejor = { compra: [] as ObjecionCompra[], uso: [] as ObjecionUso[] };
  for (let i = 0; i < 2; i++) {
    try {
      const o = parsearJson(await generarJsonGemini(promptObjeciones(p, contexto)));
      const compra = normObjeciones(o.objeciones_compra, CATEGORIAS_OBJECION_COMPRA) as ObjecionCompra[];
      const uso = normObjeciones(o.objeciones_uso, CATEGORIAS_OBJECION_USO) as ObjecionUso[];
      if (compra.length > mejor.compra.length) mejor.compra = compra;
      if (uso.length > mejor.uso.length) mejor.uso = uso;
      if (mejor.compra.length && mejor.uso.length) break;
    } catch (e) {
      console.error("[avatar] completarObjeciones intento", i + 1, e);
    }
  }
  return mejor;
}

// Investiga el avatar (Gemini + Google Search). Tarda ~40-90s; por eso corre en
// segundo plano. Devuelve SIEMPRE el avatar (nunca tira la investigación por las
// objeciones): las 6 secciones se conservan pase lo que pase.
async function ejecutarInvestigacion(producto: Producto): Promise<Avatar> {
  // 1) Investigación con grounding: las 6 secciones (+ intento de objeciones).
  const { text, fuentes } = await investigarConGemini(construirPrompt(producto));
  let sec: Record<string, unknown>;
  try {
    sec = parsearJson(text);
  } catch {
    sec = { compradores: text };
  }

  let compra = normObjeciones(sec.objeciones_compra, CATEGORIAS_OBJECION_COMPRA) as ObjecionCompra[];
  let uso = normObjeciones(sec.objeciones_uso, CATEGORIAS_OBJECION_USO) as ObjecionUso[];

  // 2) Si el grounding truncó/omitió las objeciones (van al final del JSON, es lo que
  //    más se pierde), las rescatamos con una llamada FOCALIZADA con JSON estricto
  //    —fiable— en vez de rehacer toda la investigación (que es lo que fallaba).
  if (compra.length === 0 || uso.length === 0) {
    const extra = await completarObjeciones(producto, sec);
    if (compra.length === 0) compra = extra.compra;
    if (uso.length === 0) uso = extra.uso;
  }

  // 3) Aunque las objeciones fallen del todo, NO se tira la investigación: la UI ya
  //    permite generarlas por bloque o añadirlas a mano, y el usuario conserva las
  //    6 secciones (antes se perdían los 40-90s de research por esto).
  return {
    compradores: formatearVinetas(sec.compradores),
    deseos: formatearVinetas(sec.deseos),
    demografia: formatearVinetas(sec.demografia),
    otras_soluciones: formatearVinetas(sec.otras_soluciones),
    curiosidad: formatearVinetas(sec.curiosidad),
    mecanismo_unico: formatearVinetas(sec.mecanismo_unico),
    objeciones_compra: compra,
    objeciones_uso: uso,
    fuentes,
  };
}

// Lanza la investigación en SEGUNDO PLANO y responde al instante con un job_id.
// La UI sondea /api/avatar/[jobId]. Así no depende del timeout del proxy.
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body?.producto?.nombre) {
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });
  }

  const jobId = crearAvatarJob();
  // Sin await: el trabajo sigue tras responder (servidor Node de larga vida).
  void ejecutarInvestigacion(body.producto)
    .then((avatar) => terminarAvatarJob(jobId, avatar))
    .catch((e) => {
      console.error("[avatar] fallo:", e);
      fallarAvatarJob(jobId, e instanceof Error ? e.message : "Error en la investigación");
    });

  return NextResponse.json({ job_id: jobId }, { status: 202 });
}
