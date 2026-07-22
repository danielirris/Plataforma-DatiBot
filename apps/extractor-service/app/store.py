"""Persistencia de jobs en SQLite para sobrevivir reinicios del contenedor.

El estado vive también en memoria (rápido), pero se replica aquí para que, si
EasyPanel reinicia el contenedor a mitad de un trabajo, no se pierda: al arrancar
se reanudan los trabajos incompletos y se siguen pudiendo descargar los ya hechos.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class JobStore:
    """Almacén SQLite de jobs (thread-safe con un lock global)."""

    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # ¿La base ya existía? Es la señal de si /app/storage PERSISTE entre
        # reinicios. Si no persiste, cada reinicio borra jobs.db y los archivos del
        # proyecto → las previsualizaciones de anuncios ya generados dan 404.
        ya_existia = db_path.exists()
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                filenames   TEXT NOT NULL,
                status      TEXT NOT NULL,
                progress    INTEGER NOT NULL DEFAULT 0,
                message     TEXT DEFAULT '',
                error       TEXT DEFAULT '',
                aviso       TEXT DEFAULT '',
                n_clips     INTEGER DEFAULT 0,
                created_at  REAL NOT NULL,
                output_dir  TEXT,
                sources     TEXT NOT NULL,
                music       TEXT,
                mode        TEXT NOT NULL DEFAULT 'montage',
                voz         TEXT,
                num_clips_req INTEGER DEFAULT 0,
                guias       TEXT
            )
            """
        )
        # Migraciones para bases existentes sin columnas nuevas.
        cols = {r[1] for r in self._conn.execute("PRAGMA table_info(jobs)")}
        if "mode" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN mode TEXT NOT NULL DEFAULT 'montage'")
        if "voz" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN voz TEXT")
        if "num_clips_req" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN num_clips_req INTEGER DEFAULT 0")
        if "guias" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN guias TEXT")
        if "use_music" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN use_music INTEGER DEFAULT 1")
        if "intro" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN intro TEXT")
        if "style" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN style TEXT DEFAULT ''")
        if "params" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN params TEXT")
        # Nº de veces que un job se ha REANUDADO tras un reinicio. Si un job pesado
        # provoca un OOM (mata el contenedor), al arrancar se reanudaría y volvería
        # a hacer OOM: un bucle de reinicios que da 500 sin parar. Con este contador
        # lo reanudamos como mucho una vez y, si vuelve a quedar a medias, lo damos
        # por perdido en vez de reprocesarlo.
        if "recover_attempts" not in cols:
            self._conn.execute("ALTER TABLE jobs ADD COLUMN recover_attempts INTEGER DEFAULT 0")
        self._conn.commit()
        # Diagnóstico de persistencia (clave para que las previews sobrevivan a
        # reinicios): si la base ya existía, el volumen persiste; si es nueva cuando
        # debería haber trabajos, /app/storage NO es persistente y hay que montar un
        # volumen en EasyPanel (ver DEPLOY.md).
        n = self._conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        if ya_existia:
            logger.info("JobStore: base encontrada en %s (%d trabajos) — persistencia OK.", db_path, n)
        else:
            logger.warning(
                "JobStore: base NUEVA en %s. Si esperabas trabajos previos, /app/storage "
                "NO es un volumen persistente: móntalo en EasyPanel o las previews se "
                "perderán en cada reinicio.", db_path)

    def save(
        self,
        *,
        id: str,
        filenames: list[str],
        status: str,
        created_at: float,
        sources: list[Path],
        music: list[Path],
        mode: str = "montage",
        voz: list[Path] | None = None,
        num_clips_req: int = 0,
        guias: list[Path] | None = None,
        use_music: bool = True,
        intro: Path | None = None,
        style: str = "",
        params: dict | None = None,
    ) -> None:
        """Inserta (o reemplaza) un job recién creado. ``music`` es una lista de pistas."""
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO jobs "
                "(id, filenames, status, progress, message, error, aviso, n_clips, "
                " created_at, output_dir, sources, music, mode, voz, num_clips_req, guias, "
                " use_music, intro, style, params) "
                "VALUES (?, ?, ?, 0, 'En cola', '', '', 0, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    id, json.dumps(filenames), status, created_at,
                    json.dumps([str(p) for p in sources]),
                    json.dumps([str(p) for p in music]), mode,
                    json.dumps([str(p) for p in (voz or [])]), int(num_clips_req),
                    json.dumps([str(p) for p in (guias or [])]),
                    int(bool(use_music)), str(intro) if intro else None, style or "",
                    json.dumps(params) if params else None,
                ),
            )
            self._conn.commit()

    def update(self, job_id: str, fields: dict[str, Any]) -> None:
        """Actualiza columnas de un job."""
        allowed = {"status", "progress", "message", "error", "aviso",
                   "n_clips", "output_dir", "filenames", "recover_attempts"}
        fields = {k: v for k, v in fields.items() if k in allowed}
        if not fields:
            return
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._lock:
            self._conn.execute(
                f"UPDATE jobs SET {cols} WHERE id=?", (*fields.values(), job_id)
            )
            self._conn.commit()

    def get_one(self, job_id: str) -> sqlite3.Row | None:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,))
            return cur.fetchone()

    def recent_done(self, limit: int = 25) -> list[sqlite3.Row]:
        """Trabajos terminados, del más reciente al más viejo (para la Galería)."""
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM jobs WHERE status='done' "
                "ORDER BY created_at DESC LIMIT ?", (int(limit),)
            )
            return cur.fetchall()

    def incomplete(self) -> list[sqlite3.Row]:
        """Jobs que no terminaron (para reanudar tras un reinicio)."""
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM jobs WHERE status NOT IN ('done', 'error')"
            )
            return cur.fetchall()
