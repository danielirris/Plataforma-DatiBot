// Generación del ebook POR FASES, conectada a la OFERTA del producto:
//   Fase 1: IDEA (qué libro es, desde la oferta)  →  editable
//   Fase 2: ÍNDICE en capítulos                    →  editable
//   Fase 3: REDACCIÓN capítulo a capítulo (bloques del motor)
// Usa el proveedor de texto del shell (Gemini/OpenAI de la config).

import { generarTexto } from "@/lib/ai/textProvider";
import type { EbookIdea, EbookCapitulo, Producto } from "@plataforma/products";

// Los proveedores devuelven 503/429 transitorios; una falla no debe tumbar la
// fase. Reintentos con backoff exponencial.
const TRANSITORIO =
  /\b(429|500|502|503|504)\b|UNAVAILABLE|overloaded|high demand|rate.?limit|timeout|ETIMEDOUT|ECONNRESET/i;

async function generarConReintentos(prompt: string, reintentos = 4): Promise<string> {
  let ultimo: unknown;
  for (let i = 0; i <= reintentos; i++) {
    try {
      return await generarTexto(prompt);
    } catch (e) {
      ultimo = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i === reintentos || !TRANSITORIO.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i)); // 1.5s, 3s, 6s, 12s
    }
  }
  throw ultimo;
}

// Bloques que el modelo puede usar (los mismos que entiende el motor).
const SCHEMA_BLOQUES = `Devuelves SOLO JSON válido (sin markdown, sin texto extra). Bloques disponibles:
- {"type":"section","eyebrow":"Capítulo 0X","title":"..."}
- {"type":"paragraph","text":"..."}   (puedes usar <strong>...</strong>)
- {"type":"list","items":["...","..."]}
- {"type":"callout","kind":"note|sell|danger","tag":"...","text":"..."}
- {"type":"chips","items":["...","..."]}
- {"type":"divider"}
- {"type":"html","title":"...","html":"..."}  → GRÁFICO hecho por ti con HTML (NO es una foto).

Sobre el bloque "html" (úsalo 1-2 veces por capítulo cuando aporte de verdad):
- Sirve para fichas y esquemas: receta (ingredientes + pasos), tabla comparativa,
  checklist, ficha técnica, línea de tiempo, dosis/medidas, antes/después.
- Escribe HTML SIMPLE y SIN estilos propios (nada de style=, class= inventadas,
  script ni imágenes): el diseño del libro lo pinta solo con su tema.
- Etiquetas permitidas: p, b, strong, i, em, br, ul, ol, li, table, thead, tbody,
  tr, th, td, div, span, h3, h4, small, hr.
- Puedes usar estas clases del tema para que quede bonito:
  · <div class="kv"><span>Tiempo</span><b>25 min</b></div>   (dato a la izquierda, valor a la derecha)
  · <span class="badge">Fácil</span>                          (etiqueta destacada)
  · <div class="step"><span class="n">1</span><div>Haz esto…</div></div>  (paso numerado)
  · <div class="grid2"><div>…</div><div>…</div></div>         (dos columnas)
  · table/thead/tbody para tablas.
- Ejemplo (ficha de receta):
  {"type":"html","title":"Ficha de la receta","html":"<div class=\\"grid2\\"><div><h4>Ingredientes</h4><ul><li>2 tazas de agua</li><li>30 g de azúcar</li></ul></div><div><h4>Datos</h4><div class=\\"kv\\"><span>Tiempo</span><b>25 min</b></div><div class=\\"kv\\"><span>Porciones</span><b>4</b></div></div></div><h4>Pasos</h4><div class=\\"step\\"><span class=\\"n\\">1</span><div>Hierve el agua.</div></div><div class=\\"step\\"><span class=\\"n\\">2</span><div>Añade el azúcar y remueve.</div></div>"}`;

export type Bloque = Record<string, unknown>;

function limpiar(raw: string): string {
  return raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseObjeto(raw: string): Record<string, unknown> {
  let s = limpiar(raw);
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

function parseBloques(raw: string): Bloque[] {
  const s = limpiar(raw);
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v as Bloque[];
    if (v && Array.isArray((v as { blocks?: unknown }).blocks))
      return (v as { blocks: Bloque[] }).blocks;
  } catch {
    /* intenta extracción por corchetes abajo */
  }
  const i = s.indexOf("[");
  const j = s.lastIndexOf("]");
  if (i >= 0 && j > i) {
    try {
      const v = JSON.parse(s.slice(i, j + 1));
      if (Array.isArray(v)) return v as Bloque[];
    } catch {
      /* nada */
    }
  }
  return [];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Contexto del producto que alimenta todas las fases (la OFERTA manda). */
function contextoProducto(p: Producto): string {
  const o = p.oferta;
  const partes = [
    `Producto: ${p.nombre}`,
    p.identidad?.promesa ? `Promesa: ${p.identidad.promesa}` : "",
    p.identidad?.dirigidoA ? `Dirigido a: ${p.identidad.dirigidoA}` : "",
  ];
  if (o) {
    partes.push(
      `OFERTA (el ebook ES este entregable — el libro debe cumplirla):`,
      `- Nombre de la oferta: ${o.nombre_oferta}`,
      `- Promesa grande: ${o.promesa_grande}`,
      `- Producto principal: ${o.producto_principal.titulo}`,
      ...o.producto_principal.que_incluye.filter(Boolean).map((x) => `  · ${x}`),
    );
  }
  const a = p.avatar;
  if (a?.deseos || a?.compradores) {
    partes.push(
      `Avatar (para el tono):`,
      a.compradores ? `- Quiénes compran: ${a.compradores.slice(0, 400)}` : "",
      a.deseos ? `- Deseos: ${a.deseos.slice(0, 400)}` : "",
    );
  }
  return partes.filter(Boolean).join("\n");
}

// ── FASE 1: IDEA ──────────────────────────────────────────────
export async function generarIdea(p: Producto): Promise<EbookIdea> {
  const prompt = `Eres un editor experto en infoproductos de respuesta directa. Devuelves SOLO JSON.

${contextoProducto(p)}

Define la IDEA del ebook que materializa esa oferta (es el entregable que el cliente compra). Español neutral.
- "titulo": el título vendedor del libro (puede ser el de la oferta, mejorado).
- "subtitulo": una línea que amplía la promesa.
- "concepto": 2-4 frases: qué es el libro, qué logra el lector y cómo lo entrega.
- "publico": a quién le habla, en una línea.

Devuelve JSON exacto: {"titulo":"...","subtitulo":"...","concepto":"...","publico":"..."}`;

  const o = parseObjeto(await generarConReintentos(prompt));
  return {
    titulo: String(o.titulo ?? ""),
    subtitulo: String(o.subtitulo ?? ""),
    concepto: String(o.concepto ?? ""),
    publico: String(o.publico ?? ""),
  };
}

// ── FASE 2: ÍNDICE (capítulos) ────────────────────────────────
export async function generarIndice(
  p: Producto,
  idea: EbookIdea,
  numCapitulos = 10,
): Promise<EbookCapitulo[]> {
  const prompt = `Eres un editor experto que estructura ebooks. Devuelves SOLO JSON.

${contextoProducto(p)}

IDEA del libro (ya aprobada):
- Título: ${idea.titulo}
- Subtítulo: ${idea.subtitulo}
- Concepto: ${idea.concepto}
- Público: ${idea.publico}

Crea el ÍNDICE: EXACTAMENTE ${numCapitulos} capítulos que cumplen la promesa del libro de principio a fin, con progresión lógica (de fundamentos a resultados). Si la oferta promete una cantidad (ej. 120 recetas), repártela entre los capítulos de forma creíble. Español neutral.

Devuelve JSON exacto: {"capitulos":[{"titulo":"...","resumen":"1-2 frases de qué cubre"}, ...]}`;

  const o = parseObjeto(await generarConReintentos(prompt));
  const arr = Array.isArray(o.capitulos) ? (o.capitulos as Record<string, unknown>[]) : [];
  return arr.map((c) => ({
    titulo: String(c.titulo ?? ""),
    resumen: String(c.resumen ?? ""),
    num_fotos: 1,
    fotos: [],
    bloques: null,
  }));
}

// ── FASE 3: REDACCIÓN de un capítulo ──────────────────────────
export async function generarCapitulo(
  p: Producto,
  idea: EbookIdea,
  capitulos: EbookCapitulo[],
  index: number,
): Promise<Bloque[]> {
  const cap = capitulos[index];
  const indice = capitulos
    .map((c, i) => `${i + 1}. ${c.titulo}`)
    .join("\n");
  const prompt = `${SCHEMA_BLOQUES}

Libro: «${idea.titulo}» — ${idea.subtitulo}
Concepto: ${idea.concepto}
Público: ${idea.publico}

ÍNDICE COMPLETO (para no repetir contenido de otros capítulos):
${indice}

Redacta SOLO el capítulo ${index + 1}: «${cap.titulo}» (${cap.resumen}).
- Empieza con un bloque section (eyebrow='Capítulo ${pad2(index + 1)}', title='${cap.titulo.replace(/'/g, "’")}').
- Extensión: unas 4-6 páginas (párrafos claros, listas prácticas y alguna caja destacada).
- Contenido ACCIONABLE y específico (si son recetas: ingredientes y pasos reales), español neutral, sin relleno.
- NO menciones precios ni links.

Devuelve SOLO la lista JSON de bloques.`;

  return parseBloques(await generarConReintentos(prompt));
}
