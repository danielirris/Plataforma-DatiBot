import { NextResponse } from "next/server";
import { leerVpsConfig, faltantesVps, eliminarImagen } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Borra una imagen generada del VPS (por si el usuario no la quiere).
export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: "Falta la url." }, { status: 400 });

  const vps = await leerVpsConfig();
  const faltan = faltantesVps(vps);
  if (faltan.length) {
    return NextResponse.json(
      { error: "Faltan datos del VPS en Configuración: " + faltan.join(", ") },
      { status: 502 },
    );
  }

  try {
    await eliminarImagen(url, vps);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo eliminar" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
