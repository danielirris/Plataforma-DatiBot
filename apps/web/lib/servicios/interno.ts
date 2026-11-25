// Cabeceras para llamar a los servicios Python (extractor, ebooks) por la RED INTERNA.
//
// Los servicios exigen su propia auth (ver apps/*/service_auth.py): el web se
// identifica con X-Internal-Token = INTERNAL_TOKEN (misma env en web, extractor y
// ebooks). Solo servidor: nunca importar desde un componente de cliente.
export function headersInternos(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const token = process.env.INTERNAL_TOKEN;
  if (token) h.set("X-Internal-Token", token);
  return h;
}
