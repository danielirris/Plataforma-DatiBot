"""EbookForge web — API + UI mínima. El mismo motor, expuesto por HTTP.
Ejecuta:  uvicorn app:app --reload    (luego abre http://localhost:8000)"""
import asyncio, json, shutil, tempfile, warnings
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from PIL import Image
from themes import get_theme, list_themes
from engine import generate
from engine.render import build_html
from service_auth import ServiceAuthMiddleware

app = FastAPI(title="EbookForge")
# Auth propia (token interno del web o Basic Auth del navegador). Ver service_auth.py.
app.add_middleware(ServiceAuthMiddleware)

# WeasyPrint (render a PDF) es pesado en RAM: incrusta todas las imágenes en un
# único HTML y lo rasteriza en memoria. En el host compartido con el extractor
# (Chromium/FFmpeg), varios renders a la vez podían disparar el OOM del contenedor.
# Este semáforo limita cuántos corren en paralelo.
_LIMITE = asyncio.Semaphore(2)

# CSP de la vista previa: solo estilos inline y recursos data: (fuentes/imágenes ya
# incrustadas). Sin scripts, sin formularios, sin red. "sandbox" = origen opaco.
PREVIEW_CSP = ("default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; "
               "font-src data:; base-uri 'none'; form-action 'none'; sandbox")


# Límites de entrada: antes no había ninguno (cada imagen se leía entera a RAM y
# Pillow abría cualquier tamaño → una "bomba de descompresión" tumbaba el contenedor).
MAX_IMAGEN_BYTES = 15 * 1024 * 1024     # por imagen
MAX_TOTAL_BYTES = 120 * 1024 * 1024     # todas las imágenes de una petición
MAX_IMAGENES = 80
MAX_CONTENT_CHARS = 5_000_000           # JSON del documento
EXT_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
Image.MAX_IMAGE_PIXELS = 60_000_000     # ~60 MP
# Pillow solo AVISA entre 1× y 2× el límite: se convierte el aviso en error.
warnings.simplefilter("error", Image.DecompressionBombWarning)


def _tema(nombre: str):
    """Tema validado contra los existentes → 400 claro en vez de un 500."""
    try:
        return get_theme(nombre)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _leer_doc(content: str) -> dict:
    """Parsea el JSON del cuerpo; 400 claro si viene vacío/corrupto (antes: 500)."""
    if len(content or "") > MAX_CONTENT_CHARS:
        raise HTTPException(status_code=413, detail="El contenido del ebook es demasiado grande.")
    try:
        return json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"content no es JSON válido: {e}")


async def _volcar_imagenes(images: list[UploadFile], imgdir: Path) -> None:
    """Guarda las imágenes subidas en imgdir (nombre saneado, sin rutas), con topes
    de cantidad, tamaño por imagen y tamaño total. Lee por trozos (nunca entera)."""
    reales = [up for up in images if up.filename]
    if len(reales) > MAX_IMAGENES:
        raise HTTPException(status_code=413, detail=f"Máximo {MAX_IMAGENES} imágenes por ebook.")
    total = 0
    for up in reales:
        nombre = Path(up.filename).name
        if Path(nombre).suffix.lower() not in EXT_IMAGEN:
            raise HTTPException(status_code=400, detail=f"Formato de imagen no soportado: {nombre}")
        size = 0
        with (imgdir / nombre).open("wb") as f:
            while chunk := await up.read(1 << 20):
                size += len(chunk)
                total += len(chunk)
                if size > MAX_IMAGEN_BYTES:
                    raise HTTPException(status_code=413,
                                        detail=f"'{nombre}' supera {MAX_IMAGEN_BYTES // 2**20} MB.")
                if total > MAX_TOTAL_BYTES:
                    raise HTTPException(status_code=413,
                                        detail=f"Las imágenes superan {MAX_TOTAL_BYTES // 2**20} MB en total.")
                f.write(chunk)


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
            await run_in_threadpool(generate, doc, _tema(theme), imgdir, str(out))
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
            html = await run_in_threadpool(build_html, doc, _tema(theme), imgdir)
        # El HTML lleva texto de la IA/usuario: se sirve con una CSP que impide
        # ejecutar scripts y cargar recursos externos (evita XSS en este origen).
        return HTMLResponse(html, headers={"Content-Security-Policy": PREVIEW_CSP})
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"No se pudo generar la vista previa: {e}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
