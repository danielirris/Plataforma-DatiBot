import { NextResponse } from "next/server";
import { readConfig, writeConfig, type ConfigStore } from "@plataforma/config";

export const runtime = "nodejs";

export async function GET() {
  const store = await readConfig();
  return NextResponse.json(store);
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConfigStore;
  await writeConfig(body);
  return NextResponse.json({ ok: true });
}
