// Extractor — servicio FastAPI + Remotion embebido.
// El servicio corre aparte (apps/extractor-service, puerto 8000) sirviendo su
// propia UI (FastAPI + Jinja2). Se embebe aquí en un iframe. Sus API keys
// (OpenAI, ElevenLabs, etc.) se gestionan en /configuracion, que genera
// apps/extractor-service/.env (leído por pydantic-settings al arrancar).

export const metadata = { title: "Editor de videos · Mi Plataforma" };

// Render dinámico: la URL se lee del entorno EN RUNTIME (no se incrusta en build).
export const dynamic = "force-dynamic";

export default function ExtractorPage() {
  const EXTRACTOR_URL = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  return (
    <iframe
      src={EXTRACTOR_URL}
      title="Editor de videos"
      className="h-full w-full border-0"
      allow="clipboard-write"
    />
  );
}
