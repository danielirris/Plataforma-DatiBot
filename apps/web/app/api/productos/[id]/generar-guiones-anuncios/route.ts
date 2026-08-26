import { NextResponse } from "next/server";
import {
  getProduct,
  bloqueQueVendemos,
  type GuionAnuncio,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";
import { bloqueInstrucciones } from "@/lib/ai/instrucciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const MIN = 1;
const MAX = 8;
const POR_DEFECTO = 3;

// Genera GUIONES DE ANUNCIOS de CAPTACIÓN (los que frenan el scroll en el feed y llevan
// al WhatsApp). NO son el guión de embudo (ese es de cierre, ya dentro del chat). Se
// apoyan en el análisis (ángulo/dolor/avatar) y en los ganadores de referencia.
const SYSTEM_PROMPT = `Eres un copywriter de respuesta directa para Meta Ads en LatAm, experto en anuncios UGC en video que frenan el scroll y disparan clics a WhatsApp. Escribes GUIONES DE ANUNCIOS DE CAPTACIÓN en español latinoamericano, listos para grabar.

CONTEXTO: este anuncio es de CAPTACIÓN (feed frío / interés tibio). Su ÚNICO trabajo es frenar el scroll, conectar con el dolor/deseo del avatar y llevar a dar clic al botón de WhatsApp. NO es el video de cierre del embudo (ese va después, dentro del chat).

TODO se decide por el AVATAR y el ÁNGULO del análisis que te paso, adaptado a LO QUE VENDEMOS REALMENTE (usa los ganadores de referencia solo como plantilla de tono y estructura).

ANATOMÍA de cada guión (en orden):
1. GANCHO (primeros 3 segundos, decisivo): una frase que frena el scroll — patrón interrumpido, pregunta al avatar, afirmación polémica, "si eres X y te pasa Y…", o testimonio en 1ª persona. Nada genérico.
2. AGITACIÓN / IDENTIFICACIÓN: toca el dolor o deseo central del avatar en sus propias palabras. Que sienta "esto es para mí".
3. PUENTE / GRAN IDEA: presenta el ángulo (el porqué esto es distinto/mejor/fácil), sin sonar a comercial.
4. PRUEBA / DEMOSTRACIÓN: un motivo concreto para creer (qué se lleva, cómo funciona, mini-demostración, resultado cualitativo). Sin cifras de dinero.
5. CTA CLARO: "escríbeme *[palabra]*" o "da clic en el botón de WhatsApp y te cuento". Nunca "comenta".

REGLAS DURAS:
- Cada guión distinto de los otros: varía el gancho y el ángulo (uno testimonial, uno de problema-solución, uno de demostración, etc.). Nada de repetir la misma idea con otras palabras.
- SIN precios, moneda ni cifras económicas. SIN promesas de ingresos ("gana $X").
- SIN absolutos prohibidos por Meta: "garantizado", "100%", "siempre", "cura", "transforma tu vida", "resultados asegurados".
- Texto PURO listo para grabar (prosa con saltos de línea para la respiración del narrador). SIN notas de escena, SIN direcciones de cámara, SIN emojis en exceso.
- CTA solo "da clic" o "escríbeme", NUNCA "comenta".
- No prometas lo que no está en el producto/oferta.

SALIDA — devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto extra):
{"guiones": [{"titulo": "título corto y el enfoque, ej. 'Testimonio en 1ª persona'", "angulo": "el ángulo/gancho concreto de este anuncio", "guion": "el guión completo listo para grabar, con \\n para saltos de línea"}]}
Nada fuera del JSON.`;

function insumos(p: Producto, cantidad: number): string {
  const refs = (p.anunciosReferencia ?? [])
    .filter((a) => a.guion?.trim())
    .map(
      (a) =>
        `### Anuncio ganador${a.nicho ? ` (nicho: ${a.nicho})` : ""}${a.titulo ? ` — ${a.titulo}` : ""}\n${a.guion.trim()}`,
    )
    .join("\n\n");

  const a = p.analisisAnuncios;
  const analisis = a
    ? `
ANÁLISIS ESTRATÉGICO (respétalo, es la brújula de estos anuncios):
- Ángulo: ${a.angulo || "(no definido)"}
- Dolor / deseo central: ${a.dolor || "(no definido)"}
- Avatar: ${a.avatar || "(no definido)"}
${a.notas ? `- Notas: ${a.notas}` : ""}`
    : "\n(No hay análisis previo; dedúcelo de los anuncios de referencia y del público.)";

  const o = p.oferta;
  const oferta = o
    ? `
OFERTA (lo que se lleva, para insinuarlo en la prueba/CTA — sin precios):
- Promesa: ${o.promesa_grande}
- Producto principal: ${o.producto_principal?.titulo ?? ""} — ${o.producto_principal?.descripcion_corta ?? ""}
${(o.bonos ?? []).filter((b) => b?.titulo?.trim()).length ? `- Bonos: ${(o.bonos ?? []).filter((b) => b?.titulo?.trim()).map((b) => b.titulo).join("; ")}` : ""}`
    : "";

  return `--- INSUMOS ---
Producto: ${p.nombre} | Promesa: ${p.identidad.promesa} | Posicionamiento: ${p.identidad.posicionamiento} | Público: ${p.identidad.dirigidoA}
${bloqueQueVendemos(p)}
ANUNCIOS GANADORES DE REFERENCIA (plantilla de tono/estructura, avatar similar):
${refs || "(sin anuncios de referencia)"}
${analisis}
${oferta}

TAREA: escribe EXACTAMENTE ${cantidad} guion(es) de anuncio DISTINTOS entre sí.`;
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

function idFor(i: number): string {
  return `ga_${Date.now().toString(36)}_${i}`;
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; cantidad?: number } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    /* opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const cantidad = Math.min(MAX, Math.max(MIN, Math.round(Number(body?.cantidad) || POR_DEFECTO)));
  const instrucciones = await bloqueInstrucciones("anuncios");
  const prompt = `${SYSTEM_PROMPT}${instrucciones}\n\n${insumos(producto, cantidad)}`;

  // Mensaje real del proveedor para el 502 (evita el genérico "Reintenta" ante fallos
  // de configuración como una API key ausente).
  let ultimoError = "";
  async function intento(nota = ""): Promise<GuionAnuncio[] | null> {
    let raw: string;
    try {
      raw = await generarTexto(nota ? `${prompt}\n\nIMPORTANTE: ${nota}` : prompt);
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : "Error del proveedor de IA";
      return null;
    }
    try {
      const o = parsearJson(raw);
      const arr = Array.isArray(o.guiones) ? o.guiones : [];
      const guiones: GuionAnuncio[] = [];
      for (let k = 0; k < arr.length; k++) {
        const g = (arr[k] ?? {}) as Record<string, unknown>;
        const guion = str(g.guion);
        if (!guion) continue;
        guiones.push({
          id: idFor(k),
          titulo: str(g.titulo) || `Anuncio ${k + 1}`,
          angulo: str(g.angulo),
          guion,
          generadoEn: new Date().toISOString(),
        });
      }
      return guiones.length ? guiones : null;
    } catch {
      return null;
    }
  }

  let guiones = await intento();
  if (!guiones)
    guiones = await intento(
      `devuelve SOLO el JSON {"guiones":[{"titulo":"…","angulo":"…","guion":"…"}]} con ${cantidad} guion(es), cada uno con su texto completo.`,
    );
  if (!guiones)
    return NextResponse.json(
      { error: ultimoError || "La IA no produjo guiones válidos. Reintenta." },
      { status: 502 },
    );

  return NextResponse.json({ guionesAnuncios: guiones });
}
