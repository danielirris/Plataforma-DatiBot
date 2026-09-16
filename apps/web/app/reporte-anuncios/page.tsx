// Reporte de anuncios — embebe la app de atribución (anuncios.datibot.lat) DENTRO de
// Datibot, y entra con UN SOLO inicio de sesión: el panel NO muestra su propio login.
//
// Cómo: la app de anuncios se autentica por un token en la URL, ?s=sha256("usuario:
// contraseña")[:24] (su propio login lo pone tras entrar). Como sus credenciales
// (APP_USER/APP_PASSWORD) son las mismas de Datibot, calculamos ese token en el SERVIDOR
// y embebemos anuncios.datibot.lat/?s=<token> → el panel abre directo. La contraseña
// NUNCA sale al cliente: solo viaja el token (un hash). La Configuración y el Tutorial
// de anuncios se sacaron del menú del panel y se acceden desde aquí, bien separados.
import { createHash } from "node:crypto";
import Link from "next/link";

export const metadata = { title: "Reporte de anuncios · Datibot" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // token calculado con el entorno vigente

// URL de la app de anuncios con la sesión (token) y, opcional, una página concreta
// (?pagina=configuracion abre la Configuración, que ya no está en el menú del panel).
function anunciosSrc(pagina?: string): string {
  const base = process.env.NEXT_PUBLIC_ANUNCIOS_URL || "https://anuncios.datibot.lat";
  // Credenciales de anuncios = las de Datibot (ya igualadas). Se pueden sobreescribir con
  // ANUNCIOS_APP_USER / ANUNCIOS_APP_PASSWORD si algún día difieren.
  const user = process.env.ANUNCIOS_APP_USER || process.env.APP_AUTH_USER || "admin";
  const pass = process.env.ANUNCIOS_APP_PASSWORD || process.env.APP_AUTH_PASSWORD || "";
  const token = pass
    ? createHash("sha256").update(`${user}:${pass}`, "utf8").digest("hex").slice(0, 24)
    : "";
  try {
    const u = new URL(base);
    if (token) u.searchParams.set("s", token);
    if (pagina) u.searchParams.set("pagina", pagina);
    return u.toString();
  } catch {
    const sep = base.includes("?") ? "&" : "?";
    const qs = [token && `s=${token}`, pagina && `pagina=${pagina}`]
      .filter(Boolean)
      .join("&");
    return qs ? `${base}${sep}${qs}` : base;
  }
}

export default function ReporteAnunciosPage() {
  const src = anunciosSrc();
  const configSrc = anunciosSrc("configuracion");
  return (
    <div className="flex h-full flex-col">
      {/* Barra slim: accesos a la Configuración y el Tutorial de anuncios, separados
          del propio panel (que ya no los lleva en su menú). */}
      <div className="flex items-center justify-end gap-2 border-b border-[var(--hairline)] px-4 py-2">
        <Link
          href="/tutorial#reporte"
          className="rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-text"
        >
          📘 Tutorial de anuncios
        </Link>
        <a
          href={configSrc}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-text"
          title="Tokens de Facebook, Supabase y tasas — se abre con tu misma sesión"
        >
          ⚙ Configuración de anuncios
        </a>
      </div>

      <iframe
        src={src}
        title="Reporte de anuncios"
        className="block w-full flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  );
}
