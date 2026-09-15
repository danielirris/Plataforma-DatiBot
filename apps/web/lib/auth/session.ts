// Sesión de Datibot: una cookie FIRMADA (HMAC-SHA256) que reemplaza al popup de HTTP
// Basic. Funciona igual en el Edge (middleware) y en Node (rutas /api) porque usa solo
// Web Crypto (crypto.subtle), TextEncoder y btoa/atob — nada específico de Node.
//
// Formato del valor de cookie: "<expiración_ms>.<firma_base64url>", donde la firma es
// HMAC(secreto, "<expiración_ms>"). El secreto es SESSION_SECRET (o, por defecto, la
// propia contraseña APP_AUTH_PASSWORD): así, cambiar la contraseña invalida las sesiones.

export const SESSION_COOKIE = "datibot_session";
const DIAS = 30;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function firmar(payload: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

/** Comparación en tiempo ~constante (no delata cuánto acertó). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Crea el valor de cookie de una sesión válida por `DIAS` días. */
export async function crearSesion(secreto: string): Promise<string> {
  const exp = String(Date.now() + DIAS * 86_400_000);
  return `${exp}.${await firmar(exp, secreto)}`;
}

/** Verifica una cookie de sesión: firma correcta y no caducada. */
export async function sesionValida(
  token: string | undefined,
  secreto: string,
): Promise<boolean> {
  if (!token || !secreto) return false;
  const i = token.lastIndexOf(".");
  if (i <= 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return iguales(sig, await firmar(payload, secreto));
}

/** Segundos de vida de la cookie (para Max-Age). */
export const SESSION_MAX_AGE = DIAS * 86_400;
