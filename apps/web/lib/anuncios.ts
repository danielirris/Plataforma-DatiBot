import { createHash } from "node:crypto";

// URL de la app de anuncios (anuncios.datibot.lat) con la sesión (token SSO) y,
// opcional, una página concreta (p. ej. ?pagina=configuracion, que ya no está en
// el menú del panel). El token es el mismo hash que la propia app pone en su URL;
// la contraseña NUNCA sale al cliente (esto se llama solo en el servidor).
export function anunciosUrl(pagina?: string): string {
  const base = process.env.NEXT_PUBLIC_ANUNCIOS_URL || "https://anuncios.datibot.lat";
  // Credenciales de anuncios = las de Datibot (ya igualadas). Se pueden sobreescribir
  // con ANUNCIOS_APP_USER / ANUNCIOS_APP_PASSWORD si algún día difieren.
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
