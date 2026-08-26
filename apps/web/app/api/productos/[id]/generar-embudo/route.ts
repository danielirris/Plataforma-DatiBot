import { NextResponse } from "next/server";
import { getProduct, bloqueQueVendemos, type Producto, type EmbudoWhatsApp } from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";
import { PAISES_EMBUDO, paisEmbudo, fmtMonto, RANURAS_EMBUDO } from "@/lib/embudo/paises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const CLAVES = RANURAS_EMBUDO.map((r) => r.key);

const SYSTEM_PROMPT = `Eres un copywriter experto en embudos COD de WhatsApp para LatAm. RELLENAS una estructura FIJA de 10 mensajes ya validada en producción; NO inventas la estructura.

MODELO (COD invertido / pago por confianza): la persona escribe por un anuncio → se le presenta el producto → se le pide LA PALABRA, no el dinero → se entrega TODO el material gratis por adelantado → recién después se muestra la escalera de niveles y los datos de pago → a los ~25 min un recordatorio. Consecuencias: NUNCA "compra/precio/oferta/checkout" antes de la entrega; la palabra correcta es "aporte / contribución consciente"; la conversión es por reciprocidad + culpa suave, no por escasez agresiva.

REGLAS DE FORMATO (obligatorias): negritas con UN solo asterisco (*así*), NUNCA doble. Respeta líneas en blanco entre párrafos. 1 emoji por línea/bullet, nunca 3 seguidos. Tuteo siempre. Sin jerga de marketing ("embudo","lead","CTA","cupos"). Sin promesas médicas ni de ingresos garantizados (habla de posibilidad). Sin links en los mensajes 1 a 4.

LOS 10 MENSAJES (claves EXACTAS): msg_bienvenida, msg_imagen_caption, msg_compromiso_1, msg_compromiso_2, msg_felicitacion, msg_cobro, msg_datos_pago, msg_bonos_intro, msg_bonos_outro, msg_recordatorio.

QUÉ VA EN CADA UNO:
- msg_bienvenida: "¡Hola! Soy [NOMBRE], [OFICIO] 👋[emoji nicho]" + espejo del deseo con 3 exclusiones (sin X, sin Y, sin Z) + "funciona aunque hoy [objeción] — yo empecé exactamente ahí".
- msg_imagen_caption: "💥 *ESTO ES LO QUE TE LLEVAS HOY* [emoji]" + 5-6 bullets ✅ (nombre en negrita : beneficio); los BONO marcados y de últimos. Cierra "*Todo digital y te llega aquí mismo por WhatsApp, en minutos.*".
- msg_compromiso_1: resultado con plazo corto + por qué es aplicable. TERMINA EXACTO con: 📩 Da clic en "Recibir material" y te lo envío ahora mismo.
- msg_compromiso_2 (el más importante): incluye las cadenas "transparente", "*Primero te envío TODO el material. Después tú decides.*", "*contar con tu palabra*" y termina en 📩 Si estás de acuerdo con este trato, toca en: "Quiero recibirlo" ✅. El aporte se justifica como ayuda a terceros.
- msg_felicitacion: "🎉 *¡Listo! Todo tu material ya está en tus manos.*" + primer micro-paso. NO menciona pago ni dinero.
- msg_cobro: la escalera de 7 niveles ACUMULATIVA (cada nivel "Todo lo anterior + *[bono]*"). Usa los MONTOS EXACTOS del país (abajo). Emojis de escalera: 💰 🎁 💅 ✨ 👁️ 💇 👑. Cierra con una línea de lógica ("Cada nivel que sumas es *un servicio más que puedes cobrar*") y "¡Gracias de corazón por valorar este trabajo! 🙏✨".
- msg_datos_pago: "*Datos para tu aporte:* 💛" + método(s) + 👉 *Número:* + 👉 *A nombre de:* + (RUT/cédula si aplica) + (Bre-B alias si aplica) + "Cuando pagues, mándame la *foto del comprobante*…" + termina invitando a copiar el número.
- msg_bonos_intro: "🎉 *¡GRACIAS POR TU APORTE!* 💛" + "esto es lo que desbloqueaste 👇".
- msg_bonos_outro: "📌 Guarda todos los links…" + recordatorio de la lógica de valor + cierre cálido.
- msg_recordatorio (+25 min): cálido, cero amenaza. PROHIBIDO: "última oportunidad", "retirar", "si no pagas", mayúsculas sostenidas, contadores.

SALIDA: devuelve EXCLUSIVAMENTE un JSON con las 10 claves y su texto (saltos de línea como \\n, negritas con un asterisco). Nada fuera del JSON.`;

function bloqueProducto(p: Producto): string {
  const o = p.oferta;
  const pp = o?.producto_principal;
  const incluye = (pp?.que_incluye ?? []).filter((x) => String(x).trim());
  const refs = (p.anunciosReferencia ?? [])
    .filter((a) => a.guion?.trim())
    .map((a) => `- (${a.nicho || "ref"}) ${a.titulo}: ${a.guion.slice(0, 500)}`)
    .join("\n");
  return `PRODUCTO: ${p.nombre} | Promesa: ${p.identidad.promesa} | Público: ${p.identidad.dirigidoA}
OFERTA: ${o?.promesa_grande ?? ""}
Producto principal: ${pp?.titulo ?? p.nombre}${incluye.length ? ` — incluye: ${incluye.join("; ")}` : ""}
AVATAR (dedúcelo de estos anuncios ganadores, avatar similar):
${refs || "(sin anuncios de referencia)"}${bloqueQueVendemos(p)}`;
}

function bloquePais(p: Producto, codigo: string): string {
  const pais = paisEmbudo(codigo);
  if (!pais) return "";
  const emb = p.embudo as EmbudoWhatsApp | null;
  const v = emb?.vendedor;
  const orderbumps = emb?.orderbumps ?? [];

  // Escalera: nivel 1 = base + Certificado; niveles 2..7 = + cada orderbump.
  const escalera = pais.montos
    .map((monto, i) => {
      const nivel = i + 1;
      if (nivel === 1)
        return `Nivel 1 — ${pais.simbolo}${fmtMonto(monto)} ${pais.moneda}: producto base + *Certificado*.`;
      const ob = orderbumps.find((o) => o.nivel === nivel);
      return `Nivel ${nivel} — ${pais.simbolo}${fmtMonto(monto)} ${pais.moneda}: Todo lo anterior + *${ob?.nombre_bono || "(bono)"}*${ob?.descripcion ? ` (${ob.descripcion})` : ""}.`;
    })
    .join("\n");

  const pago = [
    `- Método(s): ${pais.metodos}`,
    `- Número/cuenta: ${pais.cuenta}`,
    `- A nombre de: ${pais.titularCorto} (titular completo: ${pais.titular})`,
    pais.identificacion ? `- Identificación OBLIGATORIA: ${pais.identificacion}` : "",
    pais.alias ? `- Bre-B (alias): ${pais.alias}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `--- PAÍS: ${pais.nombre} (${pais.codigo}) ---
VENDEDOR: ${v?.nombre || "(elige un nombre acorde al género del avatar)"} · ${v?.oficio || ""} · género ${v?.genero || "F"}.
Léxico regional que DEBES usar: ${pais.lexico.join(", ")}.

ESCALERA para msg_cobro (montos EXACTOS, no los cambies):
${escalera}

DATOS DE PAGO para msg_datos_pago:
${pago}

${bloqueProducto(p)}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

async function generarPais(p: Producto, codigo: string): Promise<Record<string, string> | null> {
  const prompt = `${SYSTEM_PROMPT}\n\n${bloquePais(p, codigo)}`;
  for (let intento = 0; intento < 2; intento++) {
    let raw: string;
    try {
      raw = await generarTexto(intento === 0 ? prompt : `${prompt}\n\nIMPORTANTE: devuelve SOLO el JSON con las 10 claves exactas y ningún texto extra.`);
    } catch {
      continue;
    }
    try {
      const o = parsearJson(raw);
      const out: Record<string, string> = {};
      for (const k of CLAVES) {
        const v = o[k];
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
      }
      if (Object.keys(out).length >= 8) return out; // toleramos que falten 1-2 y se regeneran a mano
    } catch {
      /* reintenta */
    }
  }
  return null;
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; paises?: string[] } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const codigos = (body.paises && body.paises.length
    ? body.paises
    : PAISES_EMBUDO.map((x) => x.codigo)
  ).filter((c) => paisEmbudo(c));

  const resultados = await Promise.all(
    codigos.map(async (c) => [c, await generarPais(producto, c)] as const),
  );

  const mensajesPorPais: Record<string, Record<string, string>> = {};
  const fallidos: string[] = [];
  for (const [c, msgs] of resultados) {
    if (msgs) mensajesPorPais[c] = msgs;
    else fallidos.push(c);
  }

  if (!Object.keys(mensajesPorPais).length)
    return NextResponse.json(
      { error: "La IA no produjo mensajes válidos. Reintenta." },
      { status: 502 },
    );

  return NextResponse.json({ mensajesPorPais, fallidos });
}
