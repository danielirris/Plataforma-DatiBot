import { NextRequest, NextResponse } from "next/server";
import { esSoloEditor, permitidaEnEditor } from "@/lib/modo";

// ─────────────────────────────────────────────────────────────
// Dos porteros para TODA la plataforma (shell):
//
//  1. Autenticación por HTTP Basic (APP_AUTH_USER / APP_AUTH_PASSWORD).
//  2. Modo solo editor (SOLO_EDITOR=1): el segundo servicio, con su propio
//     dominio, sirve ÚNICAMENTE el editor de videos. Ver lib/modo.ts.
//
// Este es el ÚNICO bloqueo real: esconder enlaces del menú no impide entrar por
// URL. Si una ruta no está en la lista blanca de lib/modo.ts, aquí muere.
//
// Los servicios Python (dashboard, extractor, ebooks) viven en otros subdominios
// y se protegen con el Basic Auth de EasyPanel (ver DEPLOY.md).
// ─────────────────────────────────────────────────────────────

export const config = {
  // Protege todo menos los estáticos de Next y /api/img (imágenes públicas que
  // deben cargar n8n, los ebooks y los anuncios sin autenticación).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/img/).*)"],
};

/**
 * Compara sin cortocircuitar por carácter: no delata en cuántas letras acertó
 * quien prueba contraseñas. La longitud sí se filtra, y es asumible.
 */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** Devuelve la respuesta a enviar si NO pasa el login, o null si pasa. */
function comprobarAuth(req: NextRequest): NextResponse | null {
  const user = process.env.APP_AUTH_USER;
  const pass = process.env.APP_AUTH_PASSWORD;

  if (!user || !pass) {
    // En producción NO se abre la puerta: sin estas dos vars quedarían al aire
    // /api/config (con todas las API keys) o, en el subdominio del editor, la
    // cuota de IA de cualquiera. Un typo en EasyPanel debe romper de forma
    // ruidosa, no callada.
    if (process.env.NODE_ENV === "production")
      return new NextResponse(
        "Configuración incompleta: faltan APP_AUTH_USER y APP_AUTH_PASSWORD en este servicio.",
        { status: 503 },
      );
    return null; // en local, sin credenciales, la plataforma sigue abierta
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      // Se comprueban las dos SIEMPRE: con `&&` no se llegaría a mirar la
      // contraseña cuando el usuario ya falla.
      const okUser = igual(decoded.slice(0, sep), user);
      const okPass = igual(decoded.slice(sep + 1), pass);
      if (okUser && okPass) return null;
    } catch {
      // cabecera malformada → cae al 401 de abajo
    }
  }

  return new NextResponse("Autenticación requerida.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mi Plataforma", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  // El login va primero: quien no ha entrado no debe ni poder tantear qué rutas
  // existen en este servicio.
  const negado = comprobarAuth(req);
  if (negado) return negado;

  if (esSoloEditor()) {
    const { pathname } = req.nextUrl;
    if (!permitidaEnEditor(pathname)) {
      // Las APIs contestan JSON (el cliente las lee con fetch); la navegación se
      // devuelve al editor, que es lo único que hay aquí.
      if (pathname.startsWith("/api/"))
        return NextResponse.json({ error: "No disponible en este servicio." }, { status: 404 });
      const url = req.nextUrl.clone();
      url.pathname = "/extractor";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // El layout se prerenderiza estático (leer el modo en él rompería el build),
    // así que el menú no puede saber el modo en el servidor. Se lo decimos por
    // una cookie legible que el Sidebar (cliente) usa para dejar solo el editor.
    const res = NextResponse.next();
    res.cookies.set("datibot_solo_editor", "1", { path: "/", sameSite: "lax" });
    return res;
  }

  return NextResponse.next();
}
