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

USO OBLIGATORIO DE LA OFERTA:
- "mensaje_3" (¿qué recibes?) debe listar lo que incluye el PRODUCTO PRINCIPAL (los bullets de arriba), con checks ✅.
- "mensaje_4" debe presentar los BONOS (título + por qué suma), usando el framing del stack.
- "mensaje_6" puede apoyarse en la razón de urgencia.`;
}

function bloqueAngulos(angulos: Angulo[]): string {
  if (!angulos?.length) return "";
  const lista = angulos
    .map((a) => {
      const hk = (a.hooks ?? []).map((h) => h.texto).filter(Boolean);
      return `- ${a.tipo} «${a.nombre}»: ${a.gran_idea} (emoción: ${a.emocion_dominante}; dolor/deseo: ${a.dolor_o_deseo_atacado})${hk.length ? ` · ganchos: ${hk.join(" | ")}` : ""}`;
    })
    .join("\n");
  return `

ÁNGULOS (usa la VARIEDAD de los ${angulos.length} a lo largo del embudo; NO te quedes en uno solo — distintos mensajes se apoyan en distintos ángulos, y los ganchos inspiran el "mensaje_1"):
${lista}`;
}

function construirPrompt(
  p: Producto,
  ranuras: typeof RANURAS_MENSAJE,
): string {
  const listaRanuras = ranuras.map((r) => `- "${r.key}": ${r.descripcion}`).join("\n");
  const listaOverlays = TIPOS_IMAGEN.map((t) => `"${t}"`).join(", ");

  return `Eres un copywriter experto en embudos de venta por WhatsApp de respuesta directa, en ESPAÑOL NEUTRAL (sin modismos de ningún país).

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Posicionamiento: ${p.identidad.posicionamiento}
- Dirigido a: ${p.identidad.dirigidoA}${bloqueAvatar(p)}${bloqueAngulos(p.angulos ?? [])}${bloqueOferta(p)}

Redacta el contenido de cada RANURA del embudo: persuasivo, claro, cercano y orientado a la acción.

REGLAS CRÍTICAS:
- NO incluyas precios, links de pago, moneda ni datos que dependan del país como texto suelto.
- Donde harían falta esos datos, deja LITERAL el token del motor entre corchetes: [PRECIO_BASE], [PRECIO_TACHADO], [PRECIO_ADICIONAL_OB], [NUMERO_PAGO], [TITULAR_CUENTA]. NO los inventes ni cambies su forma.
- Español neutral, sin modismos.
- NEGRITAS: resalta SIEMPRE lo importante (la promesa, el beneficio clave, la urgencia, el precio) envolviéndolo entre asteriscos, así: *texto en negrita*. Es el formato de negrita de WhatsApp. Usa varias por mensaje, pero solo en lo que de verdad importa: si todo va en negrita, nada resalta.
- EMOJIS: úsalos con generosidad para que el mensaje entre por los ojos — al inicio de las líneas de lista, marcando cada beneficio (✅ 🎁 🔥 ⚡ 💰 ⏰ 👉) y donde refuercen la emoción. Que se vea vivo, sin llegar a parecer spam.
- FORMATO WHATSAPP: cada mensaje debe venir ORGANIZADO y con SALTOS DE LÍNEA reales (\\n) — párrafos cortos de 1-2 líneas, y donde ayude, listas con viñetas o checks ✅ en líneas separadas. Nada de un bloque de texto corrido.

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

  const prompt = construirPrompt(body.producto, ranuras);

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
