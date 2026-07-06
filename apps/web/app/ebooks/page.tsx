// Ebooks — servicio EbookForge (FastAPI + WeasyPrint) embebido.
// El servicio corre aparte (apps/ebookforge-service, puerto 8600) sirviendo su
// propia UI (FastAPI + HTML): pegas el JSON de contenido, subes las imágenes,
// eliges el tema y descargas el PDF. El motor es determinista (sin IA) y local.
// El puerto se gestiona en /configuracion, que genera apps/ebookforge-service/.env.

export const metadata = { title: "Ebooks · Mi Plataforma" };

// Render dinámico: la URL se lee del entorno EN RUNTIME (no se incrusta en build).
export const dynamic = "force-dynamic";

export default function EbooksPage() {
  const EBOOKFORGE_URL = process.env.EBOOKFORGE_URL ?? "http://localhost:8600";
  return (
    <iframe
      src={EBOOKFORGE_URL}
      title="Ebooks"
      className="h-full w-full border-0"
      allow="clipboard-write"
    />
  );
}
