import { NextResponse } from "next/server";
import { listProducts, saveProduct, type Producto } from "@plataforma/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProducts());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Producto;
  const saved = await saveProduct(body);
  return NextResponse.json(saved);
}
