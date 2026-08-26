import { NextResponse } from "next/server";
import {
  getProduct,
  bloqueQueVendemos,
  type AnalisisAnuncios,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Analiza los ANUNCIOS GANADORES de referencia y devuelve el diagnóstico estratégico
// que orienta los anuncios que vamos a generar: ángulo, dolor y avatar, YA adaptados a
// lo que vendemos realmente (Producto.queVendemos), no al nicho del material.
const SYSTEM_PROMPT = `Eres un estratega de marketing de respuesta directa para LatAm. Te paso anuncios GANADORES de referencia (de un nicho con un avatar similar) y QUÉ vendemos realmente. Tu trabajo es DIAGNOSTICAR el terreno antes de escribir anuncios.

Devuelve un análisis afilado y accionable, en español latinoamericano, con estos cuatro focos:

1. ANGULO: la gran idea / ángulo de ataque que hace que el anuncio funcione (el "por qué esto es distinto/mejor/urgente"). NO es el producto, es el enfoque persuasivo. Adáptalo a lo que vendemos.
2. DOLOR: el dolor o deseo CENTRAL del avatar que el anuncio toca. Concreto, en las palabras del avatar (miedos, frustraciones, sueño). Un dolor primario, no una lista genérica.
3. AVATAR: quién es exactamente la persona a la que le hablamos con estos anuncios: cómo es, cómo habla, qué teme, qué desea, en qué momento está. Que sea reconocible, no un cliché.
4. NOTAS: insights extra para quien va a escribir los anuncios: objeciones a derribar, ganchos/estructuras que funcionan en los ganadores, tono, y CÓMO trasladar todo eso a lo que vendemos realmente.

REGLAS:
- Todo se decide por el AVATAR real de LO QUE VENDEMOS, usando los ganadores solo como plantilla de tono/estructura.
- Nada de relleno ni teoría de manual: frases concretas, ejemplos del avatar, listo para usar.
- Sin cifras monetarias ni promesas prohibidas por Meta.

SALIDA — devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto extra):
{"angulo": "…", "dolor": "…", "avatar": "…", "notas": "…"}
Nada fuera del JSON.`;

function insumos(p: Producto): string {
  const refs = (p.anunciosReferencia ?? [])
    .filter((a) => a.guion?.trim())
    .map(
      (a) =>
        `### Anuncio ganador${a.nicho ? ` (nicho: ${a.nicho})` : ""}${a.titulo ? ` — ${a.titulo}` : ""}\n${a.guion.trim()}`,
    )
    .join("\n\n");

  return `--- INSUMOS ---
Producto: ${p.nombre} | Promesa: ${p.identidad.promesa} | Posicionamiento: ${p.identidad.posicionamiento} | Público: ${p.identidad.dirigidoA}

ANUNCIOS GANADORES DE REFERENCIA (avatar MUY similar; de aquí sacas el ángulo, el dolor y el avatar):
${refs || "(sin anuncios de referencia; deduce el análisis del público y la promesa)"}
${bloqueQueVendemos(p)}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    /* opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const prompt = `${SYSTEM_PROMPT}\n\n${insumos(producto)}`;

  // Guardamos el mensaje real del proveedor (p. ej. "Falta la Gemini API Key") para
  // devolverlo en el 502 en vez de un genérico "Reintenta" que confunde ante un fallo
  // de configuración no recuperable.
  let ultimoError = "";
  async function intento(nota = ""): Promise<AnalisisAnuncios | null> {
    let raw: string;
    try {
      raw = await generarTexto(nota ? `${prompt}\n\nIMPORTANTE: ${nota}` : prompt);
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : "Error del proveedor de IA";
      return null;
    }
    try {
      const o = parsearJson(raw);
      const angulo = str(o.angulo);
      const dolor = str(o.dolor);
      const avatar = str(o.avatar);
      // Esta fase debe entregar ángulo + dolor + avatar: si falta alguno, reintenta.
      if (!angulo || !dolor || !avatar) return null;
      return {
        angulo,
        dolor,
        avatar,
        notas: str(o.notas),
        generadoEn: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  let analisis = await intento();
  if (!analisis)
    analisis = await intento(
      'devuelve SOLO el JSON {"angulo":"…","dolor":"…","avatar":"…","notas":"…"} con contenido en CADA campo (ángulo, dolor y avatar obligatorios).',
    );
  if (!analisis)
    return NextResponse.json(
      { error: ultimoError || "La IA no produjo un análisis válido (ángulo, dolor y avatar). Reintenta." },
      { status: 502 },
    );

  return NextResponse.json({ analisisAnuncios: analisis });
}
