import { NextResponse } from "next/server";
import {
  AVATAR_SECCIONES,
  CATEGORIAS_OBJECION_COMPRA,
  CATEGORIAS_OBJECION_USO,
  type ObjecionCompra,
  type ObjecionUso,
  type Producto,
} from "@plataforma/products";
import { investigarConGemini } from "@/lib/ai/textProvider";

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

// La IA a veces devuelve las viñetas corridas en una sola línea ("- a - b - c").
// Garantiza un salto de línea real antes de cada viñeta para que se lea ordenado.
function formatearVinetas(texto: unknown): string {
  let t = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return t;
  // Viñetas unicode (•, ▪, ●, ‣) → nueva línea con "- ".
  t = t.replace(/\s*[•▪●‣]\s*/g, "\n- ");
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

  // Genera y parsea; valida los dos bloques nuevos. Un solo retry si falta alguno.
  async function intento(notaRetry = "") {
    const { text, fuentes } = await investigarConGemini(
      construirPrompt(body.producto, notaRetry),
    );
    let sec: Record<string, unknown>;
    try {
      sec = parsearJson(text);
    } catch {
      sec = { compradores: text };
    }
    return {
      sec,
      fuentes,
      compra: normObjeciones(sec.objeciones_compra, CATEGORIAS_OBJECION_COMPRA),
      uso: normObjeciones(sec.objeciones_uso, CATEGORIAS_OBJECION_USO),
    };
  }

  let r;
  try {
    r = await intento();
    const faltan: string[] = [];
    if (r.compra.length === 0) faltan.push("objeciones_compra (BLOQUE A)");
    if (r.uso.length === 0) faltan.push("objeciones_uso (BLOQUE B)");
    if (faltan.length) {
      // un único retry, nombrando el/los bloque(s) faltante(s)
      r = await intento(`faltó ${faltan.join(" y ")}; devuélvelo(s) completo(s) con 5 a 8 objeciones cada uno.`);
      const siguen: string[] = [];
      if (r.compra.length === 0) siguen.push("objeciones_compra");
      if (r.uso.length === 0) siguen.push("objeciones_uso");
      if (siguen.length) {
        return NextResponse.json(
          { error: `La IA no devolvió: ${siguen.join(", ")} (tras 1 reintento). Intenta de nuevo.` },
          { status: 502 },
        );
      }
    }
  } catch (e) {
    console.error("[avatar] fallo:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en la investigación" },
      { status: 502 },
    );
  }

  const s = r.sec;
  const avatar = {
    compradores: formatearVinetas(s.compradores),
    deseos: formatearVinetas(s.deseos),
    demografia: formatearVinetas(s.demografia),
    otras_soluciones: formatearVinetas(s.otras_soluciones),
    curiosidad: formatearVinetas(s.curiosidad),
    mecanismo_unico: formatearVinetas(s.mecanismo_unico),
    objeciones_compra: r.compra as ObjecionCompra[],
    objeciones_uso: r.uso as ObjecionUso[],
    fuentes: r.fuentes,
  };

  return NextResponse.json({ avatar });
}
