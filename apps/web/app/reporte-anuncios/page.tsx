// Reporte de anuncios — embebe la app de atribución (anuncios.datibot.lat) DENTRO de
// Datibot, y entra con UN SOLO inicio de sesión: el panel NO muestra su propio login.
//
// Cómo: la app de anuncios se autentica por un token en la URL, ?s=sha256("usuario:
// contraseña")[:24] (su propio login lo pone tras entrar). Como sus credenciales
// (APP_USER/APP_PASSWORD) son las mismas de Datibot, calculamos ese token en el SERVIDOR
// y embebemos anuncios.datibot.lat/?s=<token> → el panel abre directo. La contraseña
// NUNCA sale al cliente: solo viaja el token (un hash), igual que el que la propia app
// pone en su URL. Y la página ya está detrás del login de Datibot.
import { createHash } from "node:crypto";

export const metadata = { title: "Reporte de anuncios · Datibot" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // token calculado con el entorno vigente

function anunciosSrc(): string {
  const base = process.env.NEXT_PUBLIC_ANUNCIOS_URL || "https://anuncios.datibot.lat";
  // Credenciales de anuncios = las de Datibot (ya igualadas). Se pueden sobreescribir con
  // ANUNCIOS_APP_USER / ANUNCIOS_APP_PASSWORD si algún día difieren.
  const user = process.env.ANUNCIOS_APP_USER || process.env.APP_AUTH_USER || "admin";
  const pass = process.env.ANUNCIOS_APP_PASSWORD || process.env.APP_AUTH_PASSWORD || "";
  if (!pass) return base; // sin contraseña, anuncios no tiene login: se embebe tal cual
  const token = createHash("sha256").update(`${user}:${pass}`, "utf8").digest("hex").slice(0, 24);
  try {
    const u = new URL(base);
    u.searchParams.set("s", token);
    return u.toString();
  } catch {
    return `${base}${base.includes("?") ? "&" : "?"}s=${token}`;
  }
}

export default function ReporteAnunciosPage() {
  const src = anunciosSrc();
  return (
    <iframe
      src={src}
      title="Reporte de anuncios"
      className="block h-full w-full border-0 bg-white"
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  );
}
