import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { leerVpsConfig } from "@/lib/vps/upload";
import { extractorUrl, extractorPublicUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Crea un job de edición en el extractor a partir de los videos del producto.
export async function POST(req: Request) {
  let body: {
    video_urls?: string[];
    num_clips?: number;
    use_music?: boolean;
    use_intro?: boolean;
    style?: string;
    subtitle_style?: string;
    highlight?: string;
    font?: string;
    hook?: { video_idx: number; start: number; dur: number } | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const urls = (body.video_urls ?? []).filter(Boolean);
  if (!urls.length)
    return NextResponse.json({ error: "Elige al menos un video del producto." }, { status: 400 });

  // Preferimos mandarle los BYTES al extractor (red interna): así no depende de
  // que la URL pública del video sea alcanzable (nginx/volumen/dominio). El web
  // ya tiene el archivo en disco porque él mismo lo escribió al subirlo.
  const rutas: { nombre: string; ruta: string }[] = [];
  const dir = (await leerVpsConfig()).localDir || process.env.VPS_LOCAL_DIR || "";
  if (dir) {
    for (const u of urls) {
      const nombre = path.basename(new URL(u, "http://x").pathname);
      const ruta = path.join(dir.replace(/\/+$/, ""), nombre);
      try {
        await stat(ruta);
        rutas.push({ nombre, ruta });
      } catch {
        /* no está en disco: usaremos las URLs */
      }
    }
  }
  const porArchivos = rutas.length === urls.length && rutas.length > 0;

  let res: Response;
  try {
    if (porArchivos) {
      const form = new FormData();
      for (const r of rutas)
        form.append("videos", new Blob([new Uint8Array(await readFile(r.ruta))]), r.nombre);
      form.append("mode", "full");
      form.append("num_clips", String(body.num_clips ?? 0));
      form.append("use_music", body.use_music ? "1" : "0");
      form.append("use_intro", body.use_intro ? "1" : "0");
      form.append("style", body.style ?? "");
      form.append("subtitle_style", body.subtitle_style ?? "");
      form.append("highlight", body.highlight ?? "");
      form.append("font", body.font ?? "Anton");
      if (body.hook) form.append("hook", JSON.stringify(body.hook));
      res = await fetch(`${extractorUrl()}/api/jobs/from-files`, { method: "POST", body: form });
    } else {
      res = await fetch(`${extractorUrl()}/api/jobs/from-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_urls: urls,
          num_clips: body.num_clips ?? 0,
          use_music: !!body.use_music,
          use_intro: !!body.use_intro,
          style: body.style ?? "",
          subtitle_style: body.subtitle_style ?? "",
          highlight: body.highlight ?? "",
          font: body.font ?? "Anton",
          hook: body.hook ?? null,
          mode: "full",
        }),
      });
    }
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al editor de video (${extractorUrl()}).` },
      { status: 502 },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { error: (data as { detail?: string }).detail ?? `Error ${res.status}` },
      { status: res.status },
    );
  return NextResponse.json({ ...data, publicBase: extractorPublicUrl() });
}
