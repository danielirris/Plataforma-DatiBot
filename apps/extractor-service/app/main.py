"""FastAPI: endpoints de la API, subida de videos y servidor web."""
from __future__ import annotations

import io
import json
import logging
import shutil
import tempfile
import uuid
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.concurrency import run_in_threadpool

from app.config import BASE_DIR, get_settings
from app.jobs import manager
from app import library
from app.pipeline import tts
from app.tts_routes import router as tts_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("clip-generator")

settings = get_settings()

WEB_DIR = BASE_DIR / "web"
TEMPLATES = Jinja2Templates(directory=str(WEB_DIR / "templates"))

ALLOWED_EXT = {".mp4", ".mov", ".mkv"}
ALLOWED_AUDIO_EXT = {".mp3", ".m4a", ".wav", ".aac", ".ogg"}
ALLOWED_OVERLAY_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif",
                       ".mp4", ".mov", ".webm", ".m4v"}
ALLOWED_GUIDE_EXT = {".mp4", ".mov", ".webm", ".m4v", ".mkv"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Arranca el JobManager al iniciar la app."""
    settings.ensure_dirs()
    manager.start()
    logger.info("Aplicación iniciada (puerto %d).", settings.port)
    yield


app = FastAPI(title="clip-generator", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")
app.include_router(tts_router)  # /api/voces, /api/generar-voz


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    """Página de subida."""
    return TEMPLATES.TemplateResponse(
        "index.html",
        {
            "request": request,
            "max_upload_mb": settings.max_upload_mb,
            "num_clips": settings.num_clips,
        },
    )


@app.get("/healthz")
async def healthz() -> JSONResponse:
    """Healthcheck para EasyPanel."""
    return JSONResponse({"status": "ok"})


@app.get("/config", response_class=HTMLResponse)
async def config_page(request: Request) -> HTMLResponse:
    """Página de Configuración: biblioteca de música libre de derechos."""
    return TEMPLATES.TemplateResponse("config.html", {"request": request})


@app.get("/galeria", response_class=HTMLResponse)
async def galeria_page(request: Request) -> HTMLResponse:
    """Galería de los últimos trabajos terminados (videos reproducibles)."""
    return TEMPLATES.TemplateResponse("galeria.html", {"request": request})


@app.get("/api/galeria")
async def galeria_list() -> JSONResponse:
    """Lista los últimos trabajos terminados con sus videos."""
    return JSONResponse({"items": manager.gallery()})


@app.get("/api/jobs/{job_id}/thumb/{n}")
async def job_thumb(job_id: str, n: int) -> FileResponse:
    """Miniatura (primer frame) del clip ``n`` del job."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    thumb = manager.thumb_path(job_id, n)
    if not thumb:
        raise HTTPException(status_code=404, detail="Miniatura no disponible")
    return FileResponse(path=str(thumb), media_type="image/jpeg")


@app.get("/api/library/music")
async def library_list() -> JSONResponse:
    """Lista las pistas de la biblioteca de música."""
    return JSONResponse({"tracks": [p.name for p in library.list_music()]})


@app.post("/api/library/music")
async def library_add(files: list[UploadFile] = File(...)) -> JSONResponse:
    """Añade una o varias pistas (libres de derechos) a la biblioteca."""
    settings.ensure_dirs()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    added = 0
    for track in files:
        if not track.filename:
            continue
        tmp, name = await _save_upload(track, max_bytes, ALLOWED_AUDIO_EXT)
        library.save_music(tmp, name)
        added += 1
    return JSONResponse({"added": added, "tracks": [p.name for p in library.list_music()]})


@app.delete("/api/library/music/{name}")
async def library_delete(name: str) -> JSONResponse:
    """Borra una pista de la biblioteca."""
    if not library.delete_music(name):
        raise HTTPException(status_code=404, detail="Pista no encontrada")
    return JSONResponse({"tracks": [p.name for p in library.list_music()]})


@app.get("/api/config/prompt")
async def get_prompt() -> JSONResponse:
    """Devuelve el prompt de edición de Remotion (editable)."""
    return JSONResponse({"prompt": library.read_prompt()})


@app.post("/api/config/prompt")
async def set_prompt(payload: dict) -> JSONResponse:
    """Guarda el prompt de edición de Remotion."""
    text = str(payload.get("prompt", ""))
    library.write_prompt(text)
    return JSONResponse({"ok": True, "chars": len(text)})


async def _save_upload(
    file: UploadFile, max_bytes: int, allowed: set[str] = ALLOWED_EXT
) -> tuple[Path, str]:
    """Guarda un upload en un temporal con control de tamaño (streaming)."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado ({ext or 'sin extensión'}). "
                   f"Usa: {', '.join(sorted(allowed))}",
        )
    tmp = Path(tempfile.mkstemp(suffix=ext, dir=str(settings.storage_dir))[1])
    size = 0
    try:
        with open(tmp, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"'{file.filename}' supera el máximo de "
                               f"{settings.max_upload_mb} MB.",
                    )
                out.write(chunk)
    except HTTPException:
        tmp.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    if size == 0:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"'{file.filename}' está vacío.")
    return tmp, file.filename or f"video{ext}"


async def _download_url(url: str, max_bytes: int, allowed: set[str] = ALLOWED_EXT) -> tuple[Path, str]:
    """Descarga un video desde una URL pública a un temporal (streaming, con tope).

    Se usa cuando el editor recibe los videos ADJUNTOS al producto (por URL del
    servidor de archivos) en vez de una subida directa.
    """
    import urllib.parse
    import urllib.request

    name = Path(urllib.parse.urlparse(url).path).name or "video.mp4"
    ext = Path(name).suffix.lower()
    if ext not in allowed:
        ext = ".mp4"
        name = f"{Path(name).stem or 'video'}.mp4"
    tmp = Path(tempfile.mkstemp(suffix=ext, dir=str(settings.storage_dir))[1])

    def _do() -> int:
        size = 0
        req = urllib.request.Request(url, headers={"User-Agent": "datibot-editor"})
        with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError(f"supera el máximo de {settings.max_upload_mb} MB")
                out.write(chunk)
        return size

    try:
        size = await run_in_threadpool(_do)
    except Exception as exc:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail=f"No se pudo descargar '{name}' ({exc}).")
    if size == 0:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"'{name}' descargado vacío.")
    return tmp, name


@app.post("/api/jobs/from-urls")
async def create_job_from_urls(payload: dict = Body(...)) -> JSONResponse:
    """Crea un job a partir de URLs de video (los adjuntos al producto).

    El editor de Datibot manda aquí los videos que el usuario eligió del producto;
    el servicio los descarga y corre el mismo pipeline que una subida.
    """
    urls = [u for u in (payload.get("video_urls") or []) if isinstance(u, str) and u.strip()]
    if not urls:
        raise HTTPException(status_code=400, detail="No se enviaron videos.")
    mode = payload.get("mode") or "full"
    if mode not in ("montage", "ad", "full"):
        raise HTTPException(status_code=400, detail="Modo inválido (montage|ad|full).")
    num_clips = max(0, min(20, int(payload.get("num_clips") or 0)))
    use_music = bool(payload.get("use_music", False))
    use_intro = bool(payload.get("use_intro", False))
    style = str(payload.get("style") or "")
    params = {
        "subtitle_style": str(payload.get("subtitle_style") or ""),
        "highlight": str(payload.get("highlight") or ""),
        "font": str(payload.get("font") or "Anton"),
    }
    hook = payload.get("hook")
    if isinstance(hook, dict) and "video_idx" in hook:
        params["hook"] = {
            "video_idx": int(hook.get("video_idx", 0)),
            "start": float(hook.get("start", 0.0)),
            "dur": float(hook.get("dur", 2.0)),
        }

    settings.ensure_dirs()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    saved: list[tuple[Path, str]] = []
    intro_saved: tuple[Path, str] | None = None
    try:
        for url in urls[:20]:
            saved.append(await _download_url(url, max_bytes))
        if use_intro:
            whoosh = library.ensure_sfx().get("whoosh")
            if whoosh and whoosh.exists():
                itmp = Path(tempfile.mkstemp(suffix=whoosh.suffix,
                                             dir=str(settings.storage_dir))[1])
                shutil.copy(whoosh, itmp)
                intro_saved = (itmp, f"intro{whoosh.suffix}")
    except HTTPException:
        for tmp, _ in saved:
            tmp.unlink(missing_ok=True)
        if intro_saved:
            intro_saved[0].unlink(missing_ok=True)
        raise

    job_id = manager.submit(saved, [], mode, None, num_clips, [],
                            use_music=use_music, intro_tmp=intro_saved, style=style,
                            params=params)
    return JSONResponse({"job_id": job_id, "n_videos": len(saved), "mode": mode},
                        status_code=201)


@app.post("/api/jobs/from-files")
async def create_job_from_files(
    videos: list[UploadFile] = File(default=[]),
    voz: UploadFile | None = File(default=None),
    mode: str = Form("full"),
    num_clips: int = Form(0),
    use_music: str = Form("0"),
    use_intro: str = Form("0"),
    style: str = Form(""),
    subtitle_style: str = Form(""),
    highlight: str = Form(""),
    font: str = Form("Anton"),
    hook: str = Form(""),
) -> JSONResponse:
    """Igual que /api/jobs/from-urls pero el web MANDA LOS VIDEOS como archivos.

    Es el camino robusto: no depende de que la URL pública del video sea
    alcanzable (nginx/volumen/dominio). El web ya tiene el archivo y lo pasa por
    la red interna.
    """
    if mode not in ("montage", "ad", "full"):
        raise HTTPException(status_code=400, detail="Modo inválido (montage|ad|full).")
    settings.ensure_dirs()

    saved: list[tuple[Path, str]] = []
    for up in videos[:20]:
        if not up.filename:
            continue
        ext = Path(up.filename).suffix.lower() or ".mp4"
        if ext not in ALLOWED_EXT:
            ext = ".mp4"
        tmp = Path(tempfile.mkstemp(suffix=ext, dir=str(settings.storage_dir))[1])
        with tmp.open("wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        saved.append((tmp, up.filename))
    if not saved:
        raise HTTPException(status_code=400, detail="No se enviaron videos.")

    params: dict = {
        "subtitle_style": subtitle_style or "",
        "highlight": highlight or "",
        "font": font or "Anton",
    }
    if hook:
        try:
            h = json.loads(hook)
            if isinstance(h, dict) and "video_idx" in h:
                params["hook"] = {
                    "video_idx": int(h.get("video_idx", 0)),
                    "start": float(h.get("start", 0.0)),
                    "dur": float(h.get("dur", 2.0)),
                }
        except Exception:  # noqa: BLE001
            pass

    intro_saved: tuple[Path, str] | None = None
    if use_intro in ("1", "true", "True"):
        whoosh = library.ensure_sfx().get("whoosh")
        if whoosh and whoosh.exists():
            itmp = Path(tempfile.mkstemp(suffix=whoosh.suffix, dir=str(settings.storage_dir))[1])
            shutil.copy(whoosh, itmp)
            intro_saved = (itmp, f"intro{whoosh.suffix}")

    # Locución del usuario: manda sobre el video (duración) y de ella salen los
    # subtítulos (se transcribe), en vez del audio original de los videos.
    voz_saved: tuple[Path, str] | None = None
    if voz is not None and voz.filename:
        vext = Path(voz.filename).suffix.lower()
        if vext not in ALLOWED_AUDIO_EXT:
            for p, _ in saved:
                p.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Audio no soportado ({vext or 'sin extensión'}). "
                       f"Usa: {', '.join(sorted(ALLOWED_AUDIO_EXT))}.",
            )
        vtmp = Path(tempfile.mkstemp(suffix=vext, dir=str(settings.storage_dir))[1])
        with vtmp.open("wb") as f:
            while chunk := await voz.read(1 << 20):
                f.write(chunk)
        voz_saved = (vtmp, voz.filename)

    job_id = manager.submit(saved, [], mode, voz_saved, max(0, min(20, int(num_clips))), [],
                            use_music=use_music in ("1", "true", "True"),
                            intro_tmp=intro_saved, style=style or "", params=params)
    return JSONResponse({"job_id": job_id, "n_videos": len(saved), "mode": mode},
                        status_code=201)


@app.get("/api/styles")
async def list_styles() -> JSONResponse:
    """Catálogo de los 5 estilos de edición (para el selector del editor)."""
    from app.pipeline import styles
    items = [{"id": k, "nombre": v["nombre"]} for k, v in styles.STYLES.items()]
    return JSONResponse({"styles": items, "default": styles.DEFAULT_STYLE})


@app.post("/api/hooks")
async def hook_candidates(payload: dict = Body(...)) -> JSONResponse:
    """Analiza los videos y devuelve CANDIDATOS de gancho con miniatura.

    Es el "marco de referencia" del Hook visual (Fase 4): antes de generar, el
    usuario ve los momentos más potentes de sus videos y elige cuál abre el clip.
    """
    import subprocess

    from app.pipeline import analyze as _an
    from app.pipeline import audio as _audio
    from app.pipeline import transcribe as _tr

    urls = [u for u in (payload.get("video_urls") or []) if isinstance(u, str) and u.strip()]
    if not urls:
        raise HTTPException(status_code=400, detail="No se enviaron videos.")

    settings.ensure_dirs()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    session = uuid.uuid4().hex[:12]
    sess_dir = settings.storage_dir / "hooks" / session
    sess_dir.mkdir(parents=True, exist_ok=True)

    paths: list[Path] = []
    try:
        for url in urls[:20]:
            tmp, _name = await _download_url(url, max_bytes)
            paths.append(tmp)
    except HTTPException:
        for p in paths:
            p.unlink(missing_ok=True)
        shutil.rmtree(sess_dir, ignore_errors=True)
        raise

    def _work() -> list[dict]:
        segs_by_video: list[list] = []
        for i, src in enumerate(paths):
            if _audio.has_audio(src):
                ap = sess_dir / f"a{i}.wav"
                try:
                    _audio.extract_audio(src, ap)
                    segs_by_video.append(_tr.transcribe_audio(ap))
                except Exception:  # noqa: BLE001 — si falla, ese video va sin texto
                    segs_by_video.append([])
                finally:
                    ap.unlink(missing_ok=True)
            else:
                segs_by_video.append([])

        moments = _an.analyze_hooks(segs_by_video)
        cands: list[dict] = []
        for idx, m in enumerate(moments[:8]):
            if not (0 <= m.video_id < len(paths)):
                continue
            thumb_ok = False
            thumb = sess_dir / f"t{idx}.jpg"
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-ss", f"{max(0.0, m.start):.2f}",
                     "-i", str(paths[m.video_id]), "-frames:v", "1",
                     "-vf", "scale=270:-2", str(thumb)],
                    capture_output=True, check=True,
                )
                thumb_ok = thumb.is_file()
            except Exception:  # noqa: BLE001 — sin miniatura, seguimos con texto
                thumb_ok = False
            cands.append({
                "i": idx,
                "video_idx": m.video_id,
                "start": round(float(m.start), 2),
                "end": round(float(m.end), 2),
                "dur": round(max(0.6, float(m.end) - float(m.start)), 2),
                "score": round(float(m.score), 2),
                "razon": (m.razon or "").strip()[:140],
                "thumb": f"/api/hooks/{session}/thumb/{idx}" if thumb_ok else None,
            })
        return cands

    try:
        candidates = await run_in_threadpool(_work)
    finally:
        for p in paths:  # los videos ya no se necesitan; las miniaturas quedan
            p.unlink(missing_ok=True)

    if not candidates:
        shutil.rmtree(sess_dir, ignore_errors=True)
        raise HTTPException(status_code=422,
                            detail="No se encontraron ganchos claros en estos videos.")
    return JSONResponse({"session": session, "candidates": candidates})


@app.get("/api/hooks/{session}/thumb/{i}")
async def hook_thumb(session: str, i: int) -> FileResponse:
    """Sirve la miniatura de un candidato de gancho."""
    base = (settings.storage_dir / "hooks").resolve()
    thumb = (base / session / f"t{i}.jpg").resolve()
    if not str(thumb).startswith(str(base)) or not thumb.is_file():
        raise HTTPException(status_code=404, detail="Miniatura no encontrada.")
    return FileResponse(path=str(thumb), media_type="image/jpeg")


# ── B-rolls (clips de fondo para anuncios) — módulo aislado app/brolls/ ──
@app.post("/api/brolls")
async def crear_brolls(payload: dict = Body(...)) -> JSONResponse:
    """Lanza una tanda de B-rolls para un producto (job en segundo plano).

    Body: {producto: {...datos guardados...}, source: "veo"|"uploaded", config?: {...}}
    """
    from app.brolls import runner

    producto = payload.get("producto")
    if not isinstance(producto, dict) or not producto.get("id"):
        raise HTTPException(status_code=400, detail="Falta 'producto' (con id) en el cuerpo.")
    source = payload.get("source") or "veo"
    if source not in ("veo", "uploaded"):
        raise HTTPException(status_code=400, detail="source inválido (veo|uploaded).")
    if source == "uploaded" and not (producto.get("videos") or []):
        raise HTTPException(status_code=400,
                            detail="El producto no tiene videos subidos para recortar.")
    overrides = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    job_id = runner.start(str(producto["id"]), producto, source, overrides)
    return JSONResponse({"job_id": job_id, "source": source}, status_code=201)


@app.post("/api/brolls/upload")
async def crear_brolls_con_archivos(
    producto: str = Form(...),
    source: str = Form("uploaded"),
    config: str = Form("{}"),
    videos: list[UploadFile] = File(default=[]),
) -> JSONResponse:
    """Igual que /api/brolls pero el web MANDA LOS VIDEOS como archivos.

    Es el camino robusto: no hay que descargar nada por URL pública (que depende
    de nginx/volumen/dominio). El web ya tiene el archivo en su disco y nos lo
    pasa por la red interna.
    """
    from app.brolls import runner

    try:
        prod = json.loads(producto)
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="'producto' no es JSON válido.")
    if not isinstance(prod, dict) or not prod.get("id"):
        raise HTTPException(status_code=400, detail="Falta 'producto' (con id).")
    if source not in ("veo", "uploaded"):
        raise HTTPException(status_code=400, detail="source inválido (veo|uploaded).")
    try:
        overrides = json.loads(config) if config else {}
    except Exception:  # noqa: BLE001
        overrides = {}

    settings.ensure_dirs()
    guardados: list[Path] = []
    for up in videos:
        if not up.filename:
            continue
        dest = Path(tempfile.mkstemp(suffix=Path(up.filename).suffix or ".mp4",
                                     dir=str(settings.storage_dir))[1])
        with dest.open("wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        guardados.append(dest)

    if source == "uploaded" and not guardados:
        for p in guardados:
            p.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="No llegó ningún video del producto.")

    job_id = runner.start(str(prod["id"]), prod, source, overrides,
                          videos_locales=guardados or None)
    return JSONResponse({"job_id": job_id, "source": source, "videos": len(guardados)},
                        status_code=201)


@app.get("/api/brolls/jobs/{job_id}")
async def estado_brolls(job_id: str) -> JSONResponse:
    """Estado de la tanda de B-rolls; al terminar incluye los clips con su URL."""
    from app.brolls import runner

    st = runner.status(job_id)
    if not st:
        raise HTTPException(status_code=404, detail="Job no encontrado.")
    out = {k: st.get(k) for k in ("status", "progress", "done", "total", "message",
                                  "product_id", "source", "error")}
    res = st.get("result")
    if res:
        pid = res["product_id"]
        out["cost_usd"] = res["cost_usd"]
        out["clips"] = [{**c, "url": f"/api/brolls/{pid}/file/{c['file']}"}
                        for c in res["clips"]]
    return JSONResponse(out)


@app.get("/api/brolls/{product_id}/file/{name}")
async def broll_file(product_id: str, name: str) -> FileResponse:
    """Sirve un archivo de B-roll de un producto."""
    from app.brolls import store

    p = store.file_path(product_id, name)
    if not p:
        raise HTTPException(status_code=404, detail="B-roll no encontrado.")
    return FileResponse(path=str(p), media_type="video/mp4")


@app.post("/api/jobs")
async def create_job(
    files: list[UploadFile] = File(...),
    music: list[UploadFile] = File(None),
    voz: UploadFile | None = File(None),
    guias: list[UploadFile] = File(None),
    intro: UploadFile | None = File(None),
    mode: str = Form("montage"),
    num_clips: int = Form(0),
    use_music: str = Form("1"),
    use_intro: str = Form("0"),
    tts_texto: str = Form(""),
    tts_voz: str = Form(""),
    tts_velocidad: float = Form(0.0),
) -> JSONResponse:
    """Recibe varios videos (compendio) y varias pistas de música; crea un job.

    Returns:
        JSON con el ``job_id``.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No se enviaron videos.")
    if mode not in ("montage", "ad", "full"):
        raise HTTPException(status_code=400, detail="Modo inválido (montage|ad|full).")

    settings.ensure_dirs()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    saved: list[tuple[Path, str]] = []
    music_saved: list[tuple[Path, str]] = []
    guias_saved: list[tuple[Path, str]] = []
    voz_saved: tuple[Path, str] | None = None
    intro_saved: tuple[Path, str] | None = None
    try:
        for file in files:
            saved.append(await _save_upload(file, max_bytes))
        for track in (music or []):
            if track and track.filename:
                music_saved.append(await _save_upload(track, max_bytes, ALLOWED_AUDIO_EXT))
        for g in (guias or []):
            if g and g.filename:
                guias_saved.append(await _save_upload(g, max_bytes, ALLOWED_GUIDE_EXT))
        # Sonido de inicio: el subido o, si solo marcó la casilla, el whoosh de
        # la biblioteca (se copia a un temporal porque submit() lo MUEVE al job).
        if intro is not None and intro.filename:
            intro_saved = await _save_upload(intro, max_bytes, ALLOWED_AUDIO_EXT)
        elif use_intro == "1":
            whoosh = library.ensure_sfx().get("whoosh")
            if whoosh and whoosh.exists():
                itmp = Path(tempfile.mkstemp(suffix=whoosh.suffix,
                                             dir=str(settings.storage_dir))[1])
                shutil.copy(whoosh, itmp)
                intro_saved = (itmp, f"intro{whoosh.suffix}")
        if voz is not None and voz.filename:
            voz_saved = await _save_upload(voz, max_bytes, ALLOWED_AUDIO_EXT)
        elif tts_texto.strip():
            # Texto -> voz con ElevenLabs (la locución se genera, no se sube).
            if not tts.disponible():
                raise HTTPException(
                    status_code=503,
                    detail="Para generar la voz falta ELEVENLABS_API_KEY en el servidor.",
                )
            try:
                voz_path = await run_in_threadpool(
                    tts.generar_voz, tts_texto,
                    voz=(tts_voz or None),
                    velocidad=(tts_velocidad or None),
                    out_dir=settings.storage_dir / "tts",
                )
            except RuntimeError as exc:
                raise HTTPException(status_code=502, detail=str(exc))
            voz_saved = (voz_path, "voz_ia.mp3")
    except HTTPException:
        for tmp, _ in saved:
            tmp.unlink(missing_ok=True)
        for tmp, _ in music_saved:
            tmp.unlink(missing_ok=True)
        for tmp, _ in guias_saved:
            tmp.unlink(missing_ok=True)
        if voz_saved:
            voz_saved[0].unlink(missing_ok=True)
        if intro_saved:
            intro_saved[0].unlink(missing_ok=True)
        raise

    num_clips = max(0, min(20, num_clips))  # tope sano
    job_id = manager.submit(saved, music_saved, mode, voz_saved, num_clips, guias_saved,
                            use_music=(use_music != "0"), intro_tmp=intro_saved)
    return JSONResponse(
        {"job_id": job_id, "n_videos": len(saved), "music": len(music_saved),
         "guias": len(guias_saved), "voz": voz_saved is not None, "mode": mode},
        status_code=201,
    )


@app.get("/api/queue")
async def queue_info() -> JSONResponse:
    """Qué trabajos hay en cola y cuál se está procesando (hay un solo worker)."""
    return JSONResponse(manager.queue_info())


@app.post("/api/queue/reset")
async def queue_reset() -> JSONResponse:
    """Vacía la cola (cancela lo pendiente). El que ya corre no se interrumpe."""
    return JSONResponse(manager.reset_queue())


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str) -> JSONResponse:
    """Devuelve el estado del job."""
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return JSONResponse(job.public_dict())


@app.get("/api/jobs/{job_id}/download/{n}")
async def download_clip(job_id: str, n: int) -> FileResponse:
    """Descarga el clip ``n`` (1-indexado) del job."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    path = manager.clip_path(job_id, n)
    if not path:
        raise HTTPException(status_code=409, detail="El clip aún no está listo")
    return FileResponse(path=str(path), media_type="video/mp4",
                        filename=f"clip_{job_id}_{n}.mp4")


@app.get("/preview/{job_id}", response_class=HTMLResponse)
async def preview_page(request: Request, job_id: str) -> HTMLResponse:
    """Previsualización en vivo del anuncio (Remotion Player) antes de renderizar."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return TEMPLATES.TemplateResponse("preview.html", {"request": request, "job_id": job_id})


@app.get("/api/jobs/{job_id}/ad.json")
async def ad_json(job_id: str) -> FileResponse:
    """Sirve el ad.json (la 'receta') del proyecto para el reproductor."""
    p = manager.ad_json_path(job_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return FileResponse(path=str(p), media_type="application/json")


@app.get("/api/jobs/{job_id}/r/{path:path}")
async def ad_asset(job_id: str, path: str) -> FileResponse:
    """Sirve un asset del proyecto (video/música/sfx) para el reproductor."""
    p = manager.ad_asset_path(job_id, path)
    if not p:
        raise HTTPException(status_code=404, detail="Asset no encontrado")
    return FileResponse(path=str(p))


@app.post("/api/jobs/{job_id}/overlay")
async def upload_overlay(job_id: str, file: UploadFile = File(...)) -> JSONResponse:
    """Sube una imagen/video al proyecto para ponerlo encima (overlay)."""
    proj = manager.ad_project_dir(job_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_OVERLAY_EXT:
        raise HTTPException(status_code=400, detail="Formato no soportado para overlay")
    overlays = proj / "public" / "overlays"
    overlays.mkdir(parents=True, exist_ok=True)
    name = f"ov_{uuid.uuid4().hex[:8]}{ext}"
    max_bytes = settings.max_upload_mb * 1024 * 1024
    size = 0
    dest = overlays / name
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(status_code=413, detail="Archivo demasiado grande")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    return JSONResponse({"file": f"overlays/{name}"})


@app.post("/api/jobs/{job_id}/ad.json")
async def save_ad_json(job_id: str, payload: dict = Body(...)) -> JSONResponse:
    """Guarda el ad.json editado en el preview (textos, tiempos, emojis, etc.)."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    if not manager.save_ad_json(job_id, payload):
        raise HTTPException(status_code=400, detail="ad.json inválido")
    return JSONResponse({"ok": True})


@app.post("/api/jobs/{job_id}/render")
async def render_ad(job_id: str, payload: dict | None = Body(None)) -> JSONResponse:
    """Dispara el render. Si se envía 'ad', renderiza con esa versión editada."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    if payload and isinstance(payload.get("ad"), dict):
        manager.save_ad_json(job_id, payload["ad"])
    if not manager.request_render(job_id):
        raise HTTPException(status_code=409, detail="No se puede renderizar este trabajo")
    return JSONResponse({"ok": True})


@app.get("/api/jobs/{job_id}/project")
async def download_project(job_id: str) -> FileResponse:
    """Descarga el proyecto Remotion editable (.zip) del modo anuncio."""
    if not manager.get(job_id):
        raise HTTPException(status_code=404, detail="Job no encontrado")
    ad_zip = manager.ad_zip_path(job_id)
    if not ad_zip:
        raise HTTPException(status_code=409, detail="El proyecto aún no está listo")
    return FileResponse(path=str(ad_zip), media_type="application/zip",
                        filename=f"anuncio-remotion_{job_id}.zip")


@app.get("/api/jobs/{job_id}/download")
async def download_all(job_id: str):
    """Descarga los videos en un .zip (o el proyecto Remotion si no se renderizó)."""
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    paths = [manager.clip_path(job_id, i) for i in range(1, job.n_clips + 1)]
    paths = [p for p in paths if p]
    if not paths:
        # Modo anuncio sin render: entregamos el proyecto Remotion.
        if job.mode == "ad":
            ad_zip = manager.ad_zip_path(job_id)
            if ad_zip:
                return FileResponse(path=str(ad_zip), media_type="application/zip",
                                    filename=f"anuncio-remotion_{job_id}.zip")
        raise HTTPException(status_code=409, detail="El resultado aún no está listo")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
        for i, p in enumerate(paths, start=1):
            zf.write(p, arcname=f"clip_{i}.mp4")
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="clips_{job_id}.zip"'},
    )
