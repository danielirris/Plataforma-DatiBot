"""Estado de jobs tras reinicio, vaciado de cola, borrado y tandas de B-rolls."""
import threading
import time
from pathlib import Path

import pytest

from app.config import Settings
from app.jobs import JobManager, JobStatus


@pytest.fixture
def manager(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    s = Settings()
    s.ensure_dirs()
    return JobManager(s)  # sin start(): no arranca el worker


def _job_terminado_en_sqlite(m: JobManager, tmp_path: Path, jid: str = "abc123def456") -> Path:
    """Simula un anuncio terminado ANTES de un reinicio: solo existe en SQLite."""
    out = tmp_path / "outputs" / jid
    (out / "remotion-ad").mkdir(parents=True)
    (out / "clip_1.mp4").write_bytes(b"x")
    m._store.save(id=jid, filenames=["v.mp4"], status=JobStatus.DONE.value,
                  created_at=time.time(), sources=[], music=[], mode="ad")
    m._store.update(jid, {"output_dir": str(out), "n_clips": 1})
    return out


def test_render_tras_reinicio_actualiza_estado(manager, tmp_path):
    _job_terminado_en_sqlite(manager, tmp_path)
    assert "abc123def456" not in manager._jobs
    assert manager.request_render("abc123def456")
    assert manager.get("abc123def456").status == JobStatus.RENDERING
    # Segundo clic mientras está en cola: no se encola dos veces.
    assert not manager.request_render("abc123def456")
    assert manager._queue.qsize() == 1


def test_update_escribe_en_sqlite_aunque_no_este_en_memoria(manager, tmp_path):
    _job_terminado_en_sqlite(manager, tmp_path)
    manager._update("abc123def456", n_clips=3, message="hola")
    row = manager._store.get_one("abc123def456")
    assert row["n_clips"] == 3 and row["message"] == "hola"


def test_vaciar_cola_no_rompe_anuncio_terminado(manager, tmp_path):
    _job_terminado_en_sqlite(manager, tmp_path)
    manager.request_render("abc123def456")
    manager.reset_queue()
    job = manager.get("abc123def456")
    assert job.status == JobStatus.DONE
    assert manager.clip_path("abc123def456", 1) is not None  # sigue descargable


def test_borrar_rechaza_job_en_proceso_y_borra_desde_sqlite(manager, tmp_path):
    out = _job_terminado_en_sqlite(manager, tmp_path)
    manager.request_render("abc123def456")
    assert manager.delete("abc123def456") is False
    assert out.exists()
    manager.reset_queue()  # vuelve a DONE
    assert manager.delete("abc123def456") is True
    assert not out.exists()  # antes, un job solo-SQLite dejaba la carpeta huérfana


def test_brolls_una_tanda_a_la_vez(monkeypatch, tmp_path):
    from app.brolls import runner

    monkeypatch.setattr(runner, "_state_dir", lambda: tmp_path)
    activos, maximo = [0], [0]
    lock = threading.Lock()

    def fake_generate(*a, **k):
        with lock:
            activos[0] += 1
            maximo[0] = max(maximo[0], activos[0])
        time.sleep(0.15)
        with lock:
            activos[0] -= 1
        return {"clips": []}

    monkeypatch.setattr(runner, "generate_brolls", fake_generate)
    ids = [runner.start(f"p{i % 2}", {"id": f"p{i % 2}"}, "uploaded", {}) for i in range(3)]
    for _ in range(100):
        if all(runner.status(i)["status"] == "done" for i in ids):
            break
        time.sleep(0.05)
    assert all(runner.status(i)["status"] == "done" for i in ids)
    assert maximo[0] == 1
