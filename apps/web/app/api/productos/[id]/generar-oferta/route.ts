import { NextResponse } from "next/server";
import {
  MIN_BONOS,
  MAX_BONOS,
  getProduct,
  type BonoOferta,
  type Oferta,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const SYSTEM_PROMPT = `Eres un estratega de ofertas de respuesta directa (estilo Alex Hormozi, "Grand Slam Offer") especializado en el mercado latinoamericano. Tu trabajo es diseñar el PAQUETE DE VENTA que se le va a presentar al cliente por WhatsApp: un producto principal + 3 o 4 bonos que empujen la balanza a "compro sí o sí".

TU TAREA

1. PRODUCTO PRINCIPAL: el producto mismo, "vestido" para el embudo. Titúlalo de modo que el nombre venda solo. Detalla qué incluye en 3-6 bullets concretos (no genéricos; usa lo que el producto realmente entrega). Declara un valor percibido en TEXTO comparativo, no en dinero.

2. STACK DE 3 O 4 BONOS. Cada bono:
   - Desactiva una OBJECIÓN CONCRETA del avatar (cítala tal como está en objeciones_compra u objeciones_uso, no la reformules).
   - Fácil de entregar por WhatsApp (PDF, video, checklist, plantilla, mini-curso, ticket de acceso). Evita bonos físicos con envío extra salvo que el producto ya viaje.
   - No canibaliza el producto principal.
   - Nombre memorable ("Manual anti-recaída: los 7 errores que te devuelven al punto cero", no "Bono de bienvenida").

Arquetipos que funcionan en LATAM: kit de arranque en 7 días; plantilla/lista de compras o de qué evitar; solucionador de dudas frecuentes; acceso a canal privado (si existe); guía express para la pareja/familia.

3. FRAMING DEL STACK: 1-2 frases que se usan literalmente en el mensaje del embudo. Explica por qué el conjunto vale mucho más que la suma de las partes.

4. RAZÓN DE URGENCIA: por qué comprar HOY es distinto a mañana. NO uses fechas ni cifras concretas; construcción general que el país adapta.

5. GARANTÍA O REVERSIBILIDAD: qué protege al cliente (política de MARCA, no de país).

REGLAS ESTRICTAS

- Español neutral. Sin modismos. Funciona igual en Lima, Santiago, Bogotá, Quito, CDMX y Caracas.
- NO menciones cifras monetarias, moneda, ni links. Si anclas precio, usa los tokens literales [PRECIO_BASE], [PRECIO_TACHADO], [PRECIO_ADICIONAL_OB] (el motor los rellena por país).
- Los bonos deben ser plausibles con lo que la marca puede entregar. No inventes cursos, consultorías 1-a-1 o comunidades que no existan. Si es dropshipping físico con poco backend, los bonos deben ser digitales simples (PDF, video, checklist) o ampliaciones del mismo producto.
- Entre 3 y 4 bonos (no 2, no 5).

FORMATO DE SALIDA

Devuelve un JSON con esta forma exacta:
{
  "oferta": {
    "nombre_oferta": "...",
    "promesa_grande": "...",
    "producto_principal": { "titulo": "...", "descripcion_corta": "...", "que_incluye": ["...","..."], "valor_percibido_texto": "..." },
    "bonos": [ { "titulo": "...", "descripcion_corta": "...", "por_que_lo_incluyo": "...", "objecion_que_desactiva": "...", "valor_percibido_texto": "..." } ],
    "framing_del_stack": "...",
    "razon_de_urgencia": "...",
    "garantia_o_reversibilidad": "..."
  }
}

Nada fuera del JSON. Sin markdown, sin comentarios, sin explicaciones.`;

function insumos(p: Producto): string {
  const a = p.avatar;
  const ang = (p.angulos ?? [])
    .map((x) => `- ${x.tipo} · ${x.nombre}: ${x.gran_idea}`)
    .join("\n");
  return `--- INSUMOS ---
Producto: ${p.nombre} | Promesa: ${p.identidad.promesa} | Posicionamiento: ${p.identidad.posicionamiento} | Público: ${p.identidad.dirigidoA}

Avatar:
- quiénes compran: ${a?.compradores ?? ""}
- deseos: ${a?.deseos ?? ""}
- mecanismo único: ${a?.mecanismo_unico ?? ""}
- objeciones_compra: ${JSON.stringify(a?.objeciones_compra ?? [])}
- objeciones_uso: ${JSON.stringify(a?.objeciones_uso ?? [])}

Ángulos:
${ang}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

// Cifras monetarias sueltas: símbolos/códigos de moneda fuera de los tokens [PRECIO_*].
const MONEY_RE = /[$€]|S\/|\b(?:USD|COP|CLP|MXN|PEN|ARS)\b/i;
function tieneCifrasSueltas(oferta: unknown): boolean {
  const sinTokens = JSON.stringify(oferta).replace(/\[PRECIO_[A-Z_]*\]/g, "");
  return MONEY_RE.test(sinTokens);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function validar(sec: Record<string, unknown>): { oferta?: Oferta; error?: string } {
  const o = sec.oferta as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return { error: "no vino el objeto 'oferta'" };

  for (const c of ["nombre_oferta", "promesa_grande", "framing_del_stack", "razon_de_urgencia", "garantia_o_reversibilidad"]) {
    if (!str(o[c])) return { error: `falta o vacío "${c}"` };
  }
  const pp = o.producto_principal as Record<string, unknown> | undefined;
  if (!pp || !str(pp.titulo) || !str(pp.descripcion_corta) || !str(pp.valor_percibido_texto))
    return { error: "producto_principal incompleto" };
  const inc = Array.isArray(pp.que_incluye)
    ? pp.que_incluye.map(str).filter(Boolean)
    : [];
  if (inc.length === 0) return { error: "producto_principal.que_incluye vacío" };

  const bonosRaw = Array.isArray(o.bonos) ? o.bonos : [];
  if (bonosRaw.length < MIN_BONOS || bonosRaw.length > MAX_BONOS)
    return { error: `se esperaban ${MIN_BONOS}-${MAX_BONOS} bonos y vinieron ${bonosRaw.length}` };
  const bonos: BonoOferta[] = [];
  for (let k = 0; k < bonosRaw.length; k++) {
    const b = (bonosRaw[k] ?? {}) as Record<string, unknown>;
    for (const c of ["titulo", "descripcion_corta", "por_que_lo_incluyo", "objecion_que_desactiva", "valor_percibido_texto"]) {
      if (!str(b[c])) return { error: `bono ${k + 1}: falta o vacío "${c}"` };
    }
    bonos.push({
      titulo: str(b.titulo),
      descripcion_corta: str(b.descripcion_corta),
      por_que_lo_incluyo: str(b.por_que_lo_incluyo),
      objecion_que_desactiva: str(b.objecion_que_desactiva),
      valor_percibido_texto: str(b.valor_percibido_texto),
    });
  }

  const oferta: Oferta = {
    nombre_oferta: str(o.nombre_oferta),
    promesa_grande: str(o.promesa_grande),
    producto_principal: {
      titulo: str(pp.titulo),
      descripcion_corta: str(pp.descripcion_corta),
      que_incluye: inc,
      valor_percibido_texto: str(pp.valor_percibido_texto),
    },
    bonos,
    framing_del_stack: str(o.framing_del_stack),
    razon_de_urgencia: str(o.razon_de_urgencia),
    garantia_o_reversibilidad: str(o.garantia_o_reversibilidad),
  };

  if (tieneCifrasSueltas(oferta))
    return { error: "hay cifras monetarias sueltas; usa solo los tokens [PRECIO_BASE]/[PRECIO_TACHADO]/[PRECIO_ADICIONAL_OB]" };

  return { oferta };
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

  const promptBase = `${SYSTEM_PROMPT}\n\n${insumos(producto)}`;

  async function intento(nota = ""): Promise<{ oferta?: Oferta; error?: string }> {
    let raw: string;
    try {
      raw = await generarTexto(nota ? `${promptBase}\n\nIMPORTANTE: ${nota}` : promptBase);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Error del proveedor de IA" };
    }
    try {
      return validar(parsearJson(raw));
    } catch {
      return { error: "la IA no devolvió JSON válido" };
    }
  }

  let r = await intento();
  if (!r.oferta) {
    r = await intento(`${r.error}. Corrige y devuelve la oferta con ${MIN_BONOS}-${MAX_BONOS} bonos, todos los campos y SIN cifras monetarias (usa los tokens [PRECIO_*]).`);
  }
  if (!r.oferta) {
    return NextResponse.json(
      { error: `La IA no produjo una oferta válida (tras 1 reintento): ${r.error}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ oferta: r.oferta });
}
