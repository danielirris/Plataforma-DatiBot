import { NextResponse } from "next/server";
import {
  RANURAS_MENSAJE,
  TIPOS_IMAGEN,
  type Angulo,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  producto: Producto;
  /** si viene, solo se regeneran estas ranuras (regenerar por campo) */
  soloRanuras?: string[];
  /** ángulo desde el que se encuadra el copy */
  angulo_id?: string;
}

function bloqueAvatar(p: Producto): string {
  const av = p.avatar;
  if (!av || !(av.compradores || av.deseos || av.demografia || av.mecanismo_unico))
    return "";
  return `

INVESTIGACIÓN DE AVATAR (para que el copy le hable a esta persona real):
- Quiénes compran: ${av.compradores}
- Deseos: ${av.deseos}
- Demografía/psicografía: ${av.demografia}
- Otras soluciones: ${av.otras_soluciones}
- Mecanismo único: ${av.mecanismo_unico}
- Objeciones de compra: ${JSON.stringify(av.objeciones_compra ?? [])}
- Objeciones de uso: ${JSON.stringify(av.objeciones_uso ?? [])}`;
}

function bloqueOferta(p: Producto): string {
  const o = p.oferta;
  if (!o) return "";
  const incluye = o.producto_principal.que_incluye.filter(Boolean).map((x) => `  · ${x}`).join("\n");
  const bonos = o.bonos
    .map((b) => `  · ${b.titulo}: ${b.descripcion_corta} (desactiva: "${b.objecion_que_desactiva}")`)
    .join("\n");
  return `

OFERTA (el paquete que se vende — ÚSALA tal cual en el copy):
- Nombre de la oferta: ${o.nombre_oferta}
- Promesa grande: ${o.promesa_grande}
- Producto principal "${o.producto_principal.titulo}" incluye:
${incluye}
- Bonos:
${bonos}
- Framing del stack: ${o.framing_del_stack}
- Razón de urgencia: ${o.razon_de_urgencia}
- Garantía: ${o.garantia_o_reversibilidad}

USO OBLIGATORIO DE LA OFERTA:
- "mensaje_3" (¿qué recibes?) debe listar lo que incluye el PRODUCTO PRINCIPAL (los bullets de arriba), con checks ✅.
- "mensaje_4" debe presentar los BONOS (título + por qué suma), usando el framing del stack.
- "mensaje_6" puede apoyarse en la razón de urgencia.`;
}

function bloqueAngulo(ang: Angulo | null): string {
  if (!ang) return "";
  const hooks = (ang.hooks ?? []).map((h) => `  · ${h.texto}`).join("\n");
  return `

ÁNGULO ELEGIDO (encuadra TODO el copy desde aquí):
- Tipo: ${ang.tipo} · ${ang.nombre}
- Promesa central: ${ang.promesa_central}
- Gran idea: ${ang.gran_idea}
- Emoción dominante: ${ang.emocion_dominante}
- Dolor/deseo atacado: ${ang.dolor_o_deseo_atacado}
${hooks ? `- Ganchos de este ángulo (inspira el "mensaje_1"):\n${hooks}` : ""}`;
}

function construirPrompt(
  p: Producto,
  ranuras: typeof RANURAS_MENSAJE,
  ang: Angulo | null,
): string {
  const listaRanuras = ranuras.map((r) => `- "${r.key}": ${r.descripcion}`).join("\n");
  const listaOverlays = TIPOS_IMAGEN.map((t) => `"${t}"`).join(", ");

  return `Eres un copywriter experto en embudos de venta por WhatsApp de respuesta directa, en ESPAÑOL NEUTRAL (sin modismos de ningún país).

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Posicionamiento: ${p.identidad.posicionamiento}
- Dirigido a: ${p.identidad.dirigidoA}${bloqueAvatar(p)}${bloqueAngulo(ang)}${bloqueOferta(p)}

Redacta el contenido de cada RANURA del embudo: persuasivo, claro, cercano y orientado a la acción, coherente con el ángulo y la oferta.

REGLAS CRÍTICAS:
- NO incluyas precios, links de pago, moneda ni datos que dependan del país como texto suelto.
- Donde harían falta esos datos, deja LITERAL el token del motor entre corchetes: [PRECIO_BASE], [PRECIO_TACHADO], [PRECIO_ADICIONAL_OB], [NUMERO_PAGO], [TITULAR_CUENTA]. NO los inventes ni cambies su forma.
- Español neutral, sin modismos. Emojis con moderación donde sumen.

RANURAS a redactar:
${listaRanuras}

Además redacta las líneas de texto CORTAS (overlay, máx ~6 palabras) para 5 creativos: ${listaOverlays}.

Devuelve SOLO un objeto JSON con esta forma exacta, sin texto adicional ni fences:
{ "mensajes": { "<ranura>": "<texto>", ... }, "overlays": { "contenido": "...", "bonos": "...", "bono_accion_rapida": "...", "remarketing_60": "...", "remarketing_180": "..." } }`;
}

function parsearJson(raw: string): { mensajes?: Record<string, string>; overlays?: Record<string, string> } {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body?.producto?.nombre) {
    return NextResponse.json({ error: "Falta el producto (nombre)." }, { status: 400 });
  }

  const ranuras = body.soloRanuras?.length
    ? RANURAS_MENSAJE.filter((r) => body.soloRanuras!.includes(r.key))
    : RANURAS_MENSAJE;

  const ang =
    (body.angulo_id && body.producto.angulos?.find((a) => a.id === body.angulo_id)) ||
    null;

  const prompt = construirPrompt(body.producto, ranuras, ang);

  let raw: string;
  try {
    raw = await generarTexto(prompt);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error del proveedor de IA" },
      { status: 502 },
    );
  }

  try {
    const parsed = parsearJson(raw);
    return NextResponse.json({
      mensajes: parsed.mensajes ?? {},
      overlays: parsed.overlays ?? {},
    });
  } catch {
    return NextResponse.json(
      { error: "La IA no devolvió JSON válido.", raw },
      { status: 502 },
    );
  }
}
