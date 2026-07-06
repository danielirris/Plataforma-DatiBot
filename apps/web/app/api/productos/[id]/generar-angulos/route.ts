import { NextResponse } from "next/server";
import {
  TIPOS_ANGULO,
  NUM_ANGULOS,
  getProduct,
  type Angulo,
  type Producto,
} from "@plataforma/products";
import { generarTexto } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const SYSTEM_PROMPT = `Eres un estratega senior de marketing de respuesta directa especializado en Latinoamérica. Tu trabajo es decidir DESDE QUÉ ÁNGULOS se le va a vender este producto al mercado.

Un ángulo NO es una feature. Es una entrada emocional al deseo o dolor del cliente. El mismo producto se vende distinto según el ángulo, y cada ángulo produce anuncios muy distintos.

TU TAREA

Elige EXACTAMENTE 6 ángulos publicitarios distintos, mutuamente diferenciados. Cada uno debe atacar un vector psicológico distinto — no puedes elegir 6 ángulos que se parezcan.

Elige los 6 mejores de este catálogo, según lo que más resuene con este producto y este avatar. No es obligatorio usar los 6 primeros; elige por relevancia:

1. DOLOR_AGUDO — el dolor concreto que atormenta hoy
2. RESULTADO_SOÑADO — la transformación deseada
3. MIEDO_OCULTO — lo que va a empeorar si no actúan
4. AUTORIDAD_RESPALDO — respaldo científico, experto, credencial
5. PRUEBA_SOCIAL — otros como tú ya lo lograron
6. CONSPIRACION_SECRETO — lo que la industria/mainstream no cuenta
7. MECANISMO_UNICO — el "cómo" novedoso que hace diferente al producto
8. CONTRA_SOLUCIONES_FALLIDAS — "por eso lo que probaste antes no funcionó"
9. IDENTIDAD_ASPIRACION — "eres el tipo de persona que..."
10. ATAJO_HACK — el atajo, el hack, ahorro de tiempo/esfuerzo
11. VERGUENZA_SOCIAL — lo que otros pensarán / cómo no quedar mal
12. URGENCIA_VENTANA — la ventana de oportunidad que se cierra
13. NEGOCIO_EMPRENDER — emprender / ganar dinero con esto (revenderlo, negocio desde casa, ingreso extra)

REGLAS ESTRICTAS

- OBLIGATORIO: uno de los 6 ángulos debe ser SIEMPRE de tipo "NEGOCIO_EMPRENDER", con el tono de emprender y ganar dinero con este producto (revenderlo, montar un negocio desde casa, generar un ingreso extra). Los otros 5, los mejores del catálogo por relevancia.

- Español neutral. Nada de modismos de país específico. El copy se usa en PE/CL/CO/EC/MX/VE.
- NO menciones precios, moneda, ni links. Nada de "$", "S/", "COP", "MXN".
- No inventes datos, estudios ni testimonios específicos. Si mencionas prueba, di "según estudios" o "según testimonios reales" sin fabricar cifras.
- Cada ángulo debe tener PROMESA_CENTRAL distinta. No 6 versiones de "vas a estar más sano".
- GRAN_IDEA debe ser una frase memorable, no un párrafo académico. Debe caber en un titular de anuncio.
- PRUEBA_O_EVIDENCIA: qué usarías tú para respaldarlo — dato, tipo de testimonio, referencia al mecanismo, etc. Sé concreto en el tipo de prueba, no en el contenido inventado.

FORMATO DE SALIDA

Devuelve un JSON con esta forma exacta:

{
  "angulos": [
    { "id": "dolor_agudo", "nombre": "Dolor agudo", "tipo": "DOLOR_AGUDO", "promesa_central": "...", "gran_idea": "...", "publico_objetivo_del_angulo": "...", "emocion_dominante": "...", "dolor_o_deseo_atacado": "...", "prueba_o_evidencia": "...", "hooks": [] },
    ... 5 objetos más
  ]
}

Nada fuera del JSON. Sin markdown, sin comentarios, sin explicaciones.`;

function insumos(p: Producto): string {
  const a = p.avatar;
  return `--- INSUMOS ---
Producto:
- nombre: ${p.nombre}
- promesa: ${p.identidad.promesa}
- posicionamiento: ${p.identidad.posicionamiento}
- a quién va dirigido: ${p.identidad.dirigidoA}

Avatar (ya investigado):
- quiénes compran: ${a?.compradores ?? ""}
- deseos profundos: ${a?.deseos ?? ""}
- demografía y psicografía: ${a?.demografia ?? ""}
- otras soluciones existentes: ${a?.otras_soluciones ?? ""}
- curiosidad y autoridad: ${a?.curiosidad ?? ""}
- mecanismo único: ${a?.mecanismo_unico ?? ""}
- objeciones de compra: ${JSON.stringify(a?.objeciones_compra ?? [])}
- objeciones de uso: ${JSON.stringify(a?.objeciones_uso ?? [])}`;
}

function parsearJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

const CAMPOS: (keyof Angulo)[] = [
  "id",
  "nombre",
  "tipo",
  "promesa_central",
  "gran_idea",
  "publico_objetivo_del_angulo",
  "emocion_dominante",
  "dolor_o_deseo_atacado",
  "prueba_o_evidencia",
];

/** Devuelve los 6 ángulos válidos o un mensaje de por qué falló. */
function validar(sec: Record<string, unknown>): { angulos?: Angulo[]; error?: string } {
  const arr = sec.angulos;
  if (!Array.isArray(arr)) return { error: "no vino el array 'angulos'" };
  if (arr.length !== NUM_ANGULOS)
    return { error: `se esperaban ${NUM_ANGULOS} ángulos y vinieron ${arr.length}` };

  const angulos: Angulo[] = [];
  for (let k = 0; k < arr.length; k++) {
    const o = (arr[k] ?? {}) as Record<string, unknown>;
    for (const c of CAMPOS) {
      if (typeof o[c] !== "string" || String(o[c]).trim() === "")
        return { error: `ángulo ${k + 1}: falta o vacío el campo "${c}"` };
    }
    if (!(TIPOS_ANGULO as readonly string[]).includes(String(o.tipo)))
      return { error: `ángulo ${k + 1}: tipo inválido "${o.tipo}"` };
    angulos.push({
      id: String(o.id),
      nombre: String(o.nombre),
      tipo: String(o.tipo) as Angulo["tipo"],
      promesa_central: String(o.promesa_central),
      gran_idea: String(o.gran_idea),
      publico_objetivo_del_angulo: String(o.publico_objetivo_del_angulo),
      emocion_dominante: String(o.emocion_dominante),
      dolor_o_deseo_atacado: String(o.dolor_o_deseo_atacado),
      prueba_o_evidencia: String(o.prueba_o_evidencia),
      hooks: [], // siempre vacío por ahora
    });
  }
  return { angulos };
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  // Permite override del producto en el body (para usar ediciones sin guardar).
  let body: { producto?: Producto } = {};
  try {
    body = (await req.json()) as { producto?: Producto };
  } catch {
    /* body opcional */
  }
  const producto = body?.producto ?? (await getProduct(id));
  if (!producto?.nombre) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  async function intento(notaRetry = ""): Promise<{ angulos?: Angulo[]; error?: string }> {
    const prompt = `${SYSTEM_PROMPT}\n\n${insumos(producto!)}${notaRetry ? `\n\nIMPORTANTE: ${notaRetry}` : ""}`;
    let raw: string;
    try {
      raw = await generarTexto(prompt);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Error del proveedor de IA" };
    }
    let sec: Record<string, unknown>;
    try {
      sec = parsearJson(raw);
    } catch {
      return { error: "la IA no devolvió JSON válido" };
    }
    return validar(sec);
  }

  let r = await intento();
  if (r.error && !r.angulos) {
    // un único retry nombrando el problema
    r = await intento(
      `${r.error}. Devuelve EXACTAMENTE ${NUM_ANGULOS} ángulos, todos los campos completos, "tipo" del catálogo y "hooks": [].`,
    );
  }
  if (!r.angulos) {
    return NextResponse.json(
      { error: `La IA no produjo 6 ángulos válidos (tras 1 reintento): ${r.error}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ angulos: r.angulos });
}
