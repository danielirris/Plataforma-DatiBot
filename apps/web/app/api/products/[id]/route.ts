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
  const body = (await req.json()) as Producto;
  const saved = await saveProduct({ ...body, id });
  return NextResponse.json(saved);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await deleteProduct(id);
  return NextResponse.json({ ok: true });
}
