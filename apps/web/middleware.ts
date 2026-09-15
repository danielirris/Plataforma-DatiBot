import { NextRequest, NextResponse } from "next/server";
import { esSoloEditor, permitidaEnEditor } from "@/lib/modo";
import { sesionValida, SESSION_COOKIE } from "@/lib/auth/session";

// ─────────────────────────────────────────────────────────────
// Porteros de TODA la plataforma (shell):
//  1. Sesión propia: cookie firmada (ver /login y /lib/auth/session). Reemplaza al
//     popup de HTTP Basic. Credenciales en APP_AUTH_USER / APP_AUTH_PASSWORD.
//  2. CSRF: valida el Origin en métodos que mutan.
//  3. Modo solo editor (SOLO_EDITOR=1): el subdominio de invitados solo sirve el editor.
//
// /api/img queda fuera (imágenes públicas para n8n/ebooks/anuncios).
// ─────────────────────────────────────────────────────────────

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/img/).*)"],
};

// Rutas de auth que NO requieren sesión (si no, no podrías ni ver el login).
const PUBLICAS = new Set(["/login", "/api/login", "/api/logout"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = process.env.APP_AUTH_USER;
  const pass = process.env.APP_AUTH_PASSWORD;

  // 1) Sesión.
  if (!user || !pass) {
    // Sin credenciales: en producción rompe RUIDOSO (no dejar /api/config al aire por un
    // typo en EasyPanel); en local, la plataforma queda abierta como siempre.
    if (process.env.NODE_ENV === "production" && !PUBLICAS.has(pathname))
      return new NextResponse(
        "Configuración incompleta: faltan APP_AUTH_USER y APP_AUTH_PASSWORD en este servicio.",
        { status: 503 },
      );
  } else if (!PUBLICAS.has(pathname)) {
    const secreto = process.env.SESSION_SECRET || pass;
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!(await sesionValida(token, secreto))) {
      // API → 401 JSON (lo lee el fetch del cliente); navegación → a la pantalla de login.
      if (pathname.startsWith("/api/"))
        return NextResponse.json({ error: "No autenticado." }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search =
        pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      return NextResponse.redirect(url);
    }
  }

  // 2) CSRF: si HAY cabecera Origin y su host NO es el nuestro, se bloquea. Sin Origin
  // (cliente no-navegador) no es vector CSRF y se deja pasar.
  const metodo = req.method.toUpperCase();
  if (metodo === "POST" || metodo === "PUT" || metodo === "PATCH" || metodo === "DELETE") {
    const origin = req.headers.get("origin");
    if (origin) {
      const propios = new Set(
        [req.headers.get("host"), req.headers.get("x-forwarded-host"), req.nextUrl.host].filter(
          Boolean,
        ),
      );
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* Origin malformado → no coincide */
      }
      if (!originHost || !propios.has(originHost))
        return NextResponse.json({ error: "Origen no permitido (posible CSRF)." }, { status: 403 });
    }
  }

  // 3) Modo solo editor: todo lo que no sea el editor (ni una ruta de auth) se redirige.
  if (esSoloEditor()) {
    if (!permitidaEnEditor(pathname) && !PUBLICAS.has(pathname)) {
      if (pathname.startsWith("/api/"))
        return NextResponse.json({ error: "No disponible en este servicio." }, { status: 404 });
      const url = req.nextUrl.clone();
      url.pathname = "/extractor";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // El layout es estático; el Sidebar (cliente) lee esta cookie para dejar solo el editor.
    const res = NextResponse.next();
    res.cookies.set("datibot_solo_editor", "1", { path: "/", sameSite: "lax" });
    return res;
  }

  return NextResponse.next();
}
