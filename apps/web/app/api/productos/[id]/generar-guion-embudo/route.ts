import { NextResponse } from "next/server";
import { getProduct, type GuionEmbudo, type Producto } from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Genera el GUIÓN del VIDEO DE EMBUDO (el video de CIERRE que va DENTRO del WhatsApp,
// después de que la persona ya hizo clic en el anuncio). NO es de captación. Sigue
// las "INSTRUCCIONES MAESTRAS — Generador de Guiones de Video para Embudo".
const SYSTEM_PROMPT = `Eres un copywriter experto en respuesta directa para bajo ticket en WhatsApp/Meta LatAm. Escribes GUIONES de VIDEO DE EMBUDO en español latinoamericano de 30 a 90 segundos.

REGLA MADRE: este video NO es de captación, es de CIERRE. La persona YA vio el anuncio, YA hizo clic, YA está en WhatsApp. No hay que ganchear ni segmentar ni convencer del problema: hay que mostrar el producto por dentro, amplificar el valor percibido, reforzar los bonos y empujar al pago YA. Es un asesor entusiasta mostrándote lo que ya casi es tuyo.

TODO SE DEFINE POR EL AVATAR (dedúcelo de los ANUNCIOS GANADORES de referencia y del público):
- Avatar HOMBRE → véndele RESULTADOS (lograr, ganar, dominar; cifras, capacidad, estatus).
- Avatar MUJER → véndele SENTIMIENTO (emoción, alivio, transformación; primera persona).
- Mujer trabajadora/emprendedora → MIXTO: emoción (orgullo, independencia) + resultado (más ingreso, más clientas).

ANATOMÍA OBLIGATORIA (en orden; los [OBLIGATORIO] no faltan):
1. Gancho de embudo [OBLIGATORIO]: ANCLA, no scroll-stopper. "Mira todo lo que te vas a llevar con…" o testimonio en 1ª persona ("Mi nombre es X y ojalá hubiera descubierto esto antes"). NUNCA dolor agresivo ni pregunta agresiva.
2. Inventario visual del contenido [OBLIGATORIO]: el bloque más importante. Enumera lo que se lleva con ESPECIFICIDAD (nombres de secciones/módulos, cantidades). Sin especificidad no hay valor percibido.
3. Facilidad de uso / derribo de objeción [OBLIGATORIO]: mata "yo no puedo, esto no es para mí" ("aunque nunca hayas hecho X…", "no necesitas experiencia…").
4. Bonos con utilidad concreta [OBLIGATORIO si hay bonos]: cada bono conectado a un uso claro para el avatar (nunca "y de regalo un certificado" suelto).
5. Cierre racional del negocio [si aplica]: una frase de lógica pura ("misma clienta, mismo día, doble ingreso"). Suena a hecho, no a promesa.
6. Portabilidad y permanencia: "todo te llega en PDF a tu WhatsApp", "es tuyo para siempre".
7. Riesgo cero [OBLIGATORIO si el modelo es "primero envío"]: "Primero te envío todo el material, lo revisas con calma, y después decides si haces el aporte. Sin trucos."
8. CTA final con palabra clave [OBLIGATORIO]: "Escríbeme *YA QUIERO* y te paso todo en los próximos minutos" o "Da clic en el botón de WhatsApp y recibe todo ahora".

REGLAS DURAS (innegociables):
- SIN precios, monedas ni cifras económicas específicas. Nada de comparaciones de precio. Usa "aporte simbólico" / "colaboración simbólica" (sin monto).
- CTA solo "da clic" o "escríbeme", NUNCA "comenta".
- SIN notas visuales ni descripción de escena: texto puro listo para grabar, en prosa con saltos de línea para la respiración del narrador.
- SIN promesas de cifras de ingreso ("gané $X", "vas a ganar $Y al mes"). Usa posibilidad y resultado cualitativo.
- SIN absolutos prohibidos por Meta: "siempre", "garantizado", "100% efectivo", "sin fallar", "infalible", "transforma tu vida", "cura", "resultados asegurados".
- NO prometas lo que NO está en el producto/oferta.

FORMATOS (elige UNO según el avatar y el producto): A muestra del producto (45-70s) · B testimonial de crisis y salida (55-75s) · C cronología de crecimiento (55-70s) · D ultra corto retargeting (20-30s) · E descubrimiento accidental (45-60s).

SALIDA — devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto extra):
{"formato": "A|B|C|D|E", "guion": "el guión completo listo para grabar, en prosa con \\n para saltos de línea"}
Nada fuera del JSON.`;

function insumos(p: Producto): string {
  const refs = (p.anunciosReferencia ?? [])
    .filter((a) => a.guion?.trim())
    .map((a) => `### Anuncio ganador${a.nicho ? ` (nicho: ${a.nicho})` : ""}${a.titulo ? ` — ${a.titulo}` : ""}\n${a.guion.trim()}`)
    .join("\n\n");

  const o = p.oferta;
  let oferta = "";
  if (o) {
    const pp = o.producto_principal;
    const incluye = (pp?.que_incluye ?? []).filter((x) => String(x).trim());
    const bonos = (o.bonos ?? [])
      .filter((b) => String(b?.titulo ?? "").trim())
      .map((b) => `- ${b.titulo}: ${b.descripcion_corta} (desactiva: ${b.objecion_que_desactiva})`)
      .join("\n");
    oferta = `
OFERTA (lo que se lleva):
- Promesa grande: ${o.promesa_grande}
- Producto principal: ${pp?.titulo ?? ""} — ${pp?.descripcion_corta ?? ""}
${incluye.length ? `- Incluye: ${incluye.join("; ")}` : ""}
${bonos ? `Bonos:\n${bonos}` : ""}
- Framing: ${o.framing_del_stack}
- Urgencia: ${o.razon_de_urgencia}`;
  }

  return `--- INSUMOS ---
Producto: ${p.nombre} | Promesa: ${p.identidad.promesa} | Posicionamiento: ${p.identidad.posicionamiento} | Público: ${p.identidad.dirigidoA}

ANUNCIOS GANADORES DE REFERENCIA (avatar MUY similar; de aquí sacas el tono, el avatar y sus objeciones):
${refs || "(sin anuncios de referencia; deduce el avatar del público y la promesa)"}
${oferta}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const prompt = `${SYSTEM_PROMPT}\n\n${insumos(producto)}`;

  async function intento(nota = ""): Promise<GuionEmbudo | null> {
    let raw: string;
    try {
      raw = await generarTexto(nota ? `${prompt}\n\nIMPORTANTE: ${nota}` : prompt);
    } catch {
      return null;
    }
    try {
      const o = parsearJson(raw);
      const guion = typeof o.guion === "string" ? o.guion.trim() : "";
      if (!guion) return null;
      const formato = typeof o.formato === "string" ? o.formato.trim().slice(0, 40) : "";
      return { formato, guion, generadoEn: new Date().toISOString() };
    } catch {
      // Si no vino JSON válido pero sí texto, úsalo como guión directo.
      const t = raw.trim();
      return t ? { formato: "", guion: t, generadoEn: new Date().toISOString() } : null;
    }
  }

  let guionEmbudo = await intento();
  if (!guionEmbudo)
    guionEmbudo = await intento("devuelve SOLO el JSON {\"formato\":\"…\",\"guion\":\"…\"} con el guión completo listo para grabar.");
  if (!guionEmbudo)
    return NextResponse.json(
      { error: "La IA no produjo un guión válido. Reintenta." },
      { status: 502 },
    );

  return NextResponse.json({ guionEmbudo });
}
