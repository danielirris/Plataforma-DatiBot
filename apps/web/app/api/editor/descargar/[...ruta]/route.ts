import { NextResponse } from "next/server";
import { extractorUrl } from "@/lib/editor/extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sirve las SALIDAS del extractor (el anuncio renderizado, el proyecto .zip y las
// miniaturas del Hook) por el dominio del propio editor, hablando con el
// extractor por la RED INTERNA. Así el editor suelto (subdominio) puede bajar
// resultados sin las credenciales del dominio público del extractor, que tiene
// su propio Basic Auth de EasyPanel.
//
// Es un proxy ACOTADO: solo deja pasar rutas de descarga/miniatura, nunca
// /api/config, /api/galeria ni nada que liste o toque datos. Sirve archivos ya
// terminados; los ids son aleatorios (uuid4[:12]) y no se pueden enumerar desde
// aquí (la cola compartida está bloqueada en modo editor).
const PERMITIDAS = [
  /^api\/jobs\/[a-f0-9]{6,32}\/download\/\d{1,3}$/,
  /^api\/jobs\/[a-f0-9]{6,32}\/project$/,
  /^api\/hooks\/[a-zA-Z0-9]{6,64}\/thumb\/\d{1,3}$/,
];

type Ctx = { params: Promise<{ ruta: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { ruta } = await params;
  // Reconstruye la ruta del extractor a partir de los segmentos, saneando cada
  // uno: nada de "..", ni barras ni caracteres raros dentro de un segmento.
  const segmentos = (ruta ?? []).map((s) => decodeURIComponent(s));
  if (segmentos.some((s) => !/^[a-zA-Z0-9_.-]+$/.test(s) || s === ".." || s === ".")) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }
  const rel = segmentos.join("/");
  if (!PERMITIDAS.some((re) => re.test(rel))) {
    return NextResponse.json({ error: "Ruta no permitida." }, { status: 404 });
  }

  let res: Response;
  try {
    res = await fetch(`${extractorUrl()}/${rel}`, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { error: `No se pudo contactar al editor de video (${extractorUrl()}).` },
      { status: 502 },
    );
  }
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { error: `El archivo no está disponible (${res.status}).` },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  // Pasa el cuerpo tal cual (streaming), conservando tipo y nombre de descarga.
  const headers = new Headers();
  for (const h of ["content-type", "content-length", "content-disposition"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "no-store");
  return new NextResponse(res.body, { status: 200, headers });
}
