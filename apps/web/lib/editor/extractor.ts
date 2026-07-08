// URL del servicio de video (extractor) para llamadas server-side.
// En producción (EasyPanel, mismo proyecto) usa la red interna http://extractor:8000;
// en local, el servicio en localhost:8000. La pública lleva Basic Auth, por eso
// las llamadas del servidor NO deben usarla.
export function extractorUrl(): string {
  return (
    process.env.EXTRACTOR_INTERNAL_URL ||
    process.env.EXTRACTOR_URL ||
    "http://localhost:8000"
  );
}

/** URL pública del editor (para links de preview/descarga que abre el navegador). */
export function extractorPublicUrl(): string {
  return process.env.EXTRACTOR_URL || "http://localhost:8000";
}
