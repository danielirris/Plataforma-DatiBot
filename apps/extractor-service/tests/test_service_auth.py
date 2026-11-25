"""Tests del middleware de auth propia del servicio (token interno / Basic)."""
import base64

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.service_auth import ServiceAuthMiddleware


def _app():
    app = FastAPI()
    app.add_middleware(ServiceAuthMiddleware)

    @app.get("/healthz")
    def h():
        return {"ok": True}

    @app.get("/api/x")
    def x():
        return {"ok": True}

    return TestClient(app)


def _basic(u, p):
    return "Basic " + base64.b64encode(f"{u}:{p}".encode()).decode()


@pytest.fixture(autouse=True)
def limpiar(monkeypatch):
    for k in ("INTERNAL_TOKEN", "SERVICE_AUTH_USER", "SERVICE_AUTH_PASSWORD"):
        monkeypatch.delenv(k, raising=False)


def test_sin_config_queda_abierto():
    assert _app().get("/api/x").status_code == 200


def test_con_token(monkeypatch):
    monkeypatch.setenv("INTERNAL_TOKEN", "s3cr3t")
    c = _app()
    assert c.get("/api/x").status_code == 401
    assert c.get("/api/x", headers={"X-Internal-Token": "malo"}).status_code == 401
    assert c.get("/api/x", headers={"X-Internal-Token": "s3cr3t"}).status_code == 200
    assert c.get("/healthz").status_code == 200


def test_con_basic(monkeypatch):
    monkeypatch.setenv("INTERNAL_TOKEN", "s3cr3t")
    monkeypatch.setenv("SERVICE_AUTH_USER", "ana")
    monkeypatch.setenv("SERVICE_AUTH_PASSWORD", "clave:con:dospuntos")
    c = _app()
    r = c.get("/api/x")
    assert r.status_code == 401 and r.headers["www-authenticate"].startswith("Basic")
    assert c.get("/api/x", headers={"Authorization": _basic("ana", "mala")}).status_code == 401
    assert c.get("/api/x", headers={"Authorization": "Basic ###"}).status_code == 401
    ok = {"Authorization": _basic("ana", "clave:con:dospuntos")}
    assert c.get("/api/x", headers=ok).status_code == 200
