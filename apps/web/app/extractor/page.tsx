// Editor de videos (extractor) — servicio FastAPI + Remotion embebido, con
// marco Datibot. La URL se lee del entorno EN RUNTIME.

import { EmbeddedFrame } from "../_components/EmbeddedFrame";

export const metadata = { title: "Editor de videos · Datibot" };
export const dynamic = "force-dynamic";

export default function ExtractorPage() {
  const EXTRACTOR_URL = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  return (
    <EmbeddedFrame
      src={EXTRACTOR_URL}
      title="Editor de videos"
      icon="🎬"
      description="Convierte videos largos en clips verticales para anuncios."
      allow="clipboard-write"
    />
  );
}
