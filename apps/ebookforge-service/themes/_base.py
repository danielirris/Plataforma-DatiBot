"""
_base.py — Estructura común de TODOS los temas.

La maquetación se escribe UNA vez aquí (BASE_CSS), usando variables (tokens).
Cada tema solo define sus tokens (paleta + fuentes) y sus adornos SVG.
Así, crear un tema nuevo = elegir colores, fuentes y 3-4 dibujitos.

Un tema debe exponer:
    NAME, FONTS(dict), CSS(str: @font-face + :root tokens),
    DECO, COVER_DECO, FLOURISH, DIVIDER, CLOSING_MOTIF (str HTML/SVG)
y delegar render_block/wrap a este módulo.
"""
import re

BASE_CSS = r"""
*{box-sizing:border-box}
@page{size:A4;margin:22mm 17mm 18mm;background:var(--bg);
  @top-right{content:string(runhead);font-family:var(--font-display);font-weight:600;font-size:8.5pt;color:var(--soft)}
  @bottom-center{content:counter(page);font-family:var(--font-body);font-weight:500;font-size:9pt;color:var(--soft)}}
@page cover{margin:0;@top-right{content:none}@bottom-center{content:none}}
@page plain{@top-right{content:none}@bottom-center{content:none}}
html{-weasy-hyphens:none}
body{font-family:var(--font-body);color:var(--ink);font-size:11pt;line-height:1.5;
     print-color-adjust:exact;-weasy-print-color-adjust:exact}
p{margin:0}
.pagedeco{position:fixed;inset:0;z-index:-1;pointer-events:none}
.pagedeco .a{position:absolute;top:-12mm;left:-10mm}
.pagedeco .b{position:absolute;bottom:-12mm;right:-10mm}
.deco{position:absolute;z-index:1;pointer-events:none}

.cover{page:cover;position:relative;width:210mm;height:297mm;overflow:hidden;background:var(--bg);page-break-after:always}
.cover .in{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:24mm 22mm}
.ktitle{font-family:var(--font-display);font-weight:700;color:var(--accent);font-size:34pt;line-height:1.07;margin:0 0 3mm;letter-spacing:var(--title-ls,0)}
.klat{display:inline-block;margin-top:3mm;color:var(--accent-ink);background:var(--accent);padding:1mm 7mm;border-radius:var(--pill);font-size:24pt}
.ksub{font-family:var(--font-display);font-weight:500;color:var(--soft);font-size:15pt;margin:0 0 8mm}
.wpanel{background:var(--wash);border:1.5px solid var(--line);border-radius:var(--radius);padding:8mm 9mm;max-width:152mm;margin:0 auto}
.wpanel p{font-size:11.5pt;line-height:1.6;margin:0 0 3mm}.wpanel p:last-child{margin:0}
.wpanel strong{color:var(--accent);font-weight:700}
.tagline{font-family:var(--font-display);font-weight:500;color:var(--accent);font-size:13pt;margin:7mm auto 0;line-height:1.4}
.brand{margin-top:9mm;font-family:var(--font-body);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:8.5pt;color:var(--accent)}
.brand small{display:block;margin-top:2mm;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--ink2);font-size:8.5pt}

.section{margin:3mm 0 4mm;break-after:avoid;string-set:runhead content(text)}
.sec-eyebrow{font-family:var(--font-display);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:9pt;color:var(--soft)}
.sec-title{font-family:var(--font-display);font-weight:700;color:var(--accent);font-size:25pt;margin:1mm 0 0;letter-spacing:var(--title-ls,0)}
.flourish{display:block;width:34mm;height:9px;margin:2.5mm 0 0}

.card{position:relative;margin:0 0 5.5mm;padding-left:9mm;break-inside:avoid}
.card::before{content:'';position:absolute;left:0;top:2.2mm;width:4mm;height:4mm;border-radius:var(--dot,50%);background:var(--soft);border:1.3mm solid var(--accent)}
.cardname{font-family:var(--font-display);font-weight:700;color:var(--ink);font-size:12pt;line-height:1.3}
.tri::after{content:'';display:inline-block;margin:0 2.2mm;border-left:7px solid var(--accent);border-top:5px solid transparent;border-bottom:5px solid transparent;vertical-align:middle}
.cardlink{font-family:var(--font-body);font-weight:500;color:var(--accent2);font-size:10.5pt;text-decoration:underline;text-decoration-color:var(--soft)}
.cardnolink{font-family:var(--font-body);font-weight:500;color:var(--ink2);font-size:10pt;font-style:italic}
.cardbody{margin:1.4mm 0 0;font-size:10.5pt;line-height:1.5;color:var(--ink2)}

.para{margin:0 0 3mm;font-size:11pt;line-height:1.55}
.blist{margin:0 0 4mm;padding-left:0;list-style:none}
.blist li{position:relative;padding:1mm 0 1mm 8mm;font-size:10.8pt;line-height:1.45}
.blist li::before{content:'';position:absolute;left:2mm;top:3.4mm;width:3mm;height:3mm;border-radius:var(--dot,50%);background:var(--accent)}

.photo{margin:5mm 0 6mm;break-inside:avoid;text-align:center}
.frame{display:inline-block;border-radius:var(--radius);overflow:hidden;border:2px solid var(--line);line-height:0}
.frame img{display:block;max-width:150mm;max-height:100mm;width:auto;height:auto}
.figcap{text-align:center;font-family:var(--font-display);font-weight:500;color:var(--soft);font-size:10.5pt;margin:3mm 0 0}
/* Foto GRANDE: ocupa el ancho del texto y respira. Se usa para la que abre el
   capítulo, para que no salgan todas del mismo tamaño. */
.photo.big .frame{display:block;border:0}
.photo.big .frame img{max-width:100%;max-height:120mm;width:100%;object-fit:cover}
/* Foto SUAVE: difuminada hacia los bordes; queda bonita bajo un texto. */
.photo.soft .frame{border:0;border-radius:calc(var(--radius) + 6px)}
.photo.soft .frame img{max-width:100%;max-height:95mm;width:100%;object-fit:cover;
  -webkit-mask-image:radial-gradient(120% 100% at 50% 45%, #000 60%, transparent 100%);
  mask-image:radial-gradient(120% 100% at 50% 45%, #000 60%, transparent 100%)}
/* Gráfico HTML que escribe la IA (fichas de receta, tablas, pasos…): se pinta
   con los colores del tema, sin generar imágenes. */
.figura{margin:5mm 0 6mm;break-inside:avoid;border:1.5px solid var(--line);
  border-radius:calc(var(--radius) + 4px);background:var(--wash);padding:6mm 6mm 5mm}
.figura .ftitle{font-family:var(--font-display);font-weight:700;color:var(--accent);
  font-size:13pt;margin:0 0 3mm;letter-spacing:var(--title-ls)}
.figura table{width:100%;border-collapse:collapse;font-size:10.5pt}
.figura th,.figura td{text-align:left;padding:2mm 2.5mm;border-bottom:1px solid var(--line)}
.figura th{font-family:var(--font-display);color:var(--accent);font-weight:700}
.figura tr:last-child td{border-bottom:0}
.figura ul,.figura ol{margin:0;padding-left:5mm;font-size:10.5pt}
.figura li{margin:1.2mm 0}
.figura .grid2{display:flex;gap:5mm}
.figura .grid2>*{flex:1}
.figura .kv{display:flex;justify-content:space-between;gap:3mm;padding:1.6mm 0;
  border-bottom:1px dashed var(--line);font-size:10.5pt}
.figura .kv:last-child{border-bottom:0}
.figura .kv b{color:var(--accent)}
.figura .badge{display:inline-block;background:var(--accent);color:var(--accent-ink);
  border-radius:var(--pill);padding:1mm 3mm;font-size:9.5pt;font-weight:700;margin:0 1mm 1mm 0}
.figura .step{display:flex;gap:3mm;align-items:flex-start;margin:2mm 0;font-size:10.5pt}
.figura .step .n{flex:none;width:6mm;height:6mm;border-radius:50%;background:var(--accent);
  color:var(--accent-ink);font-weight:700;font-size:9pt;text-align:center;line-height:6mm}

.callout{border-left:3mm solid var(--accent);background:var(--wash);border-radius:0 var(--radius) var(--radius) 0;padding:5mm 6mm;margin:0 0 5mm;break-inside:avoid}
.callout .tag{display:block;font-family:var(--font-display);font-weight:600;text-transform:uppercase;letter-spacing:.1em;font-size:8.5pt;color:var(--accent2);margin-bottom:1.5mm}
.callout p{font-size:10.5pt;line-height:1.5}
.callout.sell{border-left-color:var(--sell);background:var(--sell-wash)}.callout.sell .tag{color:var(--sell)}
.callout.danger{border-left-color:var(--danger);background:var(--danger-wash)}.callout.danger .tag{color:var(--danger)}

.chips{font-size:0;margin-top:2mm}
.chip{display:inline-block;font-family:var(--font-display);font-weight:500;font-size:12.5pt;color:var(--accent);background:var(--wash);border:1.5px solid var(--line);border-radius:var(--pill);padding:2.6mm 6.5mm;margin:0 3.5mm 4.5mm 0}

.divider{display:block;width:100%;height:12px;margin:2mm 0 6mm}

.closing{page:plain;page-break-before:always;position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;height:238mm}
.cbig{font-family:var(--font-display);font-weight:700;color:var(--accent);font-size:30pt;line-height:1.1;margin:0 0 3mm;letter-spacing:var(--title-ls,0)}
.csmall{font-family:var(--font-display);font-weight:500;color:var(--soft);font-size:13pt;max-width:120mm;line-height:1.5}
.cbrand{margin-top:10mm;font-family:var(--font-body);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:8.5pt;color:var(--accent)}
"""


# ---------- renderers (HTML común, estilizado por los tokens del tema) ----------
def _cover(t, b):
    lat = f'<span class="klat">{b["latch"]}</span>' if b.get("latch") else ""
    welcome = "".join(f"<p>{p}</p>" for p in b.get("welcome", []))
    wpanel = f'<div class="wpanel">{welcome}</div>' if welcome else ""
    sub = f'<p class="ksub">{b["subtitle"]}</p>' if b.get("subtitle") else ""
    tag = f'<p class="tagline">{b["tagline"]}</p>' if b.get("tagline") else ""
    bsub = f'<small>{b["brand_sub"]}</small>' if b.get("brand_sub") else ""
    brand = f'<div class="brand">{b.get("brand","")}{bsub}</div>' if b.get("brand") else ""
    return (f'<section class="cover">{t.COVER_DECO}'
            f'<div class="in"><h1 class="ktitle">{b["title"]} {lat}</h1>{sub}{wpanel}{tag}{brand}</div></section>')


def _section(t, b):
    eb = f'<div class="sec-eyebrow">{b["eyebrow"]}</div>' if b.get("eyebrow") else ""
    return f'<div class="section">{eb}<h2 class="sec-title">{b["title"]}</h2>{t.FLOURISH}</div>'


def _card(t, b):
    if b.get("link"):
        link = f'<span class="tri"></span><a class="cardlink" href="{b["link"]}">{b.get("link_text", b["link"])}</a>'
    elif b.get("link_text"):
        link = f'<span class="tri"></span><span class="cardnolink">{b["link_text"]}</span>'
    else:
        link = ""
    body = f'<p class="cardbody">{b["body"]}</p>' if b.get("body") else ""
    return f'<div class="card"><div class="cardname">{b["name"]}{link}</div>{body}</div>'


def _image(t, b):
    cap = f'<figcaption class="figcap">{b["caption"]}</figcaption>' if b.get("caption") else ""
    # variante: "big" (grande, a todo el ancho) | "soft" (difuminada) | normal
    var = str(b.get("variant") or "").strip().lower()
    clase = f"photo {var}" if var in ("big", "soft") else "photo"
    return (f'<figure class="{clase}"><div class="frame">'
            f'<img src="{b["src"]}" alt="{b.get("caption","")}"></div>{cap}</figure>')


# Etiquetas permitidas en un bloque `html` (gráfico que escribe la IA). Nada de
# script/style/iframe: el PDF no los necesita y no vamos a confiar a ciegas.
_HTML_OK = re.compile(
    r"</?(?:div|p|span|b|strong|i|em|u|br|hr|small|"
    r"ul|ol|li|table|thead|tbody|tr|th|td|figure|figcaption|h3|h4)\b[^>]*>",
    re.I,
)
_HTML_TAG = re.compile(r"</?[a-zA-Z][^>]*>")


def _sanear_html(bruto: str) -> str:
    """Deja solo etiquetas de maquetación simples y quita atributos peligrosos.

    La IA escribe el gráfico (ficha de receta, tabla de pasos…); el estilo lo
    pone el tema con las clases de `.figura`, así que aquí basta con podar.
    """
    # Fuera bloques enteros que nunca deben entrar.
    limpio = re.sub(r"(?is)<(script|style|iframe|object|embed)[^>]*>.*?</\1\s*>", "", bruto)
    limpio = re.sub(r"(?is)</?(script|style|iframe|object|embed)[^>]*>", "", limpio)
    # Fuera manejadores de eventos y urls javascript:
    limpio = re.sub(r'(?is)\son[a-z]+\s*=\s*(".*?"|\'.*?\'|[^\s>]+)', "", limpio)
    limpio = re.sub(r'(?is)(href|src)\s*=\s*(["\']?)\s*javascript:[^"\'>\s]*\2', r'\1="#"', limpio)
    # Cualquier etiqueta fuera de la lista blanca se descarta (su texto se queda).
    return _HTML_TAG.sub(lambda m: m.group(0) if _HTML_OK.fullmatch(m.group(0)) else "", limpio)


def _html(t, b):
    """Gráfico hecho con HTML por la IA (sin generar imágenes)."""
    cuerpo = _sanear_html(str(b.get("html") or ""))
    if not cuerpo.strip():
        return ""
    titulo = f'<div class="ftitle">{b["title"]}</div>' if b.get("title") else ""
    return f'<figure class="figura">{titulo}{cuerpo}</figure>'


def _closing(t, b):
    small = f'<div class="csmall">{b["small"]}</div>' if b.get("small") else ""
    brand = f'<div class="cbrand">{b["brand"]}</div>' if b.get("brand") else ""
    return (f'<section class="closing">{t.CLOSING_MOTIF}'
            f'<div class="cbig">{b["big"]}</div>{small}{brand}</section>')


def render_block(t, b):
    ty = b.get("type")
    if ty == "cover":     return _cover(t, b)
    if ty == "section":   return _section(t, b)
    if ty == "paragraph": return f'<p class="para">{b["text"]}</p>'
    if ty == "list":      return '<ul class="blist">' + "".join(f"<li>{i}</li>" for i in b.get("items", [])) + '</ul>'
    if ty == "card":      return _card(t, b)
    if ty == "image":     return _image(t, b)
    if ty == "html":      return _html(t, b)
    if ty == "callout":   return f'<div class="callout {b.get("kind","note")}">' + (f'<span class="tag">{b["tag"]}</span>' if b.get("tag") else "") + f'<p>{b["text"]}</p></div>'
    if ty == "chips":     return '<div class="chips">' + "".join(f'<span class="chip">{i}</span>' for i in b.get("items", [])) + '</div>'
    if ty == "divider":   return t.DIVIDER
    if ty == "closing":   return _closing(t, b)
    raise ValueError(f"Bloque desconocido: {ty!r}")


def wrap(t, body, title="Ebook"):
    return (f'<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>{title}</title>'
            f'<style>{t.CSS}{BASE_CSS}</style></head><body>{t.DECO}{body}</body></html>')
