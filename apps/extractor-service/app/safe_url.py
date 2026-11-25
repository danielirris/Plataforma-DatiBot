"""Descargas por URL SEGURAS (anti-SSRF).

El editor recibe URLs de videos desde el web (``video_urls``) y las descarga. Sin
validar, ``urllib`` acepta ``file://`` (leería videos de otros jobs del disco) y
hosts internos (``http://ebooks:8600``, ``http://dashboard:8501``, metadatos de la
nube en ``169.254.169.254``), saltándose el Basic Auth de los dominios públicos.

Reglas:
  * Solo ``http``/``https`` (nada de ``file:``, ``ftp:``, ``data:``…).
  * El host debe resolver SOLO a IPs públicas (se rechazan loopback, privadas,
    link-local, reservadas, multicast…).
  * Excepción: los hosts listados en la env ``DOWNLOAD_ALLOWED_HOSTS`` (separados
    por comas, p. ej. ``web,img.midominio.com``) se aceptan aunque resuelvan a una
    IP interna — para cuando el servidor de archivos vive en la red del proyecto.
  * Cada REDIRECCIÓN se vuelve a validar con las mismas reglas.

Riesgo residual conocido: DNS rebinding entre la validación y la conexión. Para
cerrarlo del todo, usa ``DOWNLOAD_ALLOWED_HOSTS`` con la lista exacta de hosts.
"""
from __future__ import annotations

import ipaddress
import os
import socket
import urllib.error
import urllib.parse
import urllib.request


class UnsafeURLError(ValueError):
    """La URL no está permitida (esquema, host o IP)."""


def _allowed_hosts() -> set[str]:
    raw = os.environ.get("DOWNLOAD_ALLOWED_HOSTS", "")
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def _ip_es_publica(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%", 1)[0])
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return addr.is_global and not addr.is_multicast


def validar_url(url: str) -> str:
    """Devuelve la URL si es segura de descargar; si no, lanza ``UnsafeURLError``."""
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError as exc:
        raise UnsafeURLError(f"URL inválida: {exc}") from None
    if parts.scheme.lower() not in ("http", "https"):
        raise UnsafeURLError("solo se permiten URLs http/https")
    host = (parts.hostname or "").lower()
    if not host:
        raise UnsafeURLError("la URL no tiene host")
    if parts.username or parts.password:
        raise UnsafeURLError("la URL no puede llevar credenciales")
    if host in _allowed_hosts():
        return url
    try:
        port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    except ValueError:
        raise UnsafeURLError("puerto inválido") from None
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise UnsafeURLError(f"no se pudo resolver el host '{host}'") from None
    ips = {info[4][0] for info in infos}
    if not ips or not all(_ip_es_publica(ip) for ip in ips):
        raise UnsafeURLError(f"el host '{host}' apunta a una dirección interna (bloqueado)")
    return url


class _RedireccionSegura(urllib.request.HTTPRedirectHandler):
    max_redirections = 5

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D102
        validar_url(urllib.parse.urljoin(req.full_url, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _opener() -> urllib.request.OpenerDirector:
    # Se arma a mano (no build_opener) para NO registrar FileHandler/FTPHandler/
    # DataHandler: así ``file://`` es imposible aunque fallara la validación.
    op = urllib.request.OpenerDirector()
    for h in (
        urllib.request.HTTPHandler(),
        urllib.request.HTTPSHandler(),
        _RedireccionSegura(),
        urllib.request.HTTPDefaultErrorHandler(),
        urllib.request.HTTPErrorProcessor(),
        urllib.request.UnknownHandler(),  # cualquier otro esquema → URLError
    ):
        op.add_handler(h)
    return op


def abrir_url(url: str, *, timeout: float, user_agent: str):
    """Como ``urllib.request.urlopen`` pero validando URL y redirecciones."""
    validar_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    return _opener().open(req, timeout=timeout)
