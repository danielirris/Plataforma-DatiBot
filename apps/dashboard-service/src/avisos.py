"""Avisos de datos visibles en la UI (no solo en stderr).

Un token de Facebook caducado, una cuenta sin tasa de cambio o ventas sin moneda
convertible cambian las cifras (gasto incompleto → ROAS inflado). Antes solo se
imprimían en stderr; ahora se registran aquí con su hora y app.py los muestra.
"""
from __future__ import annotations

import sys
import threading
import time

_AVISOS: dict[str, float] = {}
_LOCK = threading.Lock()


def avisar(msg: str) -> None:
    print(msg, file=sys.stderr)
    limpio = msg.removeprefix("[WARN]").strip()
    with _LOCK:
        _AVISOS[limpio] = time.time()


def avisos_recientes(max_age_s: float = 600) -> list[str]:
    """Avisos de los últimos ``max_age_s`` segundos (más recientes primero)."""
    limite = time.time() - max_age_s
    with _LOCK:
        for k in [k for k, t in _AVISOS.items() if t < limite]:
            del _AVISOS[k]
        return [k for k, _ in sorted(_AVISOS.items(), key=lambda kv: -kv[1])]


def limpiar_avisos() -> None:
    with _LOCK:
        _AVISOS.clear()
