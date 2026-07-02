// Extractor — servicio FastAPI + Remotion embebido.
// El servicio corre aparte (apps/extractor-service, puerto 8000) sirviendo su
// propia UI (FastAPI + Jinja2). Se embebe aquí en un iframe. Sus API keys
// (OpenAI, ElevenLabs, etc.) se gestionan en /configuracion, que genera
// apps/extractor-service/.env (leído por pydantic-settings al arrancar).

export const metadata = { title: "Extractor · Mi Plataforma" };

const EXTRACTOR_URL =
  process.env.NEXT_PUBLIC_EXTRACTOR_URL ?? "http://localhost:8000";

export default function ExtractorPage() {
  return (
    <iframe
      src={EXTRACTOR_URL}
      title="Extractor"
      className="h-full w-full border-0"
      allow="clipboard-write"
    />
  );
}
