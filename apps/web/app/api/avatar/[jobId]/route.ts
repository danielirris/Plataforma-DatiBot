import { NextResponse } from "next/server";
import { obtenerAvatarJob } from "@/lib/ai/avatarJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ jobId: string }> };

// Estado de una investigación de avatar en segundo plano (para el polling).
export async function GET(_req: Request, { params }: Ctx) {
  const { jobId } = await params;
  const job = obtenerAvatarJob(jobId);
  if (!job)
    return NextResponse.json(
      { error: "La investigación expiró o no existe. Vuelve a lanzarla." },
      { status: 404 },
    );
  return NextResponse.json({
    status: job.status,
    avatar: job.avatar ?? null,
    error: job.error ?? null,
  });
}
