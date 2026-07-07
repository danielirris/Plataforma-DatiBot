// Ebooks — servicio EbookForge (FastAPI + WeasyPrint) embebido, con marco
// Datibot. La URL se lee del entorno EN RUNTIME.

import { EmbeddedFrame } from "../_components/EmbeddedFrame";

export const metadata = { title: "Ebooks · Datibot" };
export const dynamic = "force-dynamic";

export default function EbooksPage() {
  const EBOOKFORGE_URL = process.env.EBOOKFORGE_URL ?? "http://localhost:8600";
  return (
    <EmbeddedFrame
      src={EBOOKFORGE_URL}
      title="Ebooks"
      icon="📕"
      description="Genera ebooks en PDF con temas de diseño listos para vender."
      allow="clipboard-write"
    />
  );
}
