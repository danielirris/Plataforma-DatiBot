"""
render.py — El corazón del motor. NO usa IA.

Un documento es un dict:
    {"title": "...", "theme": "amigurumi", "blocks": [ {...}, {...} ]}

Cada bloque tiene un "type" (cover, section, paragraph, card, list,
image, callout, divider, closing). El TEMA sabe cómo dibujar cada tipo.
El motor solo orquesta: bloques -> HTML (con el tema) -> incrustar
recursos -> PDF.
"""
from pathlib import Path
from weasyprint import HTML

from .assets import embed_images, embed_fonts


def build_html(doc: dict, theme, base_dir: Path) -> str:
    """Convierte el documento en un HTML autocontenido usando el tema dado."""
    body = "".join(theme.render_block(b) for b in doc.get("blocks", []))
    html = theme.wrap(body, title=doc.get("title", "Ebook"))
    html = embed_fonts(html, theme.FONTS)
    html = embed_images(html, base_dir)
    return html


def to_pdf(html: str, out_path: str) -> str:
    HTML(string=html).write_pdf(out_path)
    return out_path


def generate(doc: dict, theme, base_dir: Path, out_pdf: str, out_html: str | None = None) -> str:
    """Atajo: documento + tema -> archivo(s). Devuelve la ruta del PDF."""
    html = build_html(doc, theme, base_dir)
    if out_html:
        Path(out_html).write_text(html, encoding="utf-8")
    to_pdf(html, out_pdf)
    return out_pdf
