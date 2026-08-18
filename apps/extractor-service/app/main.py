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


def _clean_hook_list(raw: object) -> list[dict | None]:
    """Normaliza la lista de ganchos elegidos (uno por anuncio, EN ORDEN).

    El índice = nº de anuncio, así que la POSICIÓN se conserva: una entrada válida
    -> {"video_idx", "start", "dur"}; una inválida -> ``None`` (ese anuncio queda en
    automático) SIN correr los demás. Se recortan los ``None`` finales (anuncios sin
    gancho al final = automático por defecto). Si no queda nada, devuelve ``[]``.
    """
    if not isinstance(raw, list):
        return []
    out: list[dict | None] = []
    for h in raw[:20]:
        if not (isinstance(h, dict) and "video_idx" in h):
            out.append(None)
            continue
        try:
            out.append({
                "video_idx": int(h.get("video_idx", 0)),
                "start": float(h.get("start", 0.0)),
                "dur": float(h.get("dur", 2.0)),
            })
        except (TypeError, ValueError):
            out.append(None)
    while out and out[-1] is None:
        out.pop()
    return out


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
    params: dict = {
        "subtitle_style": str(payload.get("subtitle_style") or ""),
        "highlight": str(payload.get("highlight") or ""),
        # "" (no "Anton"): jobs.py usa la fuente PROPIA del estilo (style_font).
        # Forzar Anton hacía que los 5 estilos se vieran iguales.
        "font": str(payload.get("font") or ""),
    }
    # Paridad con from-files: CTA / oferta / trim (antes se perdían por este camino).
    if payload.get("trim_silence"):
        params["trim_silence"] = True
    params["use_cta"] = bool(payload.get("use_cta", True))
    params["cta_wa"] = bool(payload.get("cta_wa", True))
    if str(payload.get("cta_texto") or "").strip():
        params["cta_texto"] = str(payload["cta_texto"]).strip()[:80]
    if str(payload.get("cta_boton") or "").strip():
        params["cta_boton"] = str(payload["cta_boton"]).strip()[:24]
    if str(payload.get("oferta_pill") or "").strip():
        params["oferta_pill"] = str(payload["oferta_pill"]).strip()[:60]
    if isinstance(payload.get("producto"), dict):
        params["producto"] = payload["producto"]
    for campo in ("ganchos", "titulos"):
        arr = payload.get(campo)
        if isinstance(arr, list):
            params[campo] = [str(x or "") for x in arr]
    hook = payload.get("hook")
    if isinstance(hook, dict) and "video_idx" in hook:
        try:
            params["hook"] = {
                "video_idx": int(hook.get("video_idx", 0)),
                "start": float(hook.get("start", 0.0)),
                "dur": float(hook.get("dur", 2.0)),
            }
        except (TypeError, ValueError):
            pass  # gancho único malformado: se ignora (no rompe el job)
    hooks_clean = _clean_hook_list(payload.get("hooks"))
    if hooks_clean:
        params["hooks"] = hooks_clean

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
    voz: list[UploadFile] = File(default=[]),  # una locución por anuncio, en orden
    hook_videos: list[UploadFile] = File(default=[]),  # gancho SUBIDO por anuncio
    guias: list[UploadFile] = File(default=[]),  # video-GUÍA sobrepuesto (PiP), opcional
    mode: str = Form("full"),
    num_clips: int = Form(0),
    use_music: str = Form("0"),
    use_intro: str = Form("0"),
    style: str = Form(""),
    subtitle_style: str = Form(""),
    highlight: str = Form(""),
    font: str = Form(""),
    hook: str = Form(""),
    hooks: str = Form(""),         # JSON array: gancho VISUAL por anuncio (opcional)
    auto_render: str = Form(""),
    trim_silence: str = Form(""),  # recortar silencios de la locución
    use_cta: str = Form("1"),      # poner o no la llamada a la acción final
    cta_texto: str = Form(""),     # título del CTA (si vacío, el de config)
    cta_boton: str = Form(""),     # etiqueta del botón (WhatsApp →, Pídelo ahora…)
    cta_wa: str = Form("1"),       # el botón es WhatsApp (verde) o genérico (acento)
    oferta_pill: str = Form(""),   # texto de la píldora de oferta a mitad (opcional)
    producto: str = Form(""),      # JSON del producto (avatar/oferta) para el brief del cerebro
    ganchos: str = Form(""),       # JSON array: gancho de texto por anuncio (opcional)
    titulos: str = Form(""),       # JSON array: título por anuncio (opcional)
    hook_meta: str = Form(""),     # JSON array [{ad, secs}] alineado a hook_videos
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
        # "" (no "Anton"): jobs.py usa la fuente propia del estilo (ver from-urls).
        "font": font or "",
    }
    # Render automático para ESTE trabajo, sin depender del preview_first global.
    # Lo pide el editor suelto (subdominio): quien lo usa no tiene acceso a la
    # página de preview del extractor, así que el anuncio debe renderizarse solo.
    if auto_render in ("1", "true", "True"):
        params["auto_render"] = True
    if trim_silence in ("1", "true", "True"):
        params["trim_silence"] = True
    # Controles de CTA / oferta.
    params["use_cta"] = use_cta in ("1", "true", "True")
    params["cta_wa"] = cta_wa in ("1", "true", "True")
    if cta_texto.strip():
        params["cta_texto"] = cta_texto.strip()[:80]
    if cta_boton.strip():
        params["cta_boton"] = cta_boton.strip()[:24]
    if oferta_pill.strip():
        params["oferta_pill"] = oferta_pill.strip()[:60]
    if producto.strip():
        try:
            pj = json.loads(producto)
            if isinstance(pj, dict):
                params["producto"] = pj
        except Exception:  # noqa: BLE001 - el brief es opcional
            pass
    for campo, raw in (("ganchos", ganchos), ("titulos", titulos)):
        if raw.strip():
            try:
                arr = json.loads(raw)
                if isinstance(arr, list):
                    params[campo] = [str(x or "") for x in arr]
            except Exception:  # noqa: BLE001 - opcional
                pass
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
    if hooks:
        try:
            hooks_clean = _clean_hook_list(json.loads(hooks))
            if hooks_clean:
                params["hooks"] = hooks_clean
        except Exception:  # noqa: BLE001 — la lista de ganchos es opcional
            pass

    intro_saved: tuple[Path, str] | None = None
    if use_intro in ("1", "true", "True"):
        whoosh = library.ensure_sfx().get("whoosh")
        if whoosh and whoosh.exists():
            itmp = Path(tempfile.mkstemp(suffix=whoosh.suffix, dir=str(settings.storage_dir))[1])
            shutil.copy(whoosh, itmp)
            intro_saved = (itmp, f"intro{whoosh.suffix}")

    # Locución del usuario: UNA por anuncio, en orden. Mandan sobre la duración y
    # de ellas salen los subtítulos, en vez del audio original de los videos.
    voces_saved: list[tuple[Path, str]] = []
    for up in voz:
        if not up.filename:
            continue
        vext = Path(up.filename).suffix.lower()
        if vext not in ALLOWED_AUDIO_EXT:
            for p, _ in saved:
                p.unlink(missing_ok=True)
            for vp, _ in voces_saved:
                vp.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Audio no soportado ({vext or 'sin extensión'}). "
                       f"Usa: {', '.join(sorted(ALLOWED_AUDIO_EXT))}.",
            )
        vtmp = Path(tempfile.mkstemp(suffix=vext, dir=str(settings.storage_dir))[1])
        with vtmp.open("wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        voces_saved.append((vtmp, up.filename))

    # Regla "un audio por anuncio": si hay audios, deben ser exactamente N. El
    # front ya lo bloquea; esto es el cinturón por si acaso. Sin audios: permitido.
    n = max(0, min(20, int(num_clips)))
    if voces_saved and n > 0 and len(voces_saved) != n:
        for p, _ in saved:
            p.unlink(missing_ok=True)
        for vp, _ in voces_saved:
            vp.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"Sube exactamente {n} audio(s), uno por anuncio (enviaste {len(voces_saved)}).",
        )

    # Gancho SUBIDO por anuncio (opcional): un video por anuncio + sus segundos.
    # hook_meta es un JSON [{ad, secs}] alineado a hook_videos (mismo orden).
    hook_tmps: list[tuple[int, float, Path, str]] = []
    guias_saved: list[tuple[Path, str]] = []  # video-GUÍA sobrepuesto (PiP), opcional

    def _cleanup_all() -> None:
        for p, _ in saved:
            p.unlink(missing_ok=True)
        for vp, _ in voces_saved:
            vp.unlink(missing_ok=True)
        for _ad, _secs, hp, _hn in hook_tmps:
            hp.unlink(missing_ok=True)
        for gp, _gn in guias_saved:
            gp.unlink(missing_ok=True)

    meta_list: list = []
    if hook_meta.strip():
        try:
            parsed = json.loads(hook_meta)
            if isinstance(parsed, list):
                meta_list = parsed
        except Exception:  # noqa: BLE001 — meta opcional/malformada -> sin ganchos
            meta_list = []
    reales = [up for up in hook_videos if up.filename]
    for i, up in enumerate(reales):
        hext = Path(up.filename).suffix.lower()
        if hext not in ALLOWED_EXT:
            _cleanup_all()
            raise HTTPException(
                status_code=400,
                detail=f"Gancho no soportado ({hext or 'sin extensión'}). "
                       f"Usa: {', '.join(sorted(ALLOWED_EXT))}.",
            )
        m = meta_list[i] if i < len(meta_list) and isinstance(meta_list[i], dict) else {}
        try:
            ad = int(m.get("ad", i))
            secs = float(m.get("secs", 2.0))
        except (TypeError, ValueError):
            ad, secs = i, 2.0
        if not (0 <= ad < max(1, n)):
            continue  # gancho para un anuncio que no existe: se ignora
        htmp = Path(tempfile.mkstemp(suffix=hext, dir=str(settings.storage_dir))[1])
        with htmp.open("wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        hook_tmps.append((ad, secs, htmp, up.filename))

    # Video-GUÍA sobrepuesto (PiP), opcional. Se sobrepone al anuncio (si subes una,
    # se usa en todos los anuncios; el render la asigna por posición con módulo).
    for up in (g for g in guias if g.filename):
        gext = Path(up.filename).suffix.lower()
        if gext not in ALLOWED_GUIDE_EXT:
            _cleanup_all()
            raise HTTPException(
                status_code=400,
                detail=f"Guía no soportada ({gext or 'sin extensión'}). "
                       f"Usa: {', '.join(sorted(ALLOWED_GUIDE_EXT))}.",
            )
        gtmp = Path(tempfile.mkstemp(suffix=gext, dir=str(settings.storage_dir))[1])
        with gtmp.open("wb") as f:
            while chunk := await up.read(1 << 20):
                f.write(chunk)
        guias_saved.append((gtmp, up.filename))

    job_id = manager.submit(saved, [], mode, voces_saved, n, guias_saved,
                            use_music=use_music in ("1", "true", "True"),
                            intro_tmp=intro_saved, style=style or "", params=params,
                            hook_tmps=hook_tmps)
    return JSONResponse({"job_id": job_id, "n_videos": len(saved), "mode": mode},
                        status_code=201)


@app.get("/api/styles")
async def list_styles() -> JSONResponse:
    """Catálogo de los 5 estilos de edición (para el selector del editor)."""
    from app.pipeline import styles
    items = [{"id": k, "nombre": v["nombre"]} for k, v in styles.STYLES.items()]
    return JSONResponse({"styles": items, "default": styles.DEFAULT_STYLE})


def _sample_hook_moments(
    paths: list[Path], segs_by_video: list[list], rng, target: int
) -> list:
    """Momentos de gancho MUESTREADOS por todo el material (sin IA).

    Da más opciones y cubre videos sin voz. Con transcripción, muestrea inicios de
    frases habladas (mejores ganchos); sin ella, reparte tiempos a lo largo del
    video. ``rng`` con entropía del sistema -> distinto en cada llamada, de modo
    que el botón "Volver a buscar" muestra candidatos nuevos cada vez.
    """
    from app.pipeline import audio as _audio
    from app.pipeline.analyze import Moment

    n = len(paths)
    if n == 0:
        return []
    por_video = max(1, target // n + 1)
    out: list = []
    for vid, src in enumerate(paths):
        segs = segs_by_video[vid] if vid < len(segs_by_video) else []
        if segs:
            elegidos = rng.sample(list(segs), min(len(segs), por_video))
            for s in elegidos:
                start = max(0.0, float(getattr(s, "start", 0.0)))
                fin = float(getattr(s, "end", start + 1.8))
                dur = min(2.4, max(1.2, fin - start))
                txt = (getattr(s, "text", "") or "").strip()
                razon = (txt[:70] + ("…" if len(txt) > 70 else "")) if txt \
                    else f"Momento del video {vid + 1}"
                out.append(Moment(vid, round(start, 2), round(start + dur, 2), 45.0, razon))
        else:
            try:
                dur_v = float(_audio.probe_video_duration(src) or 0.0)
            except Exception:  # noqa: BLE001 — sin duración, saltamos este video
                dur_v = 0.0
            if dur_v < 1.2:
                continue
            ranuras = max(1, por_video)
            for k in range(ranuras):
                base = dur_v * (k + 0.5) / ranuras
                jitter = rng.uniform(-0.35, 0.35) * (dur_v / ranuras)
                start = min(max(0.0, base + jitter), max(0.0, dur_v - 1.6))
                out.append(Moment(vid, round(start, 2), round(start + 1.8, 2), 35.0,
                                  f"Momento del video {vid + 1}"))
    rng.shuffle(out)
    return out


def _merge_hook_moments(ai_moments: list, sampled: list, *, cap: int) -> list:
    """Une ganchos de IA (primero: traen 'razón') y muestreados, sin duplicar
    ventanas cercanas (mismo video y ~2 s) y con un tope de candidatos."""
    fusion: list = []
    vistos: set = set()
    for m in list(ai_moments) + list(sampled):
        clave = (int(getattr(m, "video_id", -1)),
                 int(float(getattr(m, "start", 0.0)) // 2))
        if clave in vistos:
            continue
        vistos.add(clave)
        fusion.append(m)
        if len(fusion) >= cap:
            break
    return fusion


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

        import random as _random

        try:
            variant = max(0, int(payload.get("variant") or payload.get("ronda") or 0))
        except (TypeError, ValueError):
            variant = 0

        # 1) Ganchos de la IA (en rondas siguientes pide ángulos DISTINTOS).
        try:
            ai_moments = _an.analyze_hooks(segs_by_video, variant=variant)
        except Exception as exc:  # noqa: BLE001 — sin IA seguimos con muestreo
            logger.warning("analyze_hooks falló (%s); uso solo muestreo.", exc)
            ai_moments = []

        # 2) Muestreo por TODO el material (entropía del sistema -> nuevo cada clic).
        rng = _random.Random()
        sampled = _sample_hook_moments(paths, segs_by_video, rng, target=10)

        # 3) Mezcla: IA primero, luego muestreados; sin duplicar; tope de candidatos.
        moments = _merge_hook_moments(ai_moments, sampled, cap=14)

        cands: list[dict] = []
        for idx, m in enumerate(moments):
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
    """Qué trabajos hay en cola y cuál se está procesando (hay un solo worker).

    A prueba de balas: si algo falla al leer la cola, devolvemos una cola vacía en
    vez de un 500 (la cola es solo informativa; nunca debe tumbar el editor)."""
    try:
        return JSONResponse(manager.queue_info())
    except Exception:  # noqa: BLE001
        logger.exception("Fallo leyendo la cola; devuelvo vacía")
        return JSONResponse({"en_cola": [], "en_proceso": [], "total_en_cola": 0})


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
