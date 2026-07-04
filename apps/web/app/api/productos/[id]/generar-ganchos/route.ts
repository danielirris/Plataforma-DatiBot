import { NextResponse } from "next/server";
import {
  MECANISMOS_GANCHO,
  NUM_GANCHOS,
  getProduct,
  type Angulo,
  type Gancho,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";
import { seleccionarSemillas, type PlantillaGancho } from "@/lib/ai/ganchosBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Mapa tipo de ángulo → mecanismo preferido del banco de ganchos.
const MAPA_TIPO_MECANISMO: Record<string, string> = {
  DOLOR_AGUDO: "DOLOR_PROBLEMA",
  RESULTADO_SOÑADO: "TRANSFORMACION_ANTES_DESPUES",
  MIEDO_OCULTO: "ADVERTENCIA_MIEDO",
  AUTORIDAD_RESPALDO: "AUTORIDAD_CREDENCIAL",
  PRUEBA_SOCIAL: "PRUEBA_SOCIAL",
  CONSPIRACION_SECRETO: "CURIOSIDAD_SECRETO",
  MECANISMO_UNICO: "NOVEDAD_HACK",
  CONTRA_SOLUCIONES_FALLIDAS: "CONTROVERSIA_OPINION",
  IDENTIDAD_ASPIRACION: "RELATABILIDAD_IDENTIFICACION",
  ATAJO_HACK: "NOVEDAD_HACK",
  VERGUENZA_SOCIAL: "ADVERTENCIA_MIEDO",
  URGENCIA_VENTANA: "URGENCIA_FOMO",
};

const SYSTEM_PROMPT = `Eres un copywriter senior de anuncios de respuesta directa en Latinoamérica. Tu trabajo es escribir GANCHOS DE ANUNCIO: los 2 primeros segundos de un video corto (TikTok, Reel, story) o el titular de una imagen publicitaria. Si el gancho no engancha en 2 segundos, se pierde el clic.

TU TAREA

Genera EXACTAMENTE ${NUM_GANCHOS} ganchos, distintos entre sí, adaptados a este ángulo y a este producto/avatar.

REGLAS

- Máximo 20 palabras por gancho. Corto es mejor.
- Español neutral. Prohibido: "wey", "chévere", "bacano", "vale", "chido", "mole", "guay", "pana", "flipa", "chamba", "laburo", "che", etc. Si dudas si una palabra es regional, cámbiala.
- Concreto, no genérico. "Vas a ver resultados" es basura. "En 14 días tus dientes se ven 2 tonos más claros" ancla.
- Prohibido inventar cifras específicas si no las tienes en los insumos. Si necesitas cuantificar, usa rangos plausibles del sector o construcciones vagas ("varios estudios", "muchas mujeres reportan").
- Prohibido mencionar precios, moneda, marcas de la competencia con nombre real, o links.
- Prohibido usar signos de exclamación en cadena ("!!!") ni MAYÚSCULAS gritonas. Máximo 1 signo de exclamación por gancho, y solo si tiene sentido.
- Emojis con moderación: máximo 1 por gancho, o ninguno.
- Los ${NUM_GANCHOS} ganchos NO deben ser variaciones tímidas del mismo. Cada uno debe apretar un botón mental distinto — pero todos coherentes con el ángulo dado.
- INSPÍRATE en las plantillas semilla pero NO copies mecánicamente. Adapta al producto. Puedes traducir del inglés al español neutral, combinar dos plantillas, cambiar la estructura, o ignorar plantillas que no encajen. El objetivo es que suene humano y hecho para este producto.
- Cada gancho debe ser AUTÓNOMO: se entiende sin contexto previo.

FORMATO DE SALIDA

Devuelve un JSON con esta forma exacta:
{
  "hooks": [
    { "texto": "...", "mecanismo": "DOLOR_PROBLEMA", "plantilla_origen": "...", "por_que_funciona": "..." },
    { ... },
    { ... }
  ]
}

Nada fuera del JSON. Sin markdown, sin comentarios, sin explicaciones.`;

function insumos(p: Producto, ang: Angulo, semillas: PlantillaGancho[]): string {
  const a = p.avatar;
  const plantillas = semillas
    .map((s) => `- [${s.mecanismo}] ${s.plantilla}  (ej: ${s.ejemplo})`)
    .join("\n");
  return `--- INSUMOS ---
Producto: ${p.nombre} | Promesa: ${p.identidad.promesa} | Posicionamiento: ${p.identidad.posicionamiento} | Público: ${p.identidad.dirigidoA}

Avatar:
- quiénes compran: ${a?.compradores ?? ""}
- deseos: ${a?.deseos ?? ""}
- objeciones de compra: ${JSON.stringify(a?.objeciones_compra ?? [])}
- objeciones de uso: ${JSON.stringify(a?.objeciones_uso ?? [])}

ÁNGULO ESPECÍFICO:
- tipo: ${ang.tipo}
- nombre: ${ang.nombre}
- promesa_central: ${ang.promesa_central}
- gran_idea: ${ang.gran_idea}
- público objetivo del ángulo: ${ang.publico_objetivo_del_angulo}
- emoción dominante: ${ang.emocion_dominante}
- dolor o deseo atacado: ${ang.dolor_o_deseo_atacado}
- prueba o evidencia: ${ang.prueba_o_evidencia}

20 PLANTILLAS SEMILLA (banco de ganchos virales; inspiración, no copiar):
${plantillas}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

function palabras(t: string): number {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

function validar(
  sec: Record<string, unknown>,
  mecPref: string,
): { hooks?: Gancho[]; error?: string } {
  const arr = sec.hooks;
  if (!Array.isArray(arr)) return { error: "no vino el array 'hooks'" };
  if (arr.length !== NUM_GANCHOS)
    return { error: `se esperaban ${NUM_GANCHOS} ganchos y vinieron ${arr.length}` };
  const hooks: Gancho[] = [];
  for (let k = 0; k < arr.length; k++) {
    const h = (arr[k] ?? {}) as Record<string, unknown>;
    const texto = String(h.texto ?? "").trim();
    if (!texto) return { error: `gancho ${k + 1} vacío` };
    if (palabras(texto) > 20)
      return { error: `gancho ${k + 1} supera 20 palabras` };
    const mecRaw = String(h.mecanismo ?? "");
    // coerción a un valor válido del enum (garantiza el criterio de aceptación)
    const mecanismo = (MECANISMOS_GANCHO as readonly string[]).includes(mecRaw)
      ? mecRaw
      : mecPref;
    hooks.push({
      texto,
      mecanismo: mecanismo as Gancho["mecanismo"],
      plantilla_origen: String(h.plantilla_origen ?? "") || undefined,
      por_que_funciona: String(h.por_que_funciona ?? ""),
    });
  }
  return { hooks };
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: { producto?: Producto; angulo_id?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre)
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const angulos = [...(producto.angulos ?? [])];
  if (angulos.length === 0)
    return NextResponse.json(
      { error: "El producto no tiene ángulos. Genera los 6 ángulos primero." },
      { status: 400 },
    );

  const objetivo = body.angulo_id
    ? angulos.filter((a) => a.id === body.angulo_id)
    : angulos;
  if (objetivo.length === 0)
    return NextResponse.json({ error: "angulo_id no existe." }, { status: 404 });

  const errores: Record<string, string> = {};
  let exitos = 0;

  for (const ang of objetivo) {
    const mecPref = MAPA_TIPO_MECANISMO[ang.tipo] ?? "GENERAL";
    const semillas = seleccionarSemillas(mecPref, 15, 5);
    const promptBase = `${SYSTEM_PROMPT}\n\n${insumos(producto, ang, semillas)}`;

    async function intento(nota = ""): Promise<{ hooks?: Gancho[]; error?: string }> {
      let raw: string;
      try {
        raw = await generarTexto(nota ? `${promptBase}\n\nIMPORTANTE: ${nota}` : promptBase);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Error del proveedor de IA" };
      }
      try {
        return validar(parsearJson(raw), mecPref);
      } catch {
        return { error: "la IA no devolvió JSON válido" };
      }
    }

    let r = await intento();
    if (!r.hooks) {
      r = await intento(`${r.error}. Devuelve EXACTAMENTE ${NUM_GANCHOS} ganchos, máximo 20 palabras cada uno.`);
    }
    if (r.hooks) {
      const idx = angulos.findIndex((a) => a.id === ang.id);
      if (idx >= 0) angulos[idx] = { ...angulos[idx], hooks: r.hooks };
      exitos++;
    } else {
      errores[ang.id] = r.error ?? "falló";
    }
  }

  if (exitos === 0) {
    return NextResponse.json(
      { error: `No se generaron ganchos: ${Object.values(errores)[0] ?? "error"}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ angulos, errores });
}
