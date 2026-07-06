// Generación del CONTENIDO de un ebook (índice → módulo a módulo → bloques).
//
// Portado de ebookforge/generator (llm.py + pipeline.py) a TypeScript, pero
// usando el proveedor de texto del shell (Gemini/OpenAI de /configuracion) en
// vez de Anthropic. Produce SOLO datos (bloques); el diseño lo pone el tema al
// renderizar en el servicio de ebooks.

import { generarTexto } from "@/lib/ai/textProvider";

// La generación es módulo a módulo (muchas llamadas seguidas). Los proveedores
// devuelven 503/429 transitorios con frecuencia, y una sola falla arruinaría el
// ebook entero. Reintentamos con backoff exponencial ante errores transitorios.
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
      // backoff: 1.5s, 3s, 6s, 12s
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw ultimo;
}

export interface ModuloIndice {
  title: string;
  summary: string;
}
export interface Indice {
  title: string;
  subtitle: string;
  intro: string[];
  modules: ModuloIndice[];
}
export type Bloque = Record<string, unknown>;
export interface DocumentoEbook {
  title: string;
  theme: string;
  blocks: Bloque[];
}

// Bloques que el modelo puede usar (los mismos que entiende el motor).
const SCHEMA = `Devuelves SOLO JSON válido (sin markdown, sin texto extra). Bloques disponibles:
- {"type":"section","eyebrow":"Módulo 0X","title":"..."}
- {"type":"paragraph","text":"..."}   (puedes usar <strong>...</strong>)
- {"type":"list","items":["...","..."]}
- {"type":"card","name":"...","link":"https://...","link_text":"...","body":"..."}
- {"type":"callout","kind":"note|sell|danger","tag":"...","text":"..."}
- {"type":"divider"}`;

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

// ── 1) ÍNDICE ─────────────────────────────────────────────────
export async function generarIndice(brief: string, pages = 55): Promise<Indice> {
  const min = Math.max(3, Math.floor(pages / 7));
  const max = Math.max(min + 1, Math.floor(pages / 5));
  const prompt = `Eres un editor experto que estructura ebooks. Devuelves SOLO JSON.

Crea el ÍNDICE de un ebook sobre: ${brief}.
Debe alcanzar ~${pages} páginas, así que propón entre ${min} y ${max} módulos.
Español neutral, claro y práctico.
Devuelve JSON exacto: {"title":"...", "subtitle":"...", "intro":["parrafo1","parrafo2"], "modules":[{"title":"...","summary":"..."}, ...]}`;

  const raw = await generarConReintentos(prompt);
  const o = parseObjeto(raw);
  return {
    title: String(o.title ?? "Ebook"),
    subtitle: String(o.subtitle ?? ""),
    intro: Array.isArray(o.intro) ? (o.intro as unknown[]).map(String) : [],
    modules: Array.isArray(o.modules)
      ? (o.modules as Record<string, unknown>[]).map((m) => ({
          title: String(m.title ?? ""),
          summary: String(m.summary ?? ""),
        }))
      : [],
  };
}

// ── 2) MÓDULO A MÓDULO ────────────────────────────────────────
export async function generarModulo(
  brief: string,
  mod: ModuloIndice,
  index = 1,
): Promise<Bloque[]> {
  const prompt = `${SCHEMA}

Escribe el contenido del módulo «${mod.title}» (${mod.summary}) para un ebook sobre: ${brief}.
Empieza con un bloque section (eyebrow='Módulo ${pad2(index)}', title=el módulo).
Extensión: unas 5-6 páginas (varios párrafos, alguna lista y alguna caja destacada).
Español neutral. Devuelve SOLO la lista JSON de bloques.`;

  return parseBloques(await generarConReintentos(prompt));
}

// ── 3) DOCUMENTO COMPLETO ─────────────────────────────────────
export async function generarDocumento(
  brief: string,
  tema = "amigurumi",
  pages = 40,
  brand = "Entregado por [ TU MARCA ]",
  onProgreso?: (msg: string) => void,
): Promise<DocumentoEbook> {
  const log = (m: string) => onProgreso?.(m);

  log("Generando índice…");
  const o = await generarIndice(brief, pages);
  log(`Índice: ${o.modules.length} módulos.`);

  const blocks: Bloque[] = [
    {
      type: "cover",
      title: o.title,
      subtitle: o.subtitle,
      welcome: o.intro,
      brand,
      brand_sub: "Edición 2026",
    },
  ];

  for (let i = 0; i < o.modules.length; i++) {
    log(`Generando módulo ${i + 1}/${o.modules.length}: ${o.modules[i].title}…`);
    blocks.push(...(await generarModulo(brief, o.modules[i], i + 1)));
    if (i < o.modules.length - 1) blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "closing",
    big: "¡Gracias!",
    small: "Esperamos que esta guía te sea muy útil.",
    brand,
  });

  return { title: o.title, theme: tema, blocks };
}
