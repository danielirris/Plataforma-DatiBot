import { NextResponse } from "next/server";
import { RANURAS_MENSAJE, TIPOS_IMAGEN, type Producto } from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  producto: Producto;
  /** si viene, solo se regeneran estas ranuras (regenerar por campo) */
  soloRanuras?: string[];
}

function construirPrompt(p: Producto, ranuras: typeof RANURAS_MENSAJE): string {
  const listaRanuras = ranuras
    .map((r) => `- "${r.key}": ${r.descripcion}`)
    .join("\n");
  const listaOverlays = TIPOS_IMAGEN.map((t) => `"${t}"`).join(", ");

  return `Eres un copywriter experto en embudos de venta por WhatsApp de respuesta directa, en ESPAÑOL NEUTRAL (sin modismos de ningún país).

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Posicionamiento: ${p.identidad.posicionamiento}
- Dirigido a: ${p.identidad.dirigidoA}

Redacta el contenido de cada RANURA del embudo: persuasivo, claro, cercano y orientado a la acción, adaptado al producto.

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
  // quitar fences ```json ... ```
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // si hay texto alrededor, tomar del primer { al último }
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
    return NextResponse.json(
      { error: "Falta el producto (nombre)." },
      { status: 400 },
    );
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
