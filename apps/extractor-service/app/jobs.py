"""Cola secuencial de jobs, estado en memoria y orquestación del pipeline.

Un job procesa un COMPENDIO de videos y produce N clips verticales, cada uno
mezclando fragmentos de TODOS los videos (ganchos al inicio + cuerpo variado).

Diseñado para bajo uso de RAM: un único hilo trabajador procesa los jobs de a
UNO. El estado vive en un dict en memoria protegido por un lock. Sin Redis ni
Celery.
"""
from __future__ import annotations

import json
import logging
import queue
import random
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings, BASE_DIR
from app.pipeline import audio, transcribe, analyze, render, cleanup
from app.pipeline.compose import compose_clips
from app.pipeline.fragments import Beat, VideoSource, build_pool
from app.pipeline.remotion_export import export_remotion
from app.pipeline.ad_export import build_ad_project, AdVideo, ALLOWED_FONTS
from app.pipeline import ad_render
from app import library
from app.store import JobStore

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Estados posibles de un job."""

    QUEUED = "queued"
    EXTRACTING = "extracting"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    RENDERING = "rendering"
    DONE = "done"
    ERROR = "error"


# Progreso aproximado (0-100) asociado a cada estado, para la barra del front.
_PROGRESS = {
    JobStatus.QUEUED: 0,
    JobStatus.EXTRACTING: 10,
    JobStatus.TRANSCRIBING: 35,
    JobStatus.ANALYZING: 55,
    JobStatus.RENDERING: 70,
    JobStatus.DONE: 100,
    JobStatus.ERROR: 100,
}


@dataclass
class Job:
    """Estado de un job (un compendio de videos -> N clips)."""

    id: str
    filenames: list[str]
    status: JobStatus = JobStatus.QUEUED
    progress: int = 0
    message: str = "En cola"
    error: str = ""
    aviso: str = ""
    n_clips: int = 0
    mode: str = "montage"  # montage | ad | full (recorta + edita en un solo flujo)
    created_at: float = field(default_factory=time.time)
    output_dir: str | None = None

    def public_dict(self) -> dict[str, Any]:
        """Representación serializable para la API (sin rutas internas)."""
        d = asdict(self)
        d["status"] = self.status.value
        d["n_videos"] = len(self.filenames)
        done = self.status == JobStatus.DONE
        d["download_ready"] = done
        # Previsualización por video (clips de montaje o anuncios ya renderizados).
        d["clips"] = (
            [f"/api/jobs/{self.id}/download/{i}" for i in range(1, self.n_clips + 1)]
            if done and self.n_clips > 0 else []
        )
        d["download_url"] = f"/api/jobs/{self.id}/download" if done else None
        # En modo anuncio (o flujo completo): proyecto editable + preview en vivo.
        is_ad = done and self.mode in ("ad", "full")
        d["project_url"] = f"/api/jobs/{self.id}/project" if is_ad else None
        d["preview_url"] = f"/preview/{self.id}" if is_ad else None
        d.pop("output_dir", None)
        return d


class JobManager:
    """Gestiona la cola, el estado y el hilo trabajador único."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._jobs: dict[str, Job] = {}
        self._sources: dict[str, list[Path]] = {}
        self._music: dict[str, list[Path]] = {}
        self._guias: dict[str, list[Path]] = {}  # videos de guía por job (PiP)
        self._voz: dict[str, list[Path]] = {}  # una locución por anuncio
        self._req_clips: dict[str, int] = {}  # nº de clips pedido (0 = por defecto)
        self._use_music: dict[str, bool] = {}  # música de fondo opcional por job
        self._intro: dict[str, Path] = {}  # sonido de inicio opcional por job
        self._style: dict[str, str] = {}  # estilo de edición por job (5 estilos)
        self._params: dict[str, dict] = {}  # parámetros finos (subtítulo/color/fuente)
        self._lock = threading.Lock()
        self._queue: "queue.Queue[tuple[str, str]]" = queue.Queue()
        self._worker = threading.Thread(target=self._run_worker, daemon=True)
        self._started = False
        self._store = JobStore(self._settings.storage_dir / "jobs.db")

    # --- ciclo de vida ---
    def start(self) -> None:
        """Arranca el hilo trabajador (idempotente) y reanuda trabajos pendientes."""
        if not self._started:
            self._settings.ensure_dirs()
            self._recover()
            self._worker.start()
            self._started = True
            logger.info("JobManager iniciado.")

    def _recover(self) -> None:
        """Reanuda trabajos que quedaron a medias tras un reinicio del contenedor."""
        for row in self._store.incomplete():
            try:
                sources = [Path(p) for p in json.loads(row["sources"])]
                music = [Path(p) for p in json.loads(row["music"] or "[]")]
                guias = [Path(p) for p in json.loads((row["guias"] if "guias" in row.keys() else None) or "[]")]
                # 'voz' ahora es un JSON array (una locución por anuncio); los
                # jobs viejos lo tienen como ruta plana. Se aceptan ambos.
                voz_raw = row["voz"]
                voces: list[Path] = []
                if voz_raw:
                    try:
                        parsed = json.loads(voz_raw)
                        voces = ([Path(p) for p in parsed] if isinstance(parsed, list)
                                 else [Path(str(parsed))])
                    except (ValueError, TypeError):
                        voces = [Path(voz_raw)]  # formato viejo: ruta plana
                if not sources or not all(p.exists() for p in sources):
                    self._store.update(row["id"], {
                        "status": JobStatus.ERROR.value, "progress": 100,
                        "error": "Interrumpido por un reinicio; vuelve a subir los videos.",
                    })
                    continue
                job = Job(id=row["id"], filenames=json.loads(row["filenames"]),
                          created_at=row["created_at"], status=JobStatus.QUEUED,
                          mode=row["mode"], message="Reanudado tras reinicio")
                cols = row.keys()
                use_music = bool(row["use_music"]) if "use_music" in cols and row["use_music"] is not None else True
                intro = Path(row["intro"]) if "intro" in cols and row["intro"] else None
                style = row["style"] if "style" in cols and row["style"] else ""
                try:
                    params = json.loads(row["params"]) if "params" in cols and row["params"] else None
                except Exception:  # noqa: BLE001
                    params = None
                with self._lock:
                    self._jobs[job.id] = job
                    self._sources[job.id] = sources
                    if music:
                        self._music[job.id] = music  # lista de pistas
                    if guias:
                        self._guias[job.id] = guias
                    if voces:
                        self._voz[job.id] = voces
                    if row["num_clips_req"]:
                        self._req_clips[job.id] = int(row["num_clips_req"])
                    self._use_music[job.id] = use_music
                    if intro is not None and intro.exists():
                        self._intro[job.id] = intro
                    if style:
                        self._style[job.id] = style
                    if params:
                        self._params[job.id] = params
                self._store.update(row["id"], {"status": "queued", "progress": 0,
                                               "message": "Reanudado tras reinicio"})
                self._queue.put(("job", job.id))
                logger.info("Job %s reanudado tras reinicio", job.id)
            except Exception:  # noqa: BLE001
                logger.exception("No se pudo recuperar el job %s", row["id"])

    # --- API pública ---
    def submit(
        self,
        source_tmps: list[tuple[Path, str]],
        music_tmps: list[tuple[Path, str]] | None = None,
        mode: str = "montage",
        voz_tmps: list[tuple[Path, str]] | None = None,  # una locución por anuncio
        num_clips: int = 0,
        guias_tmps: list[tuple[Path, str]] | None = None,
        use_music: bool = True,
        intro_tmp: tuple[Path, str] | None = None,
        style: str = "",
        params: dict | None = None,
    ) -> str:
        """Registra un nuevo job, mueve los uploads a su carpeta y lo encola.

        Args:
            source_tmps: lista de (ruta_temporal, nombre_original) de los videos.
            music_tmps: lista de (ruta_temporal, nombre) de las pistas de música.

        Returns:
            El ``job_id`` generado.
        """
        job_id = uuid.uuid4().hex[:12]
        work_dir = self._settings.jobs_dir / job_id
        sources_dir = work_dir / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)

        paths: list[Path] = []
        filenames: list[str] = []
        for i, (tmp, name) in enumerate(source_tmps):
            ext = Path(name).suffix.lower() or ".mp4"
            dest = sources_dir / f"src_{i:03d}{ext}"
            shutil.move(str(tmp), str(dest))
            paths.append(dest)
            filenames.append(name)

        music_paths: list[Path] = []
        for i, (mtmp, mname) in enumerate(music_tmps or []):
            mext = Path(mname).suffix.lower() or ".mp3"
            mdest = sources_dir / f"music_{i:03d}{mext}"
            shutil.move(str(mtmp), str(mdest))
            music_paths.append(mdest)

        # Una locución por anuncio: se guardan en orden (voz_000, voz_001, …), y
        # ese orden es el mapeo audio i → clip i → anuncio i. NO reordenar.
        voz_paths: list[Path] = []
        for i, (vtmp, vname) in enumerate(voz_tmps or []):
            vext = Path(vname).suffix.lower() or ".mp3"
            vdest = sources_dir / f"voz_{i:03d}{vext}"
            shutil.move(str(vtmp), str(vdest))
            voz_paths.append(vdest)

        guia_paths: list[Path] = []
        for i, (gtmp, gname) in enumerate(guias_tmps or []):
            gext = Path(gname).suffix.lower() or ".mp4"
            gdest = sources_dir / f"guia_{i:03d}{gext}"
            shutil.move(str(gtmp), str(gdest))
            guia_paths.append(gdest)

        intro_path: Path | None = None
        if intro_tmp is not None:
            itmp, iname = intro_tmp
            iext = Path(iname).suffix.lower() or ".mp3"
            intro_path = sources_dir / f"intro{iext}"
            shutil.move(str(itmp), str(intro_path))

        job = Job(id=job_id, filenames=filenames, mode=mode)
        with self._lock:
            self._jobs[job_id] = job
            self._sources[job_id] = paths
            if music_paths:
                self._music[job_id] = music_paths
            if guia_paths:
                self._guias[job_id] = guia_paths
            if voz_paths:
                self._voz[job_id] = voz_paths
            if num_clips:
                self._req_clips[job_id] = int(num_clips)
            self._use_music[job_id] = bool(use_music)
            if intro_path is not None:
                self._intro[job_id] = intro_path
            if style:
                self._style[job_id] = style
            if params:
                self._params[job_id] = params
        self._store.save(id=job_id, filenames=filenames, status=JobStatus.QUEUED.value,
                         created_at=job.created_at, sources=paths, music=music_paths,
                         mode=mode, voz=voz_paths, num_clips_req=int(num_clips or 0),
                         guias=guia_paths, use_music=bool(use_music), intro=intro_path,
                         style=style, params=params)
        self._queue.put(("job", job_id))
        logger.info("Job %s encolado (modo=%s, %d videos, %d pistas)",
                    job_id, mode, len(paths), len(music_paths))
        return job_id

    def request_render(self, job_id: str) -> bool:
        """Encola el render del proyecto Remotion ya generado (anuncio o flujo completo)."""
        job = self.get(job_id)
        if not job or job.mode not in ("ad", "full") or not job.output_dir:
            return False
        if not (Path(job.output_dir) / "remotion-ad").exists():
            return False
        self._update(job_id, status=JobStatus.RENDERING, message="En cola para renderizar")
        self._queue.put(("render", job_id))
        return True

    def get(self, job_id: str) -> Job | None:
        """Devuelve el job por id (de memoria, o reconstruido desde SQLite)."""
        with self._lock:
            job = self._jobs.get(job_id)
        if job is not None:
            return job
        row = self._store.get_one(job_id)  # p.ej. job ya hecho antes de un reinicio
        if row is None:
            return None
        return Job(
            id=row["id"], filenames=json.loads(row["filenames"]),
            status=JobStatus(row["status"]), progress=row["progress"],
            message=row["message"], error=row["error"], aviso=row["aviso"],
            n_clips=row["n_clips"], mode=row["mode"], created_at=row["created_at"],
            output_dir=row["output_dir"],
        )

    def clip_path(self, job_id: str, n: int) -> Path | None:
        """Ruta del clip ``n`` (1-indexado) si el job está terminado."""
        job = self.get(job_id)
        if job and job.status == JobStatus.DONE and job.output_dir:
            p = Path(job.output_dir) / f"clip_{n}.mp4"
            return p if p.exists() else None
        return None

    def ad_project_dir(self, job_id: str) -> Path | None:
        """Carpeta del proyecto Remotion del job, o None."""
        job = self.get(job_id)
        if job and job.output_dir:
            p = Path(job.output_dir) / "remotion-ad"
            return p if p.exists() else None
        return None

    def ad_json_path(self, job_id: str) -> Path | None:
        """Ruta del ad.json del proyecto, o None."""
        proj = self.ad_project_dir(job_id)
        if proj and (proj / "ad.json").exists():
            return proj / "ad.json"
        return None

    def save_ad_json(self, job_id: str, data: Any) -> bool:
        """Sobrescribe el ad.json del proyecto con la versión editada en el preview."""
        proj = self.ad_project_dir(job_id)
        if not proj or not isinstance(data, dict) or "videos" not in data:
            return False
        (proj / "ad.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return True

    def ad_asset_path(self, job_id: str, rel: str) -> Path | None:
        """Ruta de un asset del proyecto (public/<rel>), validada contra escapes."""
        proj = self.ad_project_dir(job_id)
        if not proj:
            return None
        public = (proj / "public").resolve()
        target = (public / rel).resolve()
        if str(target).startswith(str(public)) and target.is_file():
            return target
        return None

    def thumb_path(self, job_id: str, n: int) -> Path | None:
        """Miniatura (primer frame) del clip ``n``, generada y cacheada con FFmpeg."""
        clip = self.clip_path(job_id, n)
        if not clip:
            return None
        thumb = clip.parent / f"thumb_{n}.jpg"
        if not thumb.exists():
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", "0.6", "-i", str(clip),
                     "-frames:v", "1", "-vf", "scale=360:-2", str(thumb)],
                    capture_output=True, check=True,
                )
            except Exception:  # noqa: BLE001 - si falla, la galería usa el <video>
                return None
        return thumb if thumb.exists() else None

    def gallery(self, limit: int | None = None) -> list[dict]:
        """Lista los últimos trabajos terminados con sus videos reproducibles.

        Devuelve, del más reciente al más viejo, los jobs ``done`` que tengan al
        menos un video reproducible (o, en modo anuncio sin render, su proyecto).
        """
        limit = limit or self._settings.galeria_max
        items: list[dict] = []
        for row in self._store.recent_done(limit):
            job = self.get(row["id"])
            if not job or job.status != JobStatus.DONE:
                continue
            clips = [f"/api/jobs/{job.id}/download/{i}"
                     for i in range(1, job.n_clips + 1) if self.clip_path(job.id, i)]
            is_ad = job.mode in ("ad", "full")
            has_proj = is_ad and self.ad_project_dir(job.id) is not None
            if not clips and not has_proj:
                continue  # nada que mostrar (output ya purgado)
            items.append({
                "id": job.id,
                "created_at": job.created_at,
                "mode": job.mode,
                "n_clips": len(clips),
                "title": (job.filenames[0] if job.filenames else job.id),
                "n_videos": len(job.filenames),
                "clips": clips,
                "thumb": f"/api/jobs/{job.id}/thumb/1" if clips else None,
                "project_url": f"/api/jobs/{job.id}/project" if has_proj else None,
                "preview_url": f"/preview/{job.id}" if has_proj else None,
            })
        return items

    def ad_zip_path(self, job_id: str) -> Path | None:
        """Ruta del .zip del proyecto Remotion (modo anuncio) si está listo."""
        job = self.get(job_id)
        if job and job.status == JobStatus.DONE and job.output_dir:
            p = Path(job.output_dir) / "anuncio-remotion.zip"
            return p if p.exists() else None
        return None

    # --- internos ---
    def _update(self, job_id: str, **kwargs: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            for key, value in kwargs.items():
                setattr(job, key, value)
            if "status" in kwargs:
                job.progress = _PROGRESS.get(job.status, job.progress)
            progress = job.progress
        # Replica en SQLite (fuera del lock).
        fields: dict[str, Any] = {}
        for key, value in kwargs.items():
            if key == "status":
                fields["status"] = value.value if isinstance(value, JobStatus) else value
                fields["progress"] = progress
            elif key in ("message", "error", "aviso", "n_clips", "output_dir"):
                fields[key] = value
        self._store.update(job_id, fields)

    # Estados de un job que ya está siendo procesado por el worker.
    _EN_PROCESO = (JobStatus.EXTRACTING, JobStatus.TRANSCRIBING,
                   JobStatus.ANALYZING, JobStatus.RENDERING)

    def queue_info(self) -> dict:
        """Qué hay en la cola: lo que espera y lo que se está procesando.

        Hay UN worker: los trabajos se hacen de uno en uno, así que todo lo que
        esté en cola espera a que termine el de arriba.
        """
        def resumen(j: Job) -> dict:
            return {"id": j.id, "estado": j.status.value, "modo": j.mode,
                    "creado": j.created_at, "mensaje": j.message,
                    "videos": len(j.filenames)}

        with self._lock:
            jobs = list(self._jobs.values())
        en_cola = [resumen(j) for j in jobs if j.status == JobStatus.QUEUED]
        en_proceso = [resumen(j) for j in jobs if j.status in self._EN_PROCESO]
        en_cola.sort(key=lambda d: d["creado"] or "")
        return {"en_cola": en_cola, "en_proceso": en_proceso,
                "total_en_cola": len(en_cola)}

    def reset_queue(self) -> dict:
        """Vacía la cola: descarta lo pendiente y lo marca como cancelado.

        El trabajo EN CURSO no se puede interrumpir (corre en el hilo del
        worker); terminará o fallará solo, pero ya no arrastra a los demás.
        """
        descartados: list[str] = []
        while True:
            try:
                _kind, job_id = self._queue.get_nowait()
            except queue.Empty:
                break
            descartados.append(job_id)
            self._queue.task_done()

        for jid in descartados:
            self._update(jid, status=JobStatus.ERROR, progress=100,
                         message="Cancelado",
                         error="Cancelado al vaciar la cola.")
        logger.info("Cola vaciada: %d trabajo(s) cancelado(s)", len(descartados))
        with self._lock:
            en_curso = [j.id for j in self._jobs.values() if j.status in self._EN_PROCESO]
        return {"cancelados": len(descartados), "en_curso": en_curso}

    def _run_worker(self) -> None:
        """Bucle del trabajador: procesa jobs de la cola de a uno."""
        cleanup.purge_keep_recent(
            self._settings.outputs_dir, self._settings.galeria_max
        )
        while True:
            kind, job_id = self._queue.get()
            try:
                if kind == "render":
                    self._render_existing_ad(job_id)
                else:
                    self._process(job_id)
            except Exception as exc:  # noqa: BLE001 - el job no debe tumbar el hilo
                logger.exception("Error inesperado procesando job %s", job_id)
                self._update(
                    job_id, status=JobStatus.ERROR,
                    message="Error inesperado", error=str(exc),
                )
            finally:
                self._queue.task_done()

    def _process(self, job_id: str) -> None:
        """Ejecuta el pipeline completo para un job (compendio -> N clips)."""
        settings = self._settings
        sources = self._sources.get(job_id, [])
        if not sources:
            self._update(job_id, status=JobStatus.ERROR, error="Sin videos en el job")
            return

        work_dir = settings.jobs_dir / job_id
        output_dir = settings.outputs_dir / job_id

        job = self.get(job_id)
        if job and job.mode == "ad":
            self._process_ad(job_id, sources, work_dir, output_dir)
            return
        if job and job.mode == "full":
            self._process_full(job_id, sources, work_dir, output_dir)
            return

        try:
            clip_paths, aviso, result = self._montage_stage(
                job_id, sources, work_dir, output_dir,
                music_paths=self._music.get(job_id, []),
            )

            # Exportar proyecto Remotion editable.
            if settings.remotion_export:
                self._update(job_id, status=JobStatus.RENDERING,
                             message="Exportando proyecto Remotion")
                export_remotion(output_dir, result)

            self._update(
                job_id, status=JobStatus.DONE, message="Completado",
                n_clips=len(result.clips), aviso=aviso, output_dir=str(output_dir),
            )
            logger.info(
                "Job %s completado: %d clips, %d beats únicos",
                job_id, len(result.clips), result.beats_unicos,
            )

        except Exception as exc:  # noqa: BLE001
            logger.exception("Fallo en el pipeline del job %s", job_id)
            self._update(
                job_id, status=JobStatus.ERROR,
                message="Error en el procesamiento", error=str(exc),
            )
        finally:
            # Limpieza: borra temporales y videos fuente (deja solo los clips).
            cleanup.cleanup_job_dir(work_dir)
            self._pop_job_state(job_id)
            cleanup.purge_keep_recent(settings.outputs_dir, settings.galeria_max)

    def _pop_job_state(self, job_id: str) -> None:
        """Libera el estado en memoria asociado a un job ya procesado."""
        with self._lock:
            for d in (self._sources, self._music, self._guias, self._voz,
                      self._req_clips, self._use_music, self._intro, self._style,
                      self._params):
                d.pop(job_id, None)

    def _montage_stage(
        self,
        job_id: str,
        sources: list[Path],
        work_dir: Path,
        clips_out_dir: Path,
        music_paths: list[Path],
    ) -> tuple[list[Path], str, Any]:
        """Etapa de RECORTE: transcribe, detecta ganchos, compone y renderiza N clips.

        Devuelve (rutas de los clips, aviso, RenderResult). Con ``music_paths``
        vacío los clips conservan el audio original (necesario para encadenar la
        edición del flujo completo, que transcribe esa voz).
        """
        settings = self._settings

        # 1) Extraer audio + medir duración + 2) transcribir, por video.
        videos: list[VideoSource] = []
        segments_by_video: dict[int, list] = {}
        for vid, src in enumerate(sources):
            self._update(
                job_id, status=JobStatus.EXTRACTING,
                message=f"Procesando audio {vid + 1}/{len(sources)}",
            )
            # Duración de la PISTA DE VIDEO, no del contenedor: si el audio dura
            # más que la imagen, trocear hasta el contenedor deja un fragmento sin
            # frames y el concat del montaje revienta ("matches no streams").
            duration = audio.probe_video_duration(src)
            if audio.has_audio(src):
                audio_path = work_dir / f"audio_{vid:03d}.wav"
                audio.extract_audio(src, audio_path)

                self._update(
                    job_id, status=JobStatus.TRANSCRIBING,
                    message=f"Transcribiendo {vid + 1}/{len(sources)}",
                )
                segs = transcribe.transcribe_audio(audio_path)
                audio_path.unlink(missing_ok=True)  # ya no se necesita
            else:
                logger.info("Video %d sin pista de audio: se omite la transcripción", vid)
                segs = []

            videos.append(VideoSource(id=vid, path=src, duration=duration,
                                      name=self.get(job_id).filenames[vid], segments=segs))
            segments_by_video[vid] = segs

        # 3) Analizar ganchos (impactantes) sobre todos los videos.
        self._update(job_id, status=JobStatus.ANALYZING, message="Detectando ganchos")
        moments = analyze.analyze_hooks([v.segments for v in videos])

        # Construir pool y componer N clips (cortes de duración variable).
        rng = random.Random(f"{settings.seed}:{job_id}")
        pool = build_pool(videos, rng, settings.beat_min_s, settings.beat_max_s)
        # Un audio por anuncio: si hay locuciones, mandan ELLAS el nº de anuncios.
        voces = self._voz.get(job_id) or []
        n_clips = len(voces) if voces else max(1, self._req_clips.get(job_id) or settings.num_clips)
        # Las transiciones (xfade) solapan y acortan el clip; compensamos
        # componiendo un poco más de material para acabar cerca de la duración.
        buffer_s = 0.0
        if settings.transiciones:
            avg_trans = (settings.trans_min + settings.trans_max) / 2
            buffer_s = avg_trans * settings.trans_dur_s
        # Gancho VISUAL elegido por el usuario (Fase 4): abre todos los clips.
        forced_hook = None
        hook = (self._params.get(job_id, {}) or {}).get("hook")
        if isinstance(hook, dict):
            vi = int(hook.get("video_idx", -1))
            if 0 <= vi < len(sources):
                start = max(0.0, float(hook.get("start", 0.0)))
                dur = max(0.6, min(5.0, float(hook.get("dur", 2.0))))
                forced_hook = Beat(vi, sources[vi], round(start, 3), round(dur, 3))

        # LA LOCUCIÓN MANDA: cada anuncio dura lo que su propio audio. Sin audio,
        # el clip cae a la duración fija por defecto (~48s) como antes.
        duraciones: list[float] = []
        for k in range(n_clips):
            d = float(settings.duracion_total_s)
            if k < len(voces):
                try:
                    dv = audio.probe_duration(voces[k])
                    if dv > 0.5:
                        d = dv
                except Exception as e:  # noqa: BLE001
                    logger.warning("No pude medir la locución %d (%s); uso %.0fs", k, e, d)
            duraciones.append(d + buffer_s)  # el buffer va POR clip, no una vez

        clips = compose_clips(
            pool, moments, videos, rng,
            num_clips=n_clips,
            duraciones_s=duraciones,
            hook_beats=settings.hook_beats,
            beat_min=settings.beat_min_s,
            beat_max=settings.beat_max_s,
            forced_hook=forced_hook,
        )

        # 4) Render de los N clips (beats cacheados, transiciones, música).
        self._update(
            job_id, status=JobStatus.RENDERING,
            message=f"Renderizando {n_clips} clips",
        )
        video_names = {v.id: v.name for v in videos}
        result = render.render_clips(
            clips, segments_by_video, video_names, work_dir, clips_out_dir, rng,
            modo_fondo=settings.modo_fondo,
            subtitulos=settings.subtitulos_recortes,  # sin subtítulos (los pone la edición)
            transiciones=settings.transiciones,
            trans_min=settings.trans_min,
            trans_max=settings.trans_max,
            modo_transicion=settings.modo_transicion,
            trans_dur=settings.trans_dur_s,
            music_paths=music_paths,
            threads=settings.effective_ffmpeg_threads,
        )

        aviso = ""
        if len(pool) < settings.min_fragmentos:
            aviso = (
                f"Pool de {len(pool)} fragmentos (< {settings.min_fragmentos} "
                f"recomendado): los clips reutilizan más material."
            )

        clip_paths = [clips_out_dir / f"clip_{i}.mp4"
                      for i in range(1, len(result.clips) + 1)]
        return [p for p in clip_paths if p.exists()], aviso, result

    def _process_full(self, job_id: str, sources: list[Path],
                      work_dir: Path, output_dir: Path) -> None:
        """Flujo COMPLETO (una sola fase): recorta los mejores momentos y pasa los
        clips directo a la edición del anuncio (subtítulos, animaciones, CTA)."""
        montage_dir = work_dir / "montage"
        try:
            # Recorte SIN música: los clips conservan la voz original, que es la
            # que transcribe y subtitula la edición. La música va en la edición.
            clip_paths, aviso, _ = self._montage_stage(
                job_id, sources, work_dir, montage_dir, music_paths=[],
            )
            if not clip_paths:
                raise RuntimeError("El recorte no produjo clips")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Fallo en el recorte del flujo completo (%s)", job_id)
            self._update(job_id, status=JobStatus.ERROR,
                         message="Error en el recorte", error=str(exc))
            cleanup.cleanup_job_dir(work_dir)
            self._pop_job_state(job_id)
            return

        if aviso:
            self._update(job_id, aviso=aviso)

        # Los clips del recorte pasan a ser los videos de la edición.
        nombres = [f"Anuncio {i + 1}" for i in range(len(clip_paths))]
        with self._lock:
            j = self._jobs.get(job_id)
            if j:
                j.filenames = nombres
        self._store.update(job_id, {"filenames": json.dumps(nombres)})

        self._process_ad(job_id, clip_paths, work_dir, output_dir)

    def _process_ad(self, job_id: str, sources: list[Path],
                    work_dir: Path, output_dir: Path) -> None:
        """Modo anuncio: genera un proyecto Remotion (1 composición por video)."""
        settings = self._settings
        # Música: OPCIONAL. Si el job la desactivó va sin música; si la activó,
        # usa la subida o, en su defecto, la biblioteca (libre de derechos).
        use_music = self._use_music.get(job_id, True)
        music_paths = (self._music.get(job_id) or library.list_music()) if use_music else []
        sfx = library.ensure_sfx()  # whoosh/pop/ding generados, sin copyright
        intro = self._intro.get(job_id)  # sonido de inicio opcional
        # UNA locución por anuncio: el anuncio (clip) i usa la voz i. Si solo hay
        # una voz, se aplica a todos (compat con el modo de un audio).
        voces = self._voz.get(job_id) or []
        try:
            videos: list[AdVideo] = []
            for vid, src in enumerate(sources):
                width, height = audio.probe_resolution(src)
                voz_i = (voces[vid] if vid < len(voces)
                         else (voces[0] if len(voces) == 1 else None))
                if voz_i is not None:
                    # La locución de ESTE anuncio manda: dura lo que ella y de ella
                    # salen los subtítulos. Se transcribe la suya, no una común.
                    self._update(job_id, status=JobStatus.TRANSCRIBING,
                                 message=f"Transcribiendo la locución {vid + 1}/{len(sources)}")
                    words = transcribe.transcribe_words(voz_i) or []
                    duration = audio.probe_duration(voz_i) or audio.probe_duration(src)
                else:
                    self._update(job_id, status=JobStatus.EXTRACTING,
                                 message=f"Procesando audio {vid + 1}/{len(sources)}")
                    duration = audio.probe_duration(src)
                    if audio.has_audio(src):
                        audio_path = work_dir / f"audio_{vid:03d}.wav"
                        audio.extract_audio(src, audio_path)
                        self._update(job_id, status=JobStatus.TRANSCRIBING,
                                     message=f"Transcribiendo (palabras) {vid + 1}/{len(sources)}")
                        words = transcribe.transcribe_words(audio_path)
                        audio_path.unlink(missing_ok=True)
                    else:
                        logger.info("Video %d (anuncio) sin audio: sin subtítulos", vid)
                        words = []

                music = music_paths[vid % len(music_paths)] if music_paths else None
                videos.append(AdVideo(
                    id=vid, path=src, name=self.get(job_id).filenames[vid],
                    width=width, height=height, duration=duration,
                    words=words, music=music, voz=voz_i,
                ))

            # Director de edición: la IA, leyendo la voz con timestamps, decide el
            # plan completo por video (estilo, full-screen, píldoras, emojis...).
            self._update(job_id, status=JobStatus.ANALYZING,
                         message="Diseñando la edición (IA)")
            from app.pipeline import styles
            style_id = self._style.get(job_id, "")
            usar_estilo = bool(styles.STYLES.get(style_id))
            # Con estilo elegido: sus lineamientos guían a la IA. Sin estilo
            # (flujo viejo): el prompt genérico + paleta aleatoria, como antes.
            prompt_text = styles.style_prompt(style_id) if usar_estilo else library.read_prompt()
            # Parámetros finos del editor (overrides sobre el estilo).
            params = self._params.get(job_id, {}) or {}
            sub_over = str(params.get("subtitle_style") or "").strip().lower()
            highlight = str(params.get("highlight") or "").strip()
            import re as _re
            # La fuente: si el usuario eligió una en el editor, manda; si dejó
            # "Automático" (vacío), usa la del estilo (Parte B: cada estilo su
            # tipografía). Sin estilo, Anton como siempre.
            font_user = str(params.get("font") or "").strip()
            font = font_user if font_user in ALLOWED_FONTS else (
                styles.style_font(style_id) if usar_estilo else "Anton")
            for v in videos:
                v.plan = analyze.plan_ad(v.words, v.duration, prompt_text)
                seed = f"{settings.seed}:{job_id}:{v.id}"
                if usar_estilo:
                    # El estilo FUERZA subtítulo, intensidad, topes y paleta.
                    styles.apply_style(v.plan, style_id, seed)
                else:
                    pal = analyze.random_palette(seed)
                    v.plan["palette"] = pal
                    v.plan["accent"] = pal[0]
                # Overrides finos elegidos por el usuario (mandan sobre el estilo).
                if sub_over in {"pop", "karaoke", "box", "punch", "color"}:
                    v.plan["subtitle_style"] = sub_over
                if _re.fullmatch(r"#[0-9A-Fa-f]{6}", highlight):
                    v.plan["highlight"] = highlight.upper()

            self._update(job_id, status=JobStatus.RENDERING,
                         message="Generando proyecto Remotion (anuncio)")
            build_ad_project(
                videos, output_dir,
                cta_texto=settings.cta_texto, whatsapp=settings.whatsapp_link,
                vol=settings.musica_volumen, vol_duck=settings.musica_volumen_ducking,
                sfx=sfx, guides=self._guias.get(job_id, []),
                intro=intro, font=font,
            )
            # Empaquetar el proyecto editable (.zip).
            shutil.make_archive(str(output_dir / "anuncio-remotion"), "zip",
                                str(output_dir / "remotion-ad"))

            # Con preview_first: NO renderizamos aún; mostramos la previsualización
            # y el render se dispara con request_render (botón "Renderizar"). Pero
            # un job puede pedir auto_render (editor suelto, sin acceso al preview):
            # entonces se renderiza solo, sin esperar.
            auto_render = bool(self._params.get(job_id, {}).get("auto_render"))
            if settings.preview_first and not auto_render:
                self._update(job_id, status=JobStatus.DONE, n_clips=0,
                             message="Listo para previsualizar", output_dir=str(output_dir))
                logger.info("Job %s (anuncio) generado; esperando preview/render", job_id)
            else:
                self._render_existing_ad(job_id, output_dir=output_dir, videos_n=len(videos))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Fallo en el modo anuncio del job %s", job_id)
            self._update(job_id, status=JobStatus.ERROR,
                         message="Error en el procesamiento", error=str(exc))
        finally:
            cleanup.cleanup_job_dir(work_dir)
            self._pop_job_state(job_id)
            cleanup.purge_keep_recent(settings.outputs_dir, settings.galeria_max)

    def _render_existing_ad(self, job_id: str, output_dir: Path | None = None,
                            videos_n: int | None = None) -> None:
        """Renderiza el proyecto Remotion ya generado a clip_N.mp4 (bajo demanda)."""
        settings = self._settings
        output_dir = output_dir or (settings.outputs_dir / job_id)
        project_dir = output_dir / "remotion-ad"
        if not project_dir.exists():
            self._update(job_id, status=JobStatus.ERROR, error="Proyecto no encontrado")
            return
        if not (settings.renderizar_anuncio and ad_render.render_available()):
            self._update(job_id, status=JobStatus.DONE, n_clips=0,
                         message="Listo para previsualizar",
                         aviso="Este servidor no renderiza video (sin Node); usa el proyecto.",
                         output_dir=str(output_dir))
            return
        self._update(job_id, status=JobStatus.RENDERING,
                     message="Renderizando anuncio (Remotion)")
        try:
            rendered = ad_render.render_ad_project(project_dir, output_dir)
            n = len(rendered)
            aviso = ""
        except Exception as exc:  # noqa: BLE001
            logger.exception("Render del anuncio falló (%s)", job_id)
            n = 0
            aviso = f"No se pudo renderizar ({exc}); usa el proyecto editable."
        link = project_dir / "node_modules"
        if link.is_symlink():
            link.unlink()
        self._update(job_id, status=JobStatus.DONE, n_clips=n, aviso=aviso,
                     message="Completado", output_dir=str(output_dir))
        logger.info("Job %s (anuncio) renderizado: %d video(s)", job_id, n)


# Instancia global única.
manager = JobManager()
