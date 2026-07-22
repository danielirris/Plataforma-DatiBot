"""EbookForge web — API + UI mínima. El mismo motor, expuesto por HTTP.
Ejecuta:  uvicorn app:app --reload    (luego abre http://localhost:8000)"""
import asyncio, json, shutil, tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from themes import get_theme, list_themes
from engine import generate
from engine.render import build_html

app = FastAPI(title="EbookForge")

# WeasyPrint (render a PDF) es pesado en RAM: incrusta todas las imágenes en un
# único HTML y lo rasteriza en memoria. En el host compartido con el extractor
# (Chromium/FFmpeg), varios renders a la vez podían disparar el OOM del contenedor.
# Este semáforo limita cuántos corren en paralelo.
_LIMITE = asyncio.Semaphore(2)


def _leer_doc(content: str) -> dict:
    """Parsea el JSON del cuerpo; 400 claro si viene vacío/corrupto (antes: 500)."""
    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"content no es JSON válido: {e}")


async def _volcar_imagenes(images: list[UploadFile], imgdir: Path) -> None:
    """Guarda las imágenes subidas en imgdir (nombre saneado, sin rutas)."""
    for up in images:
        if up.filename:
            (imgdir / Path(up.filename).name).write_bytes(await up.read())


@app.get("/", response_class=HTMLResponse)
def home():
    return Path("static/index.html").read_text(encoding="utf-8")


@app.get("/themes")
def themes():
    return {"themes": list_themes()}


@app.get("/healthz")
def healthz():
    """Sonda de vida para el HEALTHCHECK del contenedor (EasyPanel)."""
    return {"ok": True}


@app.post("/generate")
async def gen(content: str = Form(...), theme: str = Form("amigurumi"),
              images: list[UploadFile] = File(default=[])):
    doc = _leer_doc(content)
    workdir = Path(tempfile.mkdtemp())
    try:
        imgdir = workdir / "imagenes"; imgdir.mkdir()
        await _volcar_imagenes(images, imgdir)
        out = workdir / "ebook.pdf"
        # run_in_threadpool: generate() es SÍNCRONO y bloqueante; sin esto tomaría
        # el event loop del único worker y CUALQUIER otra petición (incluido el
        # healthcheck) quedaría esperando. El semáforo acota el pico de RAM.
        async with _LIMITE:
            await run_in_threadpool(generate, doc, get_theme(theme), imgdir, str(out))
    except HTTPException:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except Exception as e:  # noqa: BLE001
        shutil.rmtree(workdir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {e}")
    # El workdir se borra DESPUÉS de enviar el PDF (BackgroundTask), no antes: si lo
    # borráramos ya, FileResponse no encontraría el archivo. ANTES no se borraba
    # nunca y /tmp se llenaba con miles de carpetas hasta que las escrituras
    # fallaban con 500 (el "a veces falla" de los ebooks tras días de uso).
    return FileResponse(
        str(out), media_type="application/pdf", filename="ebook.pdf",
        background=BackgroundTask(shutil.rmtree, str(workdir), ignore_errors=True),
    )


@app.post("/preview", response_class=HTMLResponse)
async def preview(content: str = Form(...), theme: str = Form("amigurumi"),
                  images: list[UploadFile] = File(default=[])):
    """Igual que /generate pero devuelve el HTML del tema (sin pasar a PDF).
    Rápido: sirve para previsualizar un módulo dentro de la app."""
    doc = _leer_doc(content)
    workdir = Path(tempfile.mkdtemp())
    try:
        imgdir = workdir / "imagenes"; imgdir.mkdir()
        await _volcar_imagenes(images, imgdir)
        # build_html incrusta las imágenes como base64 en el HTML devuelto, así que
        # el workdir se puede borrar en cuanto retorna (finally). También en hilo
        # aparte para no bloquear el loop.
        async with _LIMITE:
            return await run_in_threadpool(build_html, doc, get_theme(theme), imgdir)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo generar la vista previa: {e}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
