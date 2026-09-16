"""Ejecución en segundo plano de las tandas de B-rolls (Veo tarda minutos).

Registro en memoria + hilo daemon por job, para no bloquear el endpoint ni
acoplarse al JobManager del editor (módulo aislado).

El estado se PERSISTE en disco (best-effort) para que:
- los resultados de una tanda TERMINADA sobrevivan a un reinicio del servidor, y
- una tanda que quedó A MEDIAS se reporte como 'interrumpida' (con mensaje claro)
  en vez de desaparecer y devolver un 404 mudo. Veo no se puede reanudar, así que
  no intentamos recuperarla: solo avisamos para que se vuelva a lanzar.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from pathlib import Path

from app.brolls.service import generate_brolls
from app.config import get_settings

logger = logging.getLogger("brolls.runner")

_JOBS: dict[str, dict] = {}
_MAX_JOBS = 30  # se conservan los últimos N estados en memoria

# Campos que se guardan en disco (el resto es reconstruible o irrelevante).
_PERSIST_KEYS = ("status", "progress", "done", "total", "message",
                 "product_id", "source", "error", "result")


def _state_dir() -> Path:
    d = get_settings().storage_dir / "brolls_state"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _state_path(job_id: str) -> Path:
    return _state_dir() / f"{job_id}.json"


def _persist(job_id: str) -> None:
    """Guarda el estado del job en disco (best-effort; nunca rompe la tanda)."""
    j = _JOBS.get(job_id)
    if not j:
        return
    try:
        data = {k: j.get(k) for k in _PERSIST_KEYS}
        _state_path(job_id).write_text(
            json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8"
        )
    except Exception:  # noqa: BLE001 - la persistencia es opcional
        logger.warning("No se pudo persistir el estado del broll %s", job_id,
                        exc_info=True)


def _prune() -> None:
    if len(_JOBS) > _MAX_JOBS:
        for k in list(_JOBS)[: len(_JOBS) - _MAX_JOBS]:
            _JOBS.pop(k, None)


def _run(job_id: str, product_id: str, product: dict,
         source: str, overrides: dict | None,
         videos_locales: list[Path] | None = None) -> None:
    def prog(done: int, total: int, msg: str) -> None:
        j = _JOBS.get(job_id)
        if j:
            j.update(done=done, total=total, message=msg,
                     progress=min(100, int(done * 100 / max(1, total))))
            _persist(job_id)

    try:
        _JOBS[job_id].update(status="running", message="Preparando…")
        _persist(job_id)
        res = generate_brolls(product_id, product, source=source,
                              overrides=overrides, on_progress=prog,
                              videos_locales=videos_locales)
        _JOBS[job_id].update(status="done", progress=100, result=res,
                             message=f"{len(res['clips'])} brolls listos.")
    except Exception as e:  # noqa: BLE001
        logger.exception("Broll job %s falló", job_id)
        _JOBS[job_id].update(status="error", error=str(e), message=f"Error: {e}")
    finally:
        _persist(job_id)
        # Limpia los videos temporales que mandó el web.
        for p in (videos_locales or []):
            try:
                p.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass


def start(product_id: str, product: dict, source: str,
          overrides: dict | None, videos_locales: list[Path] | None = None) -> str:
    job_id = uuid.uuid4().hex[:12]
    total = int((overrides or {}).get("n_brolls") or 10)
    _JOBS[job_id] = {"status": "queued", "progress": 0, "done": 0, "total": total,
                     "message": "En cola…", "product_id": product_id, "source": source}
    _persist(job_id)
    _prune()
    threading.Thread(target=_run,
                     args=(job_id, product_id, product, source, overrides, videos_locales),
                     daemon=True).start()
    return job_id


def status(job_id: str) -> dict | None:
    """Estado de la tanda.

    Si está en memoria, se devuelve tal cual. Si no (p. ej. tras un reinicio del
    servidor), se recupera del disco: una tanda TERMINADA devuelve sus clips como
    siempre; una que estaba EN CURSO se reporta como 'error/interrumpida' con un
    mensaje claro para relanzarla, en vez de un 404.
    """
    j = _JOBS.get(job_id)
    if j:
        return j
    try:
        path = _state_path(job_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    if data.get("status") in ("queued", "running"):
        # Estaba a medias cuando el proceso murió: Veo no se puede reanudar.
        data["status"] = "error"
        data["error"] = "interrumpida"
        data["message"] = ("La tanda se interrumpió (reinicio del servidor). "
                           "Vuelve a lanzarla.")
    return data
