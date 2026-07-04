import { NextResponse } from "next/server";
import { AVATAR_SECCIONES, type Producto } from "@plataforma/products";
import { investigarConGemini } from "@/lib/ai/textProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  producto: Producto;
}

function construirPrompt(p: Producto): string {
  const preguntas = AVATAR_SECCIONES.map(
    (s) => `- "${s.key}": ${s.pregunta}`,
  ).join("\n");

  return `Eres un investigador de mercado y estratega de marketing directo. Vas a INVESTIGAR EN LA WEB (foros, redes, YouTube, blogs, lo que la gente pregunta y comenta) al público objetivo de este producto, y luego responder como experto.

PRODUCTO:
- Nombre: ${p.nombre}
- Promesa: ${p.identidad.promesa}
- Posicionamiento: ${p.identidad.posicionamiento}
- Dirigido a: ${p.identidad.dirigidoA}

Investiga y responde CADA sección con profundidad, en español neutral, basándote en lo que encuentres de personas reales:
${preguntas}

Devuelve SOLO un objeto JSON con esta forma exacta (sin texto adicional ni fences):
{ ${AVATAR_SECCIONES.map((s) => `"${s.key}": "<respuesta detallada>"`).join(", ")} }`;
}

function parsearJson(raw: string): Record<string, string> {
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
    return NextResponse.json({ error: "Falta el producto." }, { status: 400 });
  }

  let resultado;
  try {
    resultado = await investigarConGemini(construirPrompt(body.producto));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error en la investigación" },
      { status: 502 },
    );
  }

  let secciones: Record<string, string> = {};
  try {
    secciones = parsearJson(resultado.text);
  } catch {
    // si no vino JSON limpio, deja todo en la primera sección para no perderlo
    secciones = { compradores: resultado.text };
  }

  const avatar = {
    compradores: secciones.compradores ?? "",
    deseos: secciones.deseos ?? "",
    demografia: secciones.demografia ?? "",
    otras_soluciones: secciones.otras_soluciones ?? "",
    curiosidad: secciones.curiosidad ?? "",
    mecanismo_unico: secciones.mecanismo_unico ?? "",
    fuentes: resultado.fuentes,
  };

  return NextResponse.json({ avatar });
}
