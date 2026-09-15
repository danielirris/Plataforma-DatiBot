import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function limpiar(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

// GET: cómodo para un enlace "Salir" → borra la cookie y manda al login.
export async function GET(req: Request) {
  return limpiar(NextResponse.redirect(new URL("/login", req.url)));
}

export async function POST() {
  return limpiar(NextResponse.json({ ok: true }));
}
