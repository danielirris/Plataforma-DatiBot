"""Tests del validador anti-SSRF de descargas por URL (sin red: getaddrinfo simulado)."""
import socket

import pytest

from app import safe_url
from app.safe_url import UnsafeURLError, validar_url


def _fake_dns(mapa):
    def getaddrinfo(host, port, *a, **k):
        if host not in mapa:
            raise socket.gaierror("no resuelve")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in mapa[host]]
    return getaddrinfo


@pytest.fixture(autouse=True)
def dns(monkeypatch):
    monkeypatch.delenv("DOWNLOAD_ALLOWED_HOSTS", raising=False)
    monkeypatch.setattr(socket, "getaddrinfo", _fake_dns({
        "img.publico.com": ["93.184.216.34"],
        "extractor": ["172.18.0.5"],
        "localhost": ["127.0.0.1"],
        "meta": ["169.254.169.254"],
        "mixto.com": ["93.184.216.34", "10.0.0.2"],
    }))


@pytest.mark.parametrize("url", [
    "file:///data/outputs/abc/clip_1.mp4",
    "ftp://img.publico.com/v.mp4",
    "data:video/mp4;base64,AAAA",
    "http://extractor:8000/api/galeria",
    "http://localhost/x.mp4",
    "http://127.0.0.1/x.mp4",
    "http://[::1]/x.mp4",
    "http://169.254.169.254/latest/meta-data/",
    "http://meta/x",
    "http://mixto.com/x.mp4",
    "http://user:pw@img.publico.com/x.mp4",
    "http://no-existe.invalid/x.mp4",
])
def test_bloquea(url):
    with pytest.raises(UnsafeURLError):
        validar_url(url)


def test_permite_publica():
    assert validar_url("https://img.publico.com/vid.mp4") == "https://img.publico.com/vid.mp4"


def test_lista_blanca_permite_host_interno(monkeypatch):
    monkeypatch.setenv("DOWNLOAD_ALLOWED_HOSTS", "extractor, otro")
    assert validar_url("http://extractor:8000/v.mp4")


def test_redireccion_a_interno_bloqueada():
    import urllib.request
    h = safe_url._RedireccionSegura()
    req = urllib.request.Request("https://img.publico.com/a.mp4")
    with pytest.raises(UnsafeURLError):
        h.redirect_request(req, None, 302, "Found", {}, "http://169.254.169.254/")
    with pytest.raises(UnsafeURLError):
        h.redirect_request(req, None, 302, "Found", {}, "file:///etc/passwd")


def test_opener_no_tiene_file_handler():
    import urllib.request
    op = safe_url._opener()
    assert not any(isinstance(h, urllib.request.FileHandler) for h in op.handlers)
    with pytest.raises(urllib.error.URLError):
        op.open("file:///etc/passwd")
