"""
assets.py — Incrustado de recursos para dejar un HTML/PDF autocontenido.

Dos funciones clave, ambas deterministas (sin IA):
  - embed_images: encuentra <img src="ruta local">, corrige orientación,
    redimensiona y comprime, y sustituye por un data-uri base64.
  - embed_fonts: encuentra url('...ttf') y lo sustituye por base64.
"""
import base64
import re
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageOps

# Lado largo máximo (px) y calidad JPEG para las fotos incrustadas.
MAX_SIDE = 1400
JPEG_QUALITY = 82


def _img_to_datauri(path: Path) -> str:
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)          # corrige rotación de fotos de teléfono
    im = im.convert("RGB")
    w, h = im.size
    scale = min(1, MAX_SIDE / max(w, h))
    if scale < 1:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


def embed_images(html: str, base_dir: Path) -> str:
    """Sustituye cada <img src="X"> local por su versión base64."""
    def repl(m):
        src = m.group(2)
        if src.startswith("data:") or src.startswith("http"):
            return m.group(0)
        p = (base_dir / src).resolve()
        if not p.exists():
            return m.group(0)  # se deja tal cual si no existe (se verá el alt)
        return f'{m.group(1)}{_img_to_datauri(p)}{m.group(3)}'
    return re.sub(r'(<img[^>]*\ssrc=")([^"]+)(")', repl, html)


def embed_fonts(html: str, fonts: dict) -> str:
    """fonts: {nombre_referencia: ruta_ttf}. Sustituye url('ruta') -> base64."""
    for _, path in fonts.items():
        path = Path(path)
        if not path.exists():
            continue
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        datauri = f"url(data:font/ttf;base64,{b64})"
        html = html.replace(f"url('{path.as_posix()}')", datauri)
        html = html.replace(f'url("{path.as_posix()}")', datauri)
    return html
