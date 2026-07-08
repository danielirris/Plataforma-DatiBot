"""Ejecución en segundo plano de las tandas de B-rolls (Veo tarda minutos).

Registro en memoria + hilo daemon por job, para no bloquear el endpoint ni
acoplarse al JobManager del editor (módulo aislado).
"""
from __future__ import annotations

import logging
import threading
import uuid

from app.brolls.service import generate_brolls

logger = logging.getLogger("brolls.runner")

_JOBS: dict[str, dict] = {}
_MAX_JOBS = 30  # se conservan los últimos N estados


def _prune() -> None:
    if len(_JOBS) > _MAX_JOBS:
        for k in list(_JOBS)[: len(_JOBS) - _MAX_JOBS]:
            _JOBS.pop(k, None)


def _run(job_id: str, product_id: str, product: dict,
         source: str, overrides: dict | None) -> None:
    def prog(done: int, total: int, msg: str) -> None:
        j = _JOBS.get(job_id)
        if j:
            j.update(done=done, total=total, message=msg,
                     progress=min(100, int(done * 100 / max(1, total))))

    try:
        _JOBS[job_id].update(status="running", message="Preparando…")
        res = generate_brolls(product_id, product, source=source,
                              overrides=overrides, on_progress=prog)
        _JOBS[job_id].update(status="done", progress=100, result=res,
                             message=f"{len(res['clips'])} brolls listos.")
    except Exception as e:  # noqa: BLE001
        logger.exception("Broll job %s falló", job_id)
        _JOBS[job_id].update(status="error", error=str(e), message=f"Error: {e}")


def start(product_id: str, product: dict, source: str,
          overrides: dict | None) -> str:
    job_id = uuid.uuid4().hex[:12]
    total = int((overrides or {}).get("n_brolls") or 10)
    _JOBS[job_id] = {"status": "queued", "progress": 0, "done": 0, "total": total,
                     "message": "En cola…", "product_id": product_id, "source": source}
    _prune()
    threading.Thread(target=_run, args=(job_id, product_id, product, source, overrides),
                     daemon=True).start()
    return job_id


def status(job_id: str) -> dict | None:
    return _JOBS.get(job_id)
