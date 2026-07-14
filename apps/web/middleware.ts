import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// Autenticación de TODA la plataforma (shell) por HTTP Basic Auth.
//
// Se activa SOLO si están definidas las variables de entorno APP_AUTH_USER y
// APP_AUTH_PASSWORD. En local (sin esas vars) la plataforma queda abierta como
// siempre. En producción (EasyPanel) se ponen esas dos vars y todo el shell
// —incluida /api/config, que expone las API keys— queda detrás de login.
//
// Los servicios Python (dashboard, extractor, ebooks) viven en otros subdominios
// y se protegen con el Basic Auth de EasyPanel (ver DEPLOY.md).
// ─────────────────────────────────────────────────────────────

export const config = {
  // Protege todo menos los estáticos de Next y /api/img (imágenes públicas que
  // deben cargar n8n, los ebooks y los anuncios sin autenticación).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/img/).*)"],
};

export function middleware(req: NextRequest) {
  const user = process.env.APP_AUTH_USER;
  const pass = process.env.APP_AUTH_PASSWORD;

  // Auth desactivada si no hay credenciales configuradas (uso local).
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      // cabecera malformada → cae al 401 de abajo
    }
  }

  return new NextResponse("Autenticación requerida.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mi Plataforma", charset="UTF-8"' },
  });
}
