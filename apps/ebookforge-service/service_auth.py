"""Autenticación PROPIA del servicio (no depender solo del Basic Auth de EasyPanel).

El Basic Auth de EasyPanel protege el dominio público, pero por la red interna del
proyecto (``http://extractor:8000``, ``http://ebooks:8600``) el servicio quedaba
abierto: cualquier contenedor podía borrar trabajos, cambiar el prompt o gastar
en APIs de pago. Este middleware exige UNA de estas dos cosas en cada petición:

  * ``X-Internal-Token: <INTERNAL_TOKEN>`` — lo envía el web (server-side).
  * ``Authorization: Basic …`` con ``SERVICE_AUTH_USER``/``SERVICE_AUTH_PASSWORD``
    — el navegador (UI del servicio, previews, descargas). Usa las MISMAS
    credenciales que el Basic Auth de EasyPanel: Traefik reenvía la cabecera y el
    usuario no ve un segundo login.

Si no se define ninguna de las tres variables, el servicio queda abierto como
antes (desarrollo local) y se avisa en el log. ``/healthz`` siempre es público
(lo usa el HEALTHCHECK del contenedor).

Este archivo es idéntico en extractor-service y ebookforge-service.
"""
from __future__ import annotations

import base64
import hmac
import logging
import os

logger = logging.getLogger(__name__)

RUTAS_PUBLICAS = frozenset({"/healthz"})


def _cfg() -> tuple[str, str, str]:
    return (
        os.environ.get("INTERNAL_TOKEN", ""),
        os.environ.get("SERVICE_AUTH_USER", ""),
        os.environ.get("SERVICE_AUTH_PASSWORD", ""),
    )


def _iguales(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def peticion_autorizada(headers: dict[str, str]) -> bool:
    token, user, pwd = _cfg()
    if token:
        recibido = headers.get("x-internal-token", "")
        if recibido and _iguales(recibido, token):
            return True
    if user and pwd:
        auth = headers.get("authorization", "")
        if auth[:6].lower() == "basic ":
            try:
                dec = base64.b64decode(auth[6:].strip(), validate=True).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                return False
            u, sep, p = dec.partition(":")
            # Se evalúan las dos comparaciones siempre (sin cortocircuito).
            ok_u, ok_p = _iguales(u, user), _iguales(p, pwd)
            if sep and ok_u and ok_p:
                return True
    return False


class ServiceAuthMiddleware:
    """Middleware ASGI puro (no bufferiza cuerpos: apto para subidas grandes)."""

    def __init__(self, app):
        self.app = app
        token, user, pwd = _cfg()
        self.activo = bool(token or (user and pwd))
        self.basic = bool(user and pwd)
        if not self.activo:
            logger.warning(
                "ServiceAuth DESACTIVADO: define INTERNAL_TOKEN y/o SERVICE_AUTH_USER/"
                "SERVICE_AUTH_PASSWORD. Sin ellas, el servicio acepta peticiones sin "
                "credenciales desde la red interna.")
        elif (user and not pwd) or (pwd and not user):
            logger.warning("ServiceAuth: falta SERVICE_AUTH_USER o SERVICE_AUTH_PASSWORD; "
                           "el acceso por navegador queda deshabilitado.")

    async def __call__(self, scope, receive, send):
        if (not self.activo or scope["type"] not in ("http", "websocket")
                or scope.get("path") in RUTAS_PUBLICAS):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in scope.get("headers", [])}
        if peticion_autorizada(headers):
            await self.app(scope, receive, send)
            return
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4401})
            return
        cabeceras = [(b"content-type", b"application/json")]
        if self.basic:
            cabeceras.append((b"www-authenticate", b'Basic realm="datibot", charset="UTF-8"'))
        await send({"type": "http.response.start", "status": 401, "headers": cabeceras})
        await send({"type": "http.response.body", "body": b'{"detail":"No autenticado."}'})
