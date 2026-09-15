import { NextResponse } from "next/server";
import {
  getProduct,
  saveProduct,
  deleteProduct,
  type Producto,
} from "@plataforma/products";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const p = await getProduct(id);
  if (!p) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  return NextResponse.json(p);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: Producto;
  try {
    body = (await req.json()) as Producto;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  try {
    // Concurrencia optimista: si el producto en disco cambió desde que el cliente lo
    // cargó (p. ej. se guardó el ebook en otra pestaña), NO lo pisamos → 409 para que
    // recargue. Evita el "last-write-wins" que borraba secciones enteras.
    const actual = await getProduct(id);
    if (
      actual &&
      body.actualizadoEn &&
      actual.actualizadoEn &&
      body.actualizadoEn !== actual.actualizadoEn
    ) {
      return NextResponse.json(
        {
          error:
            "El producto cambió en otra pestaña o sección (p. ej. el ebook). Recarga la página para traer esos cambios y vuelve a guardar.",
          conflict: true,
        },
        { status: 409 },
      );
    }
    const saved = await saveProduct({ ...body, id });
    return NextResponse.json(saved);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar el producto." },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteProduct(id);
  return NextResponse.json({ ok: true });
}
