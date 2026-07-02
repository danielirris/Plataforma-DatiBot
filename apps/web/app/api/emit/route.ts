import { NextResponse } from "next/server";
import { getProduct, saveProduct } from "@plataforma/products";
import { readConfig } from "@plataforma/config";
import { emitir, type TipoEmbudo } from "@/lib/flujos/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  productoId: string;
  pais: string;
  tipo: TipoEmbudo;
  usarOrderbump: boolean;
  /** si true, registra la emisión en el historial del producto */
  registrarHistorial?: boolean;
  fecha?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const producto = await getProduct(body.productoId);
  if (!producto) {
    return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  const store = await readConfig();
  const countryConfig = store[`flujos_${body.pais.toLowerCase()}`] ?? {};
  const generalConfig = store["flujos_general"] ?? {};

  let resultado;
  try {
    resultado = emitir({
      producto,
      pais: body.pais,
      tipo: body.tipo,
      usarOrderbump: !!body.usarOrderbump,
      countryConfig,
      generalConfig,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al emitir" },
      { status: 500 },
    );
  }

  // Registro ligero de emisión (opcional, sin duplicar contenido).
  if (body.registrarHistorial) {
    producto.historialEmisiones = [
      ...(producto.historialEmisiones ?? []),
      { pais: body.pais, fecha: body.fecha ?? new Date().toISOString() },
    ];
    await saveProduct(producto);
  }

  return NextResponse.json({
    workflow: resultado.workflow,
    ok: resultado.ok,
    warnings: resultado.warnings,
    unresolved: resultado.unresolved,
    secretsMissing: resultado.secretsMissing,
    sinConfigPais: Object.keys(countryConfig).length === 0,
  });
}
