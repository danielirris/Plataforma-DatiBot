import { NextResponse } from "next/server";
import { listProducts, saveProduct, type Producto } from "@plataforma/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const productos = await listProducts();
  // ?slim=1: proyección ligera para los desplegables/selectores que solo pintan
  // id+nombre (evita serializar el producto entero, que pesa cientos de KB por el ebook).
  if (new URL(req.url).searchParams.get("slim") === "1") {
    return NextResponse.json(
      productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        productoId: p.productoId,
        actualizadoEn: p.actualizadoEn,
      })),
    );
  }
  return NextResponse.json(productos);
}

export async function POST(req: Request) {
  let body: Producto;
  try {
    body = (await req.json()) as Producto;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  try {
    const saved = await saveProduct(body);
    return NextResponse.json(saved);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo crear el producto." },
      { status: 500 },
    );
  }
}
