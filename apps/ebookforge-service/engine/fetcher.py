"""
fetcher.py — url_fetcher SEGURO para WeasyPrint.

El HTML del ebook se arma con texto que viene de la IA / del usuario. El fetcher
por defecto de WeasyPrint acepta ``file://`` y cualquier ``http://``, así que un
``<a rel="attachment" href="file:///proc/self/environ">`` o un ``<img src=...>``
podía meter archivos del servidor dentro del PDF, o hacer peticiones a la red
interna (``http://extractor:8000``, metadatos de la nube…).

Este fetcher solo permite:
  * ``data:`` (fuentes e imágenes ya incrustadas por assets.py), y
  * ``http(s)`` hacia hosts que resuelven SOLO a IPs públicas.
Todo lo demás (``file:``, hosts internos, otros esquemas) se rechaza.
"""
import ipaddress
import socket
import urllib.parse

from weasyprint import default_url_fetcher


class URLBloqueada(ValueError):
    pass


def _ip_es_publica(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%", 1)[0])
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return addr.is_global and not addr.is_multicast


def validar_url_remota(url: str) -> None:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme.lower() not in ("http", "https"):
        raise URLBloqueada(f"esquema no permitido: {parts.scheme or '(vacío)'}")
    host = (parts.hostname or "").lower()
    if not host:
        raise URLBloqueada("URL sin host")
    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise URLBloqueada(f"no se pudo resolver {host}") from None
    ips = {i[4][0] for i in infos}
    if not ips or not all(_ip_es_publica(ip) for ip in ips):
        raise URLBloqueada(f"{host} apunta a una dirección interna")


def url_fetcher_seguro(url: str, *args, **kwargs):
    if url.lower().startswith("data:"):
        return default_url_fetcher(url, *args, **kwargs)
    validar_url_remota(url)
    # Nota: default_url_fetcher sigue redirecciones sin revalidar; para no abrir esa
    # puerta, si el destino final difiere del pedido y no es público, se rechaza.
    result = default_url_fetcher(url, *args, **kwargs)
    final = result.get("redirected_url") if isinstance(result, dict) else None
    if final and final != url:
        validar_url_remota(final)
    return result
