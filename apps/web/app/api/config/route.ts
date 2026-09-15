import { NextResponse } from "next/server";
import {
  readConfig,
  readConfigRaw,
  writeConfig,
  redactSecrets,
  mergePreservingSecrets,
  type ConfigStore,
} from "@plataforma/config";

export const runtime = "nodejs";

export async function GET() {
  // Nunca devolvemos los secretos (API keys, tokens, service key, credencial del VPS)
  // al navegador: se redactan. El formulario solo edita instrucciones/precios.
  const store = await readConfig();
  return NextResponse.json(redactSecrets(store));
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConfigStore;
  // El cliente no recibió los secretos, así que llegan vacíos: los conservamos desde
  // el almacén en disco para que guardar no borre las claves. Base = store crudo (sin
  // superponer el entorno, para no hornear en el archivo lo que vive en EasyPanel).
  const actual = await readConfigRaw();
  await writeConfig(mergePreservingSecrets(body, actual));
  return NextResponse.json({ ok: true });
}
