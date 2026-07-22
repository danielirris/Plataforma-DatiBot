"""
Tema 'amigurumi'. Expone lo que el motor necesita:
  NAME, FONTS, render_block(block), wrap(body, title)

Añadir un tipo de bloque nuevo = añadir una función y registrarla en RENDERERS.
Crear otro tema = copiar esta carpeta y cambiar theme.css + components.py.
"""
import logging
from pathlib import Path
from themes import _base
from . import components as C

logger = logging.getLogger(__name__)

NAME = "amigurumi"
_DIR = Path(__file__).parent
_FONTS_DIR = _DIR / "fonts"

FONTS = {
    "Fredoka-Bold": _FONTS_DIR / "Fredoka-Bold.ttf",
    "Fredoka-SemiBold": _FONTS_DIR / "Fredoka-SemiBold.ttf",
    "Fredoka-Medium": _FONTS_DIR / "Fredoka-Medium.ttf",
    "Poppins-Regular": _FONTS_DIR / "Poppins-Regular.ttf",
    "Poppins-Medium": _FONTS_DIR / "Poppins-Medium.ttf",
    "Poppins-Bold": _FONTS_DIR / "Poppins-Bold.ttf",
}

# CSS con la ruta real de las fuentes inyectada (para el incrustado base64)
CSS = (_DIR / "theme.css").read_text(encoding="utf-8").replace(
    "FONTS/", f"{_FONTS_DIR.as_posix()}/"
)

DECO = (f'<div class="pagedeco"><div class="a">{C.flower(150, 0.5)}</div>'
        f'<div class="b">{C.flower(170, 0.45)}</div></div>')


# ---------- renderers por tipo de bloque ----------
def _cover(b):
    lat = f'<span class="klat">{b["latch"]}</span>' if b.get("latch") else ""
    welcome = "".join(f"<p>{p}</p>" for p in b.get("welcome", []))
    wpanel = f'<div class="wpanel">{welcome}</div>' if welcome else ""
    sub = f'<p class="ksub">{b["subtitle"]}</p>' if b.get("subtitle") else ""
    tag = f'<p class="tagline">{b["tagline"]}</p>' if b.get("tagline") else ""
    sub_brand = f'<small>{b["brand_sub"]}</small>' if b.get("brand_sub") else ""
    brand = f'<div class="brand">{b.get("brand","")}{sub_brand}</div>' if b.get("brand") else ""
    return (f'<section class="cover">'
            f'<div class="deco" style="top:26mm;left:22mm">{C.bird(76)}</div>'
            f'<div class="deco" style="top:22mm;right:24mm">{C.doodle(120)}</div>'
            f'<div class="deco" style="bottom:40mm;right:28mm">{C.flower(80,0.7)}</div>'
            f'<div class="in"><h1 class="ktitle">{b["title"]} {lat}</h1>{sub}{wpanel}{tag}{brand}</div>'
            f'</section>')


def _section(b):
    eb = f'<div class="sec-eyebrow">{b["eyebrow"]}</div>' if b.get("eyebrow") else ""
    return (f'<div class="section">{eb}'
            f'<h2 class="sec-title">{b["title"]}</h2>{C.FLOURISH}</div>')


def _paragraph(b):
    return f'<p class="para">{b["text"]}</p>'


def _list(b):
    items = "".join(f"<li>{it}</li>" for it in b.get("items", []))
    return f'<ul class="blist">{items}</ul>'


def _card(b):
    if b.get("link"):
        link = f'<span class="tri"></span><a class="cardlink" href="{b["link"]}">{b.get("link_text", b["link"])}</a>'
    elif b.get("link_text"):
        link = f'<span class="tri"></span><span class="cardnolink">{b["link_text"]}</span>'
    else:
        link = ""
    body = f'<p class="cardbody">{b["body"]}</p>' if b.get("body") else ""
    return f'<div class="card"><div class="cardname">{b["name"]}{link}</div>{body}</div>'


def _image(b):
    cap = f'<figcaption class="figcap">{b["caption"]}</figcaption>' if b.get("caption") else ""
    return (f'<figure class="photo"><div class="frame">'
            f'<img src="{b["src"]}" alt="{b.get("caption","")}"></div>{cap}</figure>')


def _callout(b):
    kind = b.get("kind", "note")
    tag = f'<span class="tag">{b["tag"]}</span>' if b.get("tag") else ""
    return f'<div class="callout {kind}">{tag}<p>{b["text"]}</p></div>'


def _chips(b):
    chips = "".join(f'<span class="chip">{it}</span>' for it in b.get("items", []))
    return f'<div class="chips">{chips}</div>'


def _divider(b):
    return C.DIVIDER


def _closing(b):
    small = f'<div class="csmall">{b["small"]}</div>' if b.get("small") else ""
    brand = f'<div class="cbrand">{b["brand"]}</div>' if b.get("brand") else ""
    return (f'<section class="closing">'
            f'<div style="margin-bottom:6mm">{C.flower(58,1)}</div>'
            f'<div class="cbig">{b["big"]}</div>{small}{brand}</section>')


def _html(b):
    """Gráfico en HTML que escribe la IA (ficha/tabla). La IA emite bloques
    ``html`` por defecto; este tema NO los tenía y lanzaba ValueError → 500 al
    generar el PDF. Se sanea con la lista blanca de _base (fuera script/style/iframe
    y manejadores de eventos) porque no confiamos a ciegas en el HTML del modelo."""
    cuerpo = _base._sanear_html(str(b.get("html") or ""))
    if not cuerpo.strip():
        return ""
    titulo = f'<div class="ftitle">{b["title"]}</div>' if b.get("title") else ""
    return f'<figure class="figura">{titulo}{cuerpo}</figure>'


RENDERERS = {
    "cover": _cover, "section": _section, "paragraph": _paragraph, "list": _list,
    "card": _card, "image": _image, "callout": _callout, "chips": _chips,
    "divider": _divider, "closing": _closing, "html": _html,
}


def render_block(block: dict) -> str:
    """Renderiza un bloque. TOLERANTE a propósito: ni un tipo desconocido ni un
    bloque mal formado deben tumbar el PDF entero con un 500 — el ebook lo arma la
    IA y su salida no es determinista. Un bloque problemático se omite y se sigue."""
    t = block.get("type")
    fn = RENDERERS.get(t)
    if fn is None:
        # Tipo no soportado por este tema: en vez de reventar, degradamos a su
        # html/texto saneado si lo trae; si no, se omite.
        crudo = _base._sanear_html(str(block.get("html") or block.get("text") or ""))
        if crudo.strip():
            return f'<div class="para">{crudo}</div>'
        logger.warning("Bloque de tipo %r omitido (no soportado por amigurumi)", t)
        return ""
    try:
        return fn(block)
    except Exception:  # noqa: BLE001 - un bloque roto no debe tumbar el ebook
        logger.exception("Bloque %r mal formado; se omite", t)
        return ""


def wrap(body: str, title: str = "Ebook") -> str:
    return (f'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
            f'<title>{title}</title><style>{CSS}</style></head>'
            f'<body>{DECO}{body}</body></html>')
