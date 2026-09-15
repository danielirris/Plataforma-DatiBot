import { NextResponse } from "next/server";
import { crearSesion, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comparación en tiempo ~constante. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function POST(req: Request) {
  const user = process.env.APP_AUTH_USER || "";
  const pass = process.env.APP_AUTH_PASSWORD || "";
  const secreto = process.env.SESSION_SECRET || pass;
  if (!user || !pass)
    return NextResponse.json(
      { error: "El login no está configurado en el servidor (faltan APP_AUTH_USER/APP_AUTH_PASSWORD)." },
      { status: 503 },
    );

  let body: { usuario?: string; password?: string } = {};
  try {
    body = ((await req.json()) as typeof body) ?? {};
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  // Se comprueban SIEMPRE las dos (sin cortocircuito) para no filtrar cuál falló.
  const okUser = iguales(String(body.usuario ?? ""), user);
  const okPass = iguales(String(body.password ?? ""), pass);
  if (!(okUser && okPass))
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await crearSesion(secreto), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
