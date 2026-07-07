import { NextResponse } from "next/server";
import { getProduct } from "@plataforma/products";
import { leerVpsConfig, faltantesVps, subirImagen } from "@/lib/vps/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// Sube UN video del producto al servidor de archivos y devuelve su referencia.
// El cliente sube de a uno (multipart) para no cargar varios en memoria.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  const vps = await leerVpsConfig();
  const faltan = faltantesVps(vps);
  if (faltan.length)
    return NextResponse.json(
      { error: "Falta configurar el servidor de archivos: " + faltan.join(", ") },
      { status: 502 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Subida inválida." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: "No llegó ningún archivo de video." }, { status: 400 });

  const producto = await getProduct(id).catch(() => null);
  const baseId = (producto?.productoId || id || "prod").replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const nombre = `vid-${baseId}-${Date.now()}-${Math.floor(file.size % 100000)}.${ext}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await subirImagen(buf, nombre, vps);
    return NextResponse.json({
      video: { url, nombre, original: file.name, bytes: buf.length },
    });
  } catch (e) {
    console.error("[videos] fallo:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo subir el video" },
      { status: 502 },
    );
  }
}
